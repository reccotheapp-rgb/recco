create table public.catalog_cache (
  cache_key text primary key check (char_length(cache_key) between 1 and 300),
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.catalog_cache enable row level security;
alter table public.catalog_rate_limits enable row level security;

-- This is called only by the media Edge Function through the server-only
-- Supabase secret key. Row locking makes the per-user quota atomic.
create or replace function public.consume_catalog_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_window timestamptz;
  current_count integer;
begin
  insert into public.catalog_rate_limits (user_id, request_count)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select window_started_at, request_count
  into current_window, current_count
  from public.catalog_rate_limits
  where user_id = p_user_id
  for update;

  if current_window <= now() - interval '1 minute' then
    update public.catalog_rate_limits
    set window_started_at = now(), request_count = 1, updated_at = now()
    where user_id = p_user_id;
    return true;
  end if;

  if current_count >= 60 then
    return false;
  end if;

  update public.catalog_rate_limits
  set request_count = request_count + 1, updated_at = now()
  where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.consume_catalog_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_catalog_quota(uuid) to service_role;
