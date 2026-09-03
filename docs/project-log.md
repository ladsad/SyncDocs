# SyncDocs — Project Log & Decision History

A living record of the development timeline, key architectural decisions (ADRs), and current progress across phases.

---

## 1. Timeline & Phase Progress

| Date | Phase / Milestone | Summary | Status |
|---|---|---|---|
| **2026-09-02** | **Project Kickoff & Architecture** | Defined core architecture, zero-knowledge privacy guarantees, content-type plugin model, and phased roadmap in `docs/architecture.md` and `docs/project-description.md`. | Completed |
| **2026-09-02** | **Phase 0: Scaffold & Single-User Editor** | Built Next.js (App Router) + TypeScript + Tailwind scaffold. Implemented Tiptap WYSIWYG Rich Text editor with full formatting toolbar, debounced auto-save, document list dashboard, and Supabase Postgres schema (`supabase/schema.sql`) with local fallback. | Completed |
| **2026-09-02** | **Phase 1: Real-Time Sync (No E2EE)** | Integrated Yjs CRDT with Tiptap via Supabase Realtime broadcast channels (`doc-room:<id>`). Implemented remote awareness for multi-cursor and selection synchronization. | Completed |
| **2026-09-03** | **Phase 2: End-to-End Encryption (E2EE)** | Implemented client-side cryptographic engine using Web Crypto API (ECDH P-256 keypairs, PBKDF2 Master Key derivation, AES-256-GCM Document Keys). Integrated encrypted Yjs binary deltas/snapshots in `SupabaseYjsProvider` and ciphertext envelope storage in Supabase/Local storage. | Completed |
| *Upcoming* | **Phase 3: Sharing & Roles** | Invite flows, permission model (owner/editor/viewer), wrapped DK distribution. | Planned |
| *Upcoming* | **Phase 4: Multi-Style Editing Surfaces** | Markdown (CodeMirror + live preview), LaTeX (CodeMirror + Tier 1 WASM compiler / Tier 2 Local Agent). | Planned |

---

## 2. Architectural Decision Records (ADRs)

### ADR-001: Zero-Knowledge Privacy & Client-Side Compilation
- **Context:** Mainstream editors (Google Docs, Overleaf) process plaintext on servers. LaTeX compilation typically relies on server-side TeXLive.
- **Decision:** SyncDocs's servers must **never** receive plaintext content or LaTeX source. All encryption/decryption is client-side. LaTeX compilation is executed client-side via Tier 1 WASM engine (SwiftLaTeX/Tectonic-wasm with on-demand package CDN) and Tier 2 local agent (`127.0.0.1`), preserving the identical E2EE guarantee for all styles.
- **Status:** Accepted.

### ADR-002: Yjs Binary Updates as Opaque Encrypted Blobs
- **Context:** CRDT collaboration requires merging simultaneous edits while preserving end-to-end encryption.
- **Decision:** Use Yjs as the CRDT engine. Live edit deltas are serialized to binary updates and encrypted via AES-256-GCM before transport. The server acts as an oblivious relay and blob store, delegating merge resolution to clients post-decryption.
- **Status:** Accepted.

### ADR-003: 3-Layer Content-Type Separation
- **Context:** Supporting multiple distinct formats (Rich Text, Markdown, LaTeX, Typst) can lead to tightly coupled spaghetti code.
- **Decision:** Enforce 3 distinct decoupled layers:
  1. *Schema/format layer* (ProseMirror schema vs. raw text source)
  2. *Editing-surface layer* (Tiptap extensions vs. CodeMirror + compile/preview panes)
  3. *Sync layer* (Yjs CRDT binding: `y-prosemirror` / `y-codemirror.next`)
- **Status:** Accepted.

### ADR-004: Phased Build Discipline
- **Context:** Combining WebSockets, CRDTs, asymmetric crypto, and editor mechanics at once makes debugging intractable.
- **Decision:** Follow strict sequential phases: Phase 0 (single-user editor + persistence) -> Phase 1 (live sync without crypto) -> Phase 2 (crypto layer) -> Phase 3 (sharing/roles).
- **Status:** Accepted.

