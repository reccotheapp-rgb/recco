alter table public.media_states
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.media_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id text not null,
  body text not null default '' check (char_length(body) <= 4000),
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

alter table public.media_reviews enable row level security;

create policy "Users manage their own media reviews"
  on public.media_reviews for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.media_reviews to authenticated;

create index if not exists media_reviews_user_updated_idx
  on public.media_reviews (user_id, updated_at desc);
