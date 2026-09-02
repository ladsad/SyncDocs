-- SyncDocs Phase 0 Database Schema
-- Table for storing documents in plaintext (Phase 0 scope)

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Document',
  content_type text not null default 'rich_text',
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for ordering by recency
create index if not exists idx_documents_updated_at on documents(updated_at desc);

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

-- Phase 0 open access policy (will be replaced with user-based policies in Phase 3)
drop policy if exists "Allow all access in Phase 0 (no auth)" on public.documents;
create policy "Allow all access in Phase 0 (no auth)"
on public.documents
for all
using (true)
with check (true);
