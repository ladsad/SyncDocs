# SyncDocs — Architecture & Build Plan

A collaborative, end-to-end encrypted, format-agnostic document editor.
Stack target: **$0/month** at small scale (Vercel + Supabase free tiers + one small always-on relay).

---

## 1. Product Shape

**Core loop:** start a project in a chosen style → invite collaborators → everyone edits live, cursor-by-cursor → server never sees plaintext.

**"Not limited to LaTeX"** means projects are started *as* a style — Rich Text, Markdown, LaTeX, and other popular open formats — each with its own editing surface suited to that style (WYSIWYG for rich text, source+preview for Markdown, source+compile for LaTeX). This is closer to Overleaf's model generalized beyond LaTeX than to "one document type with everything mixed in."

What's shared across every project style, and is the actual reason adding a new style stays cheap:
- The **sync layer** — Yjs binds to whatever editor/schema a given project style uses (ProseMirror for Rich Text/Markdown, CodeMirror's own CRDT binding for LaTeX/code source). Yjs doesn't care what the content means, only that it's structured text — so it's agnostic to which style is running on top of it.
- The **encryption layer** — every project style's updates get wrapped in the same AES-GCM envelope before leaving the client, regardless of what's inside.
- The **project shell** — auth, sharing, permissions, dashboard, versioning all operate on "a project" generically, never on style-specific internals.

A new project style = a new editing surface (and, for LaTeX specifically, a compile step — see Section 2a) plugged into this shared shell. It does **not** require touching sync or crypto code.

---

## 1a. Style-Specific Editing Surfaces (v1 set)

| Style | Editor | Notes |
|---|---|---|
| Rich Text | Tiptap/ProseMirror, WYSIWYG | Default, most familiar UX |
| Markdown | CodeMirror source pane + live-rendered preview pane | Source is the ground truth; preview is derived, not synced separately |
| **LaTeX** | CodeMirror source pane + compiled PDF preview | **Primary focus style** — see Section 2a for the full compile/security design |
| Typst | CodeMirror source pane + compiled PDF preview, incremental | Secondary style, included alongside LaTeX not instead of it — its compiler is natively incremental/WASM-friendly, so it's cheap to add once the LaTeX pipeline exists, but is not the priority |

Later styles (AsciiDoc, reStructuredText, etc.) follow the same source(+preview) pattern and slot in without new sync/crypto work.

---

## 2a. LaTeX Compilation: Resolved Design (No-Compromise-on-Privacy)

Every other v1 style is edited and *rendered* entirely client-side. LaTeX is the one style that also needs **compiling** to be useful (source → PDF), which is a genuinely different operation from rendering. The naive assumption — "compilation happens on our servers, like Overleaf" — would give LaTeX a weaker privacy guarantee than every other style. **Resolved decision: it won't have one.** Compilation stays on user-controlled devices at every tier; SyncDocs's own infrastructure never sees LaTeX plaintext.

**Tier 1 — Browser WASM compile (default, zero install).**
A WASM-compiled TeX engine (evaluate SwiftLaTeX's PdfTeX/XeTeX builds vs. Tectonic-wasm) runs inside the browser tab. Concrete sizing to plan around:
- Engine binary: ~5–15MB, one-time download per device, cached after first load (service worker cache) — not a per-compile cost.
- Package coverage is the real ceiling, not engine size: bundled packages cover common cases; anything outside the bundle needs on-demand fetching (see below).
- Compile speed: near-native since it's WASM; fine for typical documents, slower for large multi-pass bibliography-heavy projects.
- Memory: the sharpest edge — very large projects (hundreds of pages, many `\input` files, multi-pass bibliographies) can hit browser tab memory limits. This is the actual trigger condition for Tier 2, more than raw speed.

**On-demand package fetching (part of Tier 1, not a separate tier).**
Rather than bundling all of TeXLive, follow SwiftLaTeX's own pattern: a small, stateless package-CDN service (self-hosted, e.g. on Vercel/Cloudflare) that serves standard `.sty`/`.cls` files by name on first use, cached client-side after that. This is safe for the E2EE model because **the request itself carries no user content** — `\usepackage{tikz}` → a request for `tikz.sty`, structurally identical to a CDN serving a public font file. It's the thing that makes Tier 1 viable at real-world package coverage without weakening the privacy guarantee at all.

**Tier 2 — Local Compile Agent (opt-in, full power).**
For users who hit Tier 1's package/memory ceiling: a small native helper (Tectonic is a good fit here — ~20MB, not full TeXLive's multi-GB footprint) running on the user's own machine, listening on `127.0.0.1` only. The browser tab talks to it directly — the same pattern Docker Desktop/Ollama/Postman's Desktop Agent use, since browsers treat `localhost` as an exception to mixed-content blocking, letting `https://syncdocs.app` reach `http://127.0.0.1:PORT`. Since decrypted plaintext already lives in the browser tab (required for editing), handing it to a local process crosses no network boundary — nothing new is exposed. Guard the agent with a pairing token issued by the web app on first connect, so an unrelated local process/page can't hit the port.

**Tier 3 — Bring-Your-Own Compile Server (opt-in, edge case).**
For users who explicitly want server-grade compute without a local install: point SyncDocs at a compile endpoint *they* host and trust. This is the user opting their own plaintext out to infrastructure they control — it never touches SyncDocs's own guarantee.

**Net result:** every project style — including LaTeX — gets the identical, unqualified E2EE claim. No asterisk in onboarding copy or marketing. Tier 1 alone should cover the large majority of real documents; Tiers 2–3 exist specifically for the long tail that hits Tier 1's memory/package ceiling, without weakening the default for everyone else.

---

## 2. The Central Tension: Real-Time CRDT + E2EE

Here's the key insight that makes this buildable:

- **Yjs** (the CRDT library) represents a document as a sequence of binary **updates**. Two clients can apply updates in any order and always converge — that's the whole point of a CRDT.
- Because updates are just binary diffs, you can **encrypt each update as an opaque blob** (AES-GCM) before sending it. The relay server forwards/stores ciphertext bytes without ever needing to read or merge them semantically — Yjs clients do all merging locally, client-side, after decrypting.
- So: **the server's job shrinks to "forward bytes to peers in this room" + "persist bytes."** That's it. No plaintext ever touches your backend.

This is exactly how CryptPad does it, and it's the only practical way to get live cursor-by-cursor collab *and* real E2EE without inventing new cryptographic CRDT research.

**Trade-off you're accepting:** the server can't do anything content-aware — no server-side search, no plaintext previews/thumbnails, no server-rendered exports — unless you explicitly add a "share a decrypted copy for this feature" opt-in later. Worth deciding now: are you OK with client-only search/export for v1? (Recommended: yes.)

---

## 3. High-Level Architecture

```
┌─────────────┐        WebSocket (ciphertext only)        ┌──────────────────┐
│   Browser    │ ───────────────────────────────────────▶ │  Relay (Hocuspocus │
│  Next.js App │ ◀─────────────────────────────────────── │  or Supabase       │
│  Yjs doc     │                                            │  Realtime channel) │
│  (plaintext  │                                            └────────┬──────────┘
│  only here)  │                                                     │ persists ciphertext
└──────┬───────┘                                                     ▼
       │ REST (auth, doc metadata,                         ┌──────────────────┐
       │ wrapped keys — all via Supabase client)            │   Supabase        │
       ▼                                                    │  - Postgres       │
┌─────────────┐                                             │  - Auth           │
│  Supabase    │◀────────────────────────────────────────── │  - Storage        │
│  (Postgres,  │                                             │  - Realtime       │
│  Auth,       │                                             └──────────────────┘
│  Storage)    │
└─────────────┘
```

Two deployable pieces:
1. **Next.js app** → Vercel (free tier). Everything content-related lives here: editor, crypto, Yjs client.
2. **A persistent relay process.** This is the one piece Vercel can't host well (serverless functions don't hold long-lived WebSocket state). Two options:
   - **Option A (recommended to start):** Use **Supabase Realtime's Broadcast** channels as the transport for Yjs updates — no separate server to deploy at all. There's a community adapter pattern (`y-supabase`) you can build on. Zero extra infra, fits the "no paid services" constraint perfectly.
   - **Option B (more control, more scale headroom):** A tiny **Hocuspocus** (Yjs server framework) Node process on **Fly.io's free allowance**, which handles WebSocket rooms directly and just relays/persists opaque blobs. Move to this if Supabase Realtime's broadcast throughput/latency becomes a bottleneck.

