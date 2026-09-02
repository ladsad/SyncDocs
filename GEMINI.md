
# GEMINI.md — SyncDocs project rules

## Non-negotiable constraints

- SyncDocs's own servers must NEVER receive plaintext document content or
  LaTeX/.tex source. All encryption/decryption and all LaTeX compilation
  (Tier 1 WASM, Tier 2 local agent) happens client-side. Do not introduce
  a server-side compile step, plaintext caching, or plaintext logging,
  even temporarily "for debugging."
- Full architecture: see docs/architecture.md. Full product scope: see
  docs/project-description.md. Read both before proposing structural
  changes — don't improvise around the documented design.
- Stack: Next.js + TypeScript + Tailwind, Supabase (Postgres/Auth/Storage/
  Realtime), Yjs for CRDT sync, deployed on Vercel. No paid services.
- Follow the phased build order in architecture.md Section 7 — don't
  jump ahead to encryption/sync before the current phase's scope is done.
- Documentation & History: Maintain `docs/project-log.md` with every phase
  advancement or major architectural decision (Timeline + ADRs). Keep git
  history clean and commit logically as milestones are completed.