### ADR-005: Supabase Postgres Persistence with Resilient Local Fallback (Phase 0)
- **Context:** Need quick, frictionless development testing of editor mechanics before connecting live Supabase instances.
- **Decision:** Store document records with `id`, `title`, `content_type`, and `content` JSONB. If Supabase environment variables are unset, gracefully fall back to browser `localStorage` with a clear UI banner, enabling instant local testing.
- **Status:** Accepted.

### ADR-006: Supabase Realtime Broadcast as Stateless Transport Provider
- **Context:** Real-time collaboration needs low-latency message passing between peers without deploying a dedicated WebSocket server ($0 cost target).
- **Decision:** Build a custom `SupabaseYjsProvider` utilizing Supabase Realtime Broadcast channels. Broadcast channels forward Base64-encoded Yjs binary diffs and Awareness state without parsing content on the server.
- **Status:** Accepted.

### ADR-007: Yjs State Snapshot Baseline & Two-Way Sync Handshake
- **Context:** Concurrent client initialization caused duplicated text when initializing `Y.Doc` instances from raw JSON independently, and initial handshake messages lacked reciprocal state vector exchanges.
- **Decision:** Persist binary CRDT state (`yjs_state`) snapshots directly to Postgres and restore synchronously on mount. Enforce reciprocal two-way `sync-step-1` state vector exchanges and update queueing during channel subscription.
- **Status:** Accepted.

### ADR-008: Native Web Crypto Key Hierarchy & AES-GCM Envelope Encryption
- **Context:** E2EE requires zero-knowledge security without relying on external server trust or heavy 3rd-party cryptographic bundles.
- **Decision:** Use native Web Crypto API: ECDH P-256 for asymmetric user keypairs, PBKDF2 (SHA-256, 600,000 iterations) for password-derived private key wrapping, and per-document AES-256-GCM Document Keys (DK).
- **Status:** Accepted.

### ADR-009: Oblivious Encrypted Wire Protocol in Realtime Broadcast
- **Context:** Realtime broadcast events must carry encrypted Yjs diffs without leaking document structure or data to the Supabase infrastructure.
- **Decision:** Encapsulate Yjs updates in `{ ciphertext, iv }` envelopes on `doc-update` and `sync-step-2` channels. Clients decrypt binary updates prior to merging into their local `Y.Doc`.
- **Status:** Accepted.

---

## 3. Notable Issues Encountered & Resolutions

### Issue 1: Tiptap v2 / v3 Peer Dependency Mismatch
- **Symptom:** `npm install` failure due to peer conflict between `@tiptap/pm@^2.11.5` and `@tiptap/extension-collaboration@3.x`.
- **Resolution:** Explicitly installed matching v2 collaboration extensions (`@tiptap/extension-collaboration@^2.11.5`, `@tiptap/extension-collaboration-cursor@^2.11.5`).

### Issue 2: Text Duplication on Dual-Tab Connection
- **Symptom:** Opening a document in a secondary tab duplicated the initial text block.
- **Root Cause:** Multiple clients independently called `editor.commands.setContent()` on fresh, empty `Y.Doc` instances before WebSocket sync completed. Yjs treated both as concurrent insertions by distinct clients and concatenated them.
- **Resolution:** Persisted the raw binary Yjs CRDT state snapshot (`yjs_state`) in Postgres and restored it directly into `Y.Doc` on mount so all joining tabs share the exact same CRDT state vector.

### Issue 3: One-Way Realtime Sync & Dropped Pre-Subscription Updates
- **Symptom:** Edits from the joining tab did not propagate to the host tab, and edits made during socket connection were lost.
- **Root Cause:** Handshake only sent updates unidirectionally on `sync-step-1` without sending a reciprocal state vector request, and socket broadcast events fired before `SUBSCRIBED` status were dropped.
- **Resolution:** Upgraded `SupabaseYjsProvider` to enforce a bidirectional `sync-step-1` handshake and an update buffer that automatically flushes queued edits once the channel is subscribed.

---

## 4. Maintenance Guidelines

Whenever a new phase is started/completed or an architectural decision is made:
1. Append the entry to the **Timeline** table above.
2. Record any design choices or trade-offs in the **ADRs** section.
3. Record significant bugs and fixes in the **Notable Issues Encountered** section.
4. Keep `docs/architecture.md` and `docs/project-description.md` synchronized.
