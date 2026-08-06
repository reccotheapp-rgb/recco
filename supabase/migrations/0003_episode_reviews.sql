create table if not exists public.episode_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id text not null,
  season_number integer not null check (season_number > 0),
  episode_number integer not null check (episode_number > 0),
  body text not null default '' check (char_length(body) <= 2000),
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id, season_number, episode_number)
);

alter table public.episode_reviews enable row level security;
grant select, insert, update, delete on public.episode_reviews to authenticated;

create policy "Users manage their own episode reviews"
  on public.episode_reviews for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