Start with A. It's less infrastructure to own and matches your constraints. Swapping to B later doesn't touch your crypto or editor code — only the transport layer.

---

## 4. Encryption Design

### Key hierarchy
- **Document Key (DK):** one AES-256-GCM symmetric key per document. Encrypts all Yjs update blobs and document snapshots for that doc.
- **User Keypair (asymmetric, e.g. X25519):** every user has a public/private keypair. Private key is itself encrypted at rest using a key derived from the user's password (via WebCrypto's `PBKDF2`/`Argon2`-in-WASM), so Supabase only ever stores an encrypted private key blob.
- **Sharing a doc** = wrapping the DK with the invitee's public key and storing that wrapped-key row. The invitee unwraps it locally with their private key after login. The server just stores/serves wrapped blobs it can't open.

### What gets encrypted
- Every Yjs update (the live edit stream)
- Periodic full-document snapshots (for fast load without replaying the whole update log)
- Document title/metadata — **decide explicitly**: fully E2EE (server can't show doc titles in a dashboard without the client decrypting client-side, which is fine since the dashboard is client-rendered anyway) vs. leaving titles in plaintext for simplicity. Recommend: encrypt titles too, decrypt client-side for the doc list view. Consistent story beats a partial one.

### Key recovery (the sharp edge of E2EE)
If a user loses their password, their private key — and thus every DK wrapped to them — is unrecoverable by design. Decide your stance now, don't bolt it on later:
- **Strict mode (true E2EE):** no recovery, full stop. Users must be told clearly at signup.
- **Recovery-code mode:** generate a one-time recovery code at signup that itself wraps a copy of the user's private key; user must store it themselves (like a 1Password/GitHub-style recovery code). This is the usual practical compromise — recommend this for v1.

---

## 5. Data Model (Supabase Postgres)

```
users            (id, email, public_key, wrapped_private_key, wrapped_recovery_key)
documents        (id, owner_id, encrypted_title, content_type, created_at)
document_keys    (document_id, user_id, wrapped_dk)         -- per-user access
document_snapshots (document_id, ciphertext, version, created_at)
document_updates (document_id, ciphertext, seq, created_at) -- optional if Realtime broadcast is your only transport;
                                                              -- needed if you want durable replay/late-joiners
permissions      (document_id, user_id, role)                -- owner/editor/viewer
```

Row-Level Security (Supabase RLS) enforces that a user can only read rows for documents they have a `document_keys` entry for — cheap, effective access control layered *underneath* the crypto (defense in depth: even if RLS had a bug, ciphertext alone is useless).

---

## 6. Editor Customization Model

Keep three layers strictly separate so "customizable" doesn't turn into spaghetti — this now applies *per project style*, not to one shared schema:

1. **Schema/format layer** — for Rich Text: ProseMirror node/mark specs (paragraph, list, code block, etc). For Markdown/LaTeX: plain text source, since the "schema" is just the target format's own syntax.
2. **Editing-surface layer** — for Rich Text: Tiptap extensions (toolbar, shortcuts, input rules). For Markdown/LaTeX: CodeMirror config + a preview/compile pane. This is where style-specific UI and behavior lives.
3. **Sync layer** — Yjs binds to whichever editor the style uses (`y-prosemirror` for Rich Text, `y-codemirror.next` for Markdown/LaTeX source). This layer never inspects content — it's why adding a new project style never touches sync or crypto code, only layers 1–2 for that style.

`documents.content_type` (see Section 5's data model) is what tells the app which editing surface to mount for a given project — the routing point between "a project" (generic) and "this project's style" (specific).

This gives you a plugin-style system for free: a "SyncDocs extension" is just a Tiptap extension package.

---

## 7. Suggested Phased Build Order

**Phase 0 — Single-user editor, no sync, no crypto.** Next.js + Tiptap, save/load plaintext documents to Supabase. Get the editor UX and content-type plugin system solid first.

**Phase 1 — Add real-time sync, no encryption yet.** Wire up Yjs + Supabase Realtime broadcast. Get two browser tabs editing the same doc live. This isolates sync bugs from crypto bugs.

**Phase 2 — Add E2EE.** Introduce keypairs, DK wrapping, encrypt the update/snapshot stream. This is the highest-risk phase — budget real time for it and test heavily with multiple accounts.

**Phase 3 — Sharing, permissions, roles.** Invite flow, wrapped-key distribution, RLS policies, viewer vs editor.

**Phase 4 — Polish & customization surface.** More content types, theming, comment threads, version history UI (built on your snapshot log).

**Phase 5 — Scale-readiness.** Swap Realtime broadcast for a dedicated Hocuspocus relay if/when needed; add snapshot compaction so the update log doesn't grow unbounded.

---

## 8. Open Decisions Worth Making Explicitly (not silently defaulting)

- Recovery-code vs strict-no-recovery for lost passwords
- Whether document titles/metadata are encrypted or plaintext
- Whether v1 needs offline support (Yjs supports this naturally via IndexedDB persistence — cheap to add early, painful to retrofit)
- Comments/suggestions as a first-class encrypted feature, or a v2 addition
- Export formats (PDF/Markdown/docx) — these must happen client-side post-decryption to preserve the "server never sees plaintext" guarantee

---

## 9. Cost Reality Check

- **Vercel Hobby:** free, fine for this
- **Supabase free tier:** free Postgres + Auth + Storage + Realtime, generous enough for early users; watch Realtime concurrent-connection limits as you grow
- **Fly.io free allowance:** only needed if/when you move to Option B relay — small VM covers a Hocuspocus process comfortably at small scale

Total to launch: **$0**, with a clear, cheap upgrade path (Fly.io relay, then Supabase paid tier) if usage grows.
