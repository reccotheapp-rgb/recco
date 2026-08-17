create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE', 'UNLISTED')),
  share_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  media_id text not null,
  position smallint not null default 0,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  primary key (collection_id, media_id)
);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

create policy "Users manage their own collections"
  on public.collections for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage items in their own collections"
  on public.collection_items for all to authenticated
  using (exists (select 1 from public.collections where collections.id = collection_items.collection_id and collections.user_id = (select auth.uid())))
  with check (exists (select 1 from public.collections where collections.id = collection_items.collection_id and collections.user_id = (select auth.uid())));

grant select, insert, update, delete on public.collections, public.collection_items to authenticated;

create index if not exists collections_user_updated_idx on public.collections (user_id, updated_at desc);
create index if not exists collection_items_collection_position_idx on public.collection_items (collection_id, position);
