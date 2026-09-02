# SyncDocs — Project Description

## 1. Vision

SyncDocs is a real-time collaborative document editor — the "Google Docs of anything," not just prose. Where Overleaf locked collaborative editing to LaTeX and Google Docs locked it to rich text, SyncDocs lets a **project be started in whatever open, popular style fits the work** — Rich Text, LaTeX, Markdown, and other widely-used open formats — each with tooling suited to that style, all sharing the same collaboration engine and security model underneath. It's less "one blended document type" and more "Overleaf's model of project-styles, generalized beyond just LaTeX."

Its second defining trait is that it takes privacy seriously in a way most collaborative editors don't: documents are **end-to-end encrypted**, meaning the people running the servers can't read what's written on them, even though editing is still live and cursor-by-cursor.

**One-line pitch:** *A collaborative document editor that's as flexible as your content and as private as a locked notebook.*

---

## 2. Problem Statement

- **Format lock-in:** Overleaf is excellent but LaTeX-only. Google Docs is excellent but rich-text-only. Notion blends types but isn't built for true simultaneous multi-cursor editing at the fidelity of Docs/Overleaf, and isn't privacy-focused. There's no tool that's genuinely good at live collaborative editing *across* content types.
- **Trust gap:** Every mainstream collaborative editor requires trusting the platform operator with full plaintext access to everything written — drafts, sensitive notes, unpublished code, legal docs. For a growing set of users (researchers, journalists, legal/medical teams, privacy-conscious teams), that's a dealbreaker, and the alternatives (E2EE note apps) don't support real-time multi-user editing.
- **Customization ceiling:** Most editors that are "flexible" are flexible in the way a blank canvas is flexible — no structure. SyncDocs is flexible via well-defined content-type extensions, so customization doesn't come at the cost of a coherent editing experience.

---

## 3. Target Users (v1 framing)

Not trying to boil the ocean at launch. Realistic early adopters:
- **Small technical teams / open-source collaborators** who currently bounce between Google Docs (prose), GitHub (code), and Overleaf (papers) for a single project and want one place.
- **Privacy-conscious individuals and small teams** (researchers, independent journalists, small legal/consulting practices) who need real collaboration but can't or won't put sensitive material on a platform that can read it.
- **You and Antigravity, dogfooding it** — the first real "team" is whoever builds it, which is a good forcing function for whether the collab + crypto experience actually feels good day to day.

*(A "why not just use X" comparison table is worth building once the feature set solidifies — flagging as a v1.1 addition rather than guessing at competitor specifics now.)*

---

## 4. Core Feature Set (v1 scope)

### Must-have (v1 launch bar)
- Account creation + login (Supabase Auth), with client-side keypair generation on signup
- **Project creation with a style picker**: Rich Text, Markdown, **LaTeX** at minimum — LaTeX is the primary focus style, not a fast-follow
- Rich Text project type: bold, italic, headings, lists, links, code blocks (WYSIWYG)
- Markdown project type: plain markdown source + live rendered preview pane
- **LaTeX project type**: source pane + compiled PDF preview, via the tiered client-side compile design (Tier 1 WASM engine + on-demand package fetch; see architecture doc Section 2a) — no privacy trade-off vs. other styles
- Live multi-cursor collaborative editing — see collaborators' cursors and selections in real time, across all project styles
- Invite collaborators to a project by email, with editor/viewer roles
- End-to-end encryption of project content, in transit and at rest
- Project list/dashboard (client-side decrypted titles, grouped or tagged by style)
- Autosave via the sync engine (no explicit "save" button needed — CRDT stream is the save)

### Should-have (fast follow, v1.x)
- **Tier 2 Local Compile Agent** for LaTeX — opt-in native helper for large/package-heavy documents that exceed the browser WASM tier (see architecture doc Section 2a)
- **Typst project type** — secondary style, included alongside LaTeX rather than instead of it; cheaper to add given its natively incremental, WASM-friendly compiler, but not the priority
- Code-focused project type with syntax highlighting (CodeMirror-based)
- Basic version history (built on periodic encrypted snapshots)
- Offline editing with local persistence, syncing on reconnect
- Comment threads (encrypted, tied to a text range)

### Later / v2+
- Additional popular open formats as project styles (e.g. AsciiDoc, reStructuredText) — same plugin pattern as Rich Text/Markdown/LaTeX
- **Tier 3 Bring-Your-Own Compile Server** for LaTeX/Typst — point at a self-hosted compile endpoint for server-grade compute without a local install
- Export to PDF/Markdown/docx (client-side, post-decryption, to preserve the E2EE guarantee)
- Recovery-code flow for lost passwords (or decide this is v1 — see open decisions below)
- Org/workspace-level grouping of projects, shared workspace keys
- Public share links (read-only, with their own access-key scheme distinct from per-user wrapping)

### Explicit non-goals for v1
- No server-side full-text search (would require server-readable plaintext, contradicts E2EE model)
- No AI-assisted writing features — not the differentiator, adds surface area, revisit later
- No mobile native app — responsive web only at first
- No granular field-level permissions beyond editor/viewer at the whole-document level

---

## 5. What Makes This Defensible / Differentiated

1. **Project-style plurality as an architectural property, not a marketing claim** — Rich Text, Markdown, LaTeX, and future open formats each get their own editing surface, but plug into the same Yjs sync layer and encryption core, so adding a new open, popular format is a matter of building its editor surface, not re-architecting collaboration or security.
2. **E2EE that doesn't sacrifice live collaboration** — the harder, more valuable version of "encrypted docs," since most E2EE note tools give up real-time multi-cursor editing to get there.
3. **Built to run on $0 infrastructure at small scale** — lowers the barrier to actually shipping and dogfooding this rather than it staying a plan forever.

---

## 6. Success Criteria for v1

Concrete, checkable bar for "v1 is done":
- Two people can open the same document in two browsers and see each other's cursor and edits within ~200ms on a normal connection
- A document's content is never visible in Supabase's dashboard, logs, or database as plaintext — verifiable by inspecting the DB directly
- A new user can sign up, create a doc, invite a second (real) test account, and collaborate — start to finish — without hitting an unhandled error
- Losing your password has a defined, documented outcome (whichever recovery stance is chosen) rather than an undefined one
- A LaTeX project compiles to a correct PDF entirely client-side (Tier 1), with no `.tex` source ever leaving the browser — verifiable by inspecting network requests during a compile

---

## 7. Open Product Decisions

Carried over from the architecture doc, framed as product (not just technical) calls — these shape onboarding copy and UX, not just backend code:
1. **Recovery-code vs. strict no-recovery** — this needs to be surfaced to users at signup either way; decide the stance before writing that screen.
2. **Are document titles encrypted?** Affects whether the dashboard needs a "decrypting…" flicker on load.
3. **Free tier / pricing model, even informally** — not urgent for v1, but "is this staying free forever, freemium, or eventually paid" affects whether you build usage limits into the data model now or bolt them on later.
4. **Team/workspace concept** — v1 as described is per-document sharing only; decide now if "workspaces" are a v1.x concern or a fundamental restructure, since that affects the permissions table design today.
5. ~~LaTeX compilation model~~ — **Resolved:** tiered, fully client/user-controlled compilation (browser WASM by default, opt-in local agent, opt-in bring-your-own server). No project style gets a weaker privacy guarantee than another. See architecture doc Section 2a for the full design.

---

## 8. Relationship to the Architecture Doc

This document answers *what SyncDocs is and why*; the architecture doc answers *how it's built*. Keep them in sync as decisions get made — when an open decision above gets resolved, it should update both the relevant section here and the corresponding section in the architecture doc.
