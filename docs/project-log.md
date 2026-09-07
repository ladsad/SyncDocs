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
| **2026-09-07** | **Phase 3: Sharing, Roles & Key Distribution** | Implemented `permissions` table (`owner`/`editor`/`viewer`), ECDH P-256 asymmetric DK wrapping invite flow, persistent `CryptoVault` session identity, viewer write-suppression in editor & Yjs sync, and full-featured `ShareModal` UI. | Completed |
| **2026-09-07** | **Production Readiness & Vercel Deployment** | Polished web metadata, dynamic document tab synchronization, SVG branding/favicon, live word/character counting, dashboard search, and configured Vercel deployment pipeline. | Completed |
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

### ADR-010: Zero-Knowledge Key Wrapping for Collaborative Sharing
- **Context:** Inviting collaborators to an encrypted document requires securely distributing the AES-256-GCM Document Key without exposing it to the server.
- **Decision:** Implement ECDH P-256 key wrapping (`wrapDocumentKeyForUser` / `unwrapDocumentKey`). Inviters encrypt the Document Key with the invitee's public key using an ephemeral ECDH keypair and store the wrapped record in `document_keys`. Invitees decrypt it locally using their private key upon loading the document.
- **Status:** Accepted.

### ADR-011: Multi-Tiered Client-Side Role Enforcement
- **Context:** Role-based access control (`owner`, `editor`, `viewer`) must be enforced on both the database level (RLS) and client real-time synchronization layer.
- **Decision:** For `viewer` roles, enforce read-only state at 3 levels: (1) disable editing in Tiptap (`editable: false`), (2) suppress auto-save and manual updates to Supabase, and (3) filter outgoing Yjs broadcast updates in `SupabaseYjsProvider` while continuing to receive and decrypt incoming collaborator edits.
- **Status:** Accepted.

### ADR-012: Zero-Knowledge Pending Invitations for Unregistered Users
- **Context:** Inviting an unregistered user by email is problematic under E2EE because their public key does not yet exist in the `users` registry.
- **Decision:** Generate an ephemeral 256-bit AES-GCM invite secret client-side, encrypt the Document Key with this secret, store the ciphertext in `document_invitations(invite_token, wrapped_dk, iv, role, email)`, and deliver the secret exclusively inside the URL hash fragment (`/documents/<id>?invite=<token>#inviteKey=<secret>`). When the invitee opens the link, their client unwraps the DK, auto-initializes their persistent ECDH keypair, claims their role, and transitions to permanent `document_keys` + `permissions` records without server knowledge.
- **Status:** Accepted.

### ADR-013: User Identity & Email Management
- **Context:** Users need an accessible way to view their public key fingerprint, configure their collaborator email address, and register with Supabase without complex third-party auth requirements in local/demo deployments.
- **Decision:** Provide a unified `UserProfileModal` accessible from dashboard and editor navigation bars. Updating the email re-registers the user's existing ECDH public key in Supabase `users` and updates local profile persistence seamlessly.
- **Status:** Accepted.

### ADR-014: Zero-Knowledge Stateless Hosting on Vercel
- **Context:** Deploying to serverless edge platforms (Vercel) requires ensuring no backend state leaks plaintext documents or cryptographic secrets.
- **Decision:** The Next.js web application is built as a static/client-side single-page architecture utilizing public Supabase REST/Realtime endpoints (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). No serverless API routes process or touch document content, maintaining strict compliance with the zero-knowledge model (ADR-001) under production deployment.
- **Status:** Accepted.

### ADR-015: Strict Cryptographic Access Control & Access Denied Gate
- **Context:** Fallback deterministic room key derivation previously permitted uninvited visitors to compute Document Keys and decrypt documents without explicit permission or invite tokens.
- **Decision:** Restrict Document Key resolution so that encrypted documents can only be decrypted if: (1) user is the creator with the local key, (2) user has an entry in `document_keys` and unwraps with their ECDH private key, (3) a `#key=...` direct key is provided, or (4) a valid `?invite=...#inviteKey=...` token is redeemed. Uninvited users receive an "Access Restricted" gate with zero access to the CRDT sync room.
- **Status:** Accepted.

### ADR-016: First-Time User Onboarding & Email Identity Prompt
- **Context:** Collaborators must know the recipient's email address to look up their public key and wrap Document Keys. Relying on auto-generated fallback emails led to unrecognized placeholder identities.
- **Decision:** Introduce a first-visit `OnboardingModal` that prompts new users to provide their email address. The client immediately initializes their ECDH keypair, stores their profile locally, marks onboarding as complete, and publishes their public key to Supabase `users`.
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

### Issue 4: Missing E2EE Schema Columns on Live Supabase Instance
- **Symptom:** `Could not find the 'encrypted_content' column of 'documents' in the schema cache` upon creating an encrypted document.
- **Root Cause:** DDL changes for Phase 2 E2EE (`is_encrypted`, `encrypted_title`, `encrypted_content`, `encrypted_yjs_state`, `users`, `document_keys`) had not been executed on the live Supabase instance.
- **Resolution:** Applied database migration via Supabase DDL runner and triggered PostgREST schema cache reload (`NOTIFY pgrst, 'reload schema'`).

### Issue 5: AES-GCM OperationError on Document Decryption Across Contexts
- **Symptom:** `DOMException: OperationError` at `crypto.subtle.decrypt` when opening or refreshing an encrypted document in a separate tab.
- **Root Cause:** Joining tabs lacked the ephemeral Document Key from the creator's session and fell back to generating an incompatible random key, causing AES-GCM authentication tag verification failure.
- **Resolution:** Implemented multi-tiered Document Key resolution in `CryptoVault` (URL hash `#key=...` -> `localStorage` -> deterministic room key derivation via `deriveDocumentKeyFromId`), guaranteeing key parity across multi-tab sessions and reloads.

---

## 4. Maintenance Guidelines

Whenever a new phase is started/completed or an architectural decision is made:
1. Append the entry to the **Timeline** table above.
2. Record any design choices or trade-offs in the **ADRs** section.
3. Record significant bugs and fixes in the **Notable Issues Encountered** section.
4. Keep `docs/architecture.md` and `docs/project-description.md` synchronized.
