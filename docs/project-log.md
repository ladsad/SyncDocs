# SyncDocs — Project Log & Decision History

A living record of the development timeline, key architectural decisions (ADRs), and current progress across phases.

---

## 1. Timeline & Phase Progress

| Date | Phase / Milestone | Summary | Status |
|---|---|---|---|
| **2026-09-02** | **Project Kickoff & Architecture** | Defined core architecture, zero-knowledge privacy guarantees, content-type plugin model, and phased roadmap in `docs/architecture.md` and `docs/project-description.md`. | Completed |
| **2026-09-02** | **Phase 0: Scaffold & Single-User Editor** | Built Next.js (App Router) + TypeScript + Tailwind scaffold. Implemented Tiptap WYSIWYG Rich Text editor with full formatting toolbar, debounced auto-save, document list dashboard, and Supabase Postgres schema (`supabase/schema.sql`) with local fallback. | Completed |
| **2026-09-02** | **Phase 1: Real-Time Sync (No E2EE)** | Integrated Yjs CRDT with Tiptap via Supabase Realtime broadcast channels (`doc-room:<id>`). Implemented remote awareness for multi-cursor and selection synchronization. | Completed |
| *Upcoming* | **Phase 2: End-to-End Encryption (E2EE)** | User keypairs (X25519), Document Keys (AES-GCM), wrapped key management, and ciphertext-only transport/storage. | Planned |
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

---

## 3. Maintenance Guidelines

Whenever a new phase is started/completed or an architectural decision is made:
1. Append the entry to the **Timeline** table above.
2. Record any design choices or trade-offs in the **ADRs** section.
3. Keep `docs/architecture.md` and `docs/project-description.md` synchronized.
