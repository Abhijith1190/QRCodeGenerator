-- Waitlist for the "Notify me" button shown on the Pricing page while
-- Stripe checkout isn't wired up yet. Run this once in the Supabase SQL
-- Editor, same as the earlier migrations.

create table if not exists public.pro_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.pro_waitlist enable row level security;

-- Anyone (including anonymous visitors) may join the waitlist, but no one
-- can read, update, or delete entries from the client — only you, via the
-- Supabase dashboard's Table Editor.
drop policy if exists "Anyone can join the waitlist" on public.pro_waitlist;
create policy "Anyone can join the waitlist"
  on public.pro_waitlist for insert
  with check (true);
