-- Per-IP, per-hour generation counter used to gate the "show an ad after
-- 3 free generations" feature. Run this once in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).

create table if not exists public.qr_generation_limits (
  ip text not null,
  hour_bucket timestamptz not null,
  count integer not null default 0,
  primary key (ip, hour_bucket)
);

-- Old rows are harmless (a new (ip, hour_bucket) row is created every hour),
-- but this keeps the table small. Safe to run manually or on a schedule.
create or replace function public.cleanup_old_rate_limit_rows()
returns void
language sql
security definer
as $$
  delete from public.qr_generation_limits
  where hour_bucket < now() - interval '48 hours';
$$;

-- Atomically increments the counter for this IP's current hour bucket and
-- returns the new count. SECURITY DEFINER so it can run even though the
-- table itself has no public grants (only this function may touch it).
create or replace function public.increment_ip_generation_count(p_ip text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  insert into public.qr_generation_limits (ip, hour_bucket, count)
  values (p_ip, v_bucket, 1)
  on conflict (ip, hour_bucket)
  do update set count = qr_generation_limits.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- Lock the table down: no direct client access at all. The only way in is
-- through the SECURITY DEFINER function above, which is only ever called
-- from the check-rate-limit Edge Function (using the service role key),
-- never directly from the browser.
revoke all on public.qr_generation_limits from anon, authenticated;
revoke all on function public.increment_ip_generation_count(text) from anon, authenticated;
