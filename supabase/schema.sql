-- MaltCord Supabase setup. Paste this whole file into Supabase > SQL Editor and press Run.
-- Everyone can READ badges and published announcements. Only owners can change anything.

-- Who may edit. Filled in by hand once (see the last section).
create table if not exists public.owners (
    user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.owners enable row level security;
-- No policies on owners: nobody can read or change it through the public API.

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (select 1 from public.owners where user_id = auth.uid());
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

-- Badges: one row per badge shown on a Discord profile for MaltCord users.
create table if not exists public.badges (
    id uuid primary key default gen_random_uuid(),
    user_id text not null check (user_id ~ '^[0-9]{15,22}$'),
    tooltip text not null check (char_length(tooltip) between 1 and 80),
    icon text not null check (char_length(icon) <= 200000
        and (icon ~ '^https://[^[:space:]]+$' or icon ~ '^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$')),
    created_at timestamptz not null default now()
);
create index if not exists badges_user_id_idx on public.badges (user_id);
alter table public.badges enable row level security;

drop policy if exists "badges are public" on public.badges;
create policy "badges are public" on public.badges for select using (true);
drop policy if exists "owners manage badges" on public.badges;
create policy "owners manage badges" on public.badges for all
    using (public.is_owner()) with check (public.is_owner());

-- Announcements: shown in the MaltCord bell.
create table if not exists public.announcements (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 120),
    body text not null default '' check (char_length(body) <= 2000),
    url text check (url is null or url ~ '^https://[^[:space:]]+$'),
    published boolean not null default true,
    created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;

drop policy if exists "published announcements are public" on public.announcements;
create policy "published announcements are public" on public.announcements for select
    using (published or public.is_owner());
drop policy if exists "owners manage announcements" on public.announcements;
create policy "owners manage announcements" on public.announcements for all
    using (public.is_owner()) with check (public.is_owner());

-- A first announcement so the bell has something to show.
insert into public.announcements (title, body, url)
select 'Welcome to MaltCord',
       'Announcements from the MaltCord team show up here. Join the Discord server for news and help.',
       'https://discord.gg/XfyH3Qcwgp'
where not exists (select 1 from public.announcements);

-- LATER, after you have signed in once with Discord in the app (so you appear under Authentication > Users):
-- copy your user UUID from that page and run this line with it, to make that account an owner:
--   insert into public.owners (user_id) values ('PASTE-YOUR-UUID-HERE');
