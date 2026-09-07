# SyncDocs

> Private, collaborative, and format-agnostic document editor with client-side End-to-End Encryption (E2EE) and real-time CRDT synchronization.

---

## Features

- 🔒 **Zero-Knowledge Client-Side E2EE**: All document text, titles, and Yjs CRDT deltas are encrypted with AES-256-GCM before transmission. Plaintext never leaves the browser.
- 👥 **Real-Time Collaboration**: Multi-user editing with live cursors, remote selections, and conflict-free merging powered by Yjs and Supabase Realtime broadcast channels.
- 🛡️ **Role-Based Sharing**: Fine-grained access control (`owner`, `editor`, `viewer`) with zero-knowledge ECDH P-256 key wrapping and secure URL hash invitation secrets.
- 💾 **Dual Storage Modes**: Operates with live Supabase Postgres or an automatic client-side local storage fallback for offline demoing.

---

## Quick Start

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/syncdocs.git
cd syncdocs
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file from the template:
```bash
cp .env.example .env.local
```

Set your Supabase project credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run Database Migrations
Execute the SQL script in [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL Editor.

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploying to Vercel

1. Push this repository to GitHub or GitLab.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your SyncDocs repository.
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon Public Key
5. Click **Deploy**. Vercel will build and deploy the Next.js application automatically.

---

## Architecture & Roadmap

For in-depth documentation on the cryptographic hierarchy, CRDT sync protocol, and multi-surface roadmap:
- [Architecture Specifications](docs/architecture.md)
- [Product Scope & Requirements](docs/project-description.md)
- [Project Log & ADRs](docs/project-log.md)
