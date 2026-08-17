alter table public.collection_items
  add column if not exists media_snapshot jsonb not null default '{}'::jsonb;
