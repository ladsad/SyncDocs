-- SyncDocs Database Schema (Phase 0 -> Phase 2 E2EE Support)

-- 1. Users table for public keys & password-wrapped private keys
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  public_key text not null,                -- Base64 ECDH P-256 / X25519 SPKI public key
  wrapped_private_key jsonb not null,      -- { ciphertext, iv, salt } encrypted via PBKDF2 Master Key
  wrapped_recovery_key jsonb,              -- { ciphertext, iv, salt } optional recovery key
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Documents table (Plaintext + E2EE Ciphertext columns)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Document',
  content_type text not null default 'rich_text',
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  yjs_state text,                          -- Plaintext/unencrypted binary snapshot (Base64)
  is_encrypted boolean not null default false,
  encrypted_title jsonb,                   -- { ciphertext, iv } AES-GCM encrypted
  encrypted_content jsonb,                 -- { ciphertext, iv } AES-GCM encrypted rich_text JSON
  encrypted_yjs_state jsonb,               -- { ciphertext, iv } AES-GCM encrypted Yjs state
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Document Keys table (Per-user wrapped Document Keys for E2EE sharing)
create table if not exists document_keys (
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null,
  wrapped_dk text not null,                -- AES-256-GCM Document Key encrypted with ECDH shared secret
  iv text not null,
  ephemeral_public_key text not null,     -- Ephemeral ECDH public key used during key wrapping
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

-- Indexes
create index if not exists idx_documents_updated_at on documents(updated_at desc);
create index if not exists idx_document_keys_user_id on document_keys(user_id);

-- Auto-update updated_at timestamp trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_documents_updated_at on documents;
create trigger set_documents_updated_at
before update on documents
for each row
execute function update_updated_at_column();

-- Enable Row Level Security (RLS)
alter table public.documents enable row level security;
alter table public.users enable row level security;
alter table public.document_keys enable row level security;

-- Open access policy during Phase 1/2 development (will be refined with auth RLS in Phase 3)
drop policy if exists "Allow all access to documents" on public.documents;
create policy "Allow all access to documents" on public.documents for all using (true) with check (true);

drop policy if exists "Allow all access to users" on public.users;
create policy "Allow all access to users" on public.users for all using (true) with check (true);

drop policy if exists "Allow all access to document_keys" on public.document_keys;
create policy "Allow all access to document_keys" on public.document_keys for all using (true) with check (true);
