-- DelleRose.ai MVP v1.0 schema
-- Tables: profiles, briefs, posts

create extension if not exists "pgcrypto";

do $$
begin
  create type public.content_intent as enum (
    'sales',
    'storytelling',
    'educational',
    'debate',
    'update'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.social_platform as enum (
    'linkedin',
    'tiktok',
    'instagram',
    'facebook',
    'twitter'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.post_status as enum (
    'draft',
    'approved',
    'scheduled',
    'posted'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tone_level integer not null check (tone_level between 1 and 10),
  length_preference integer not null check (length_preference between 1 and 5),
  opinion_level integer not null check (opinion_level between 1 and 10),
  preferred_words text[] not null default '{}',
  banned_words text[] not null default '{}',
  voice_sample text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint voice_sample_url_check check (
    voice_sample is null
    or voice_sample ~* '^https?://'
  )
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id uuid not null default gen_random_uuid(),
  source_transcript text not null,
  core_message text not null,
  intent public.content_intent not null,
  target_audience text not null,
  key_points text[] not null default '{}',
  emotional_tone text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  workflow_id uuid not null,
  platform public.social_platform not null,
  hook text not null,
  body text not null,
  cta text not null,
  hashtags text[] not null default '{}',
  visual_suggestion text not null,
  publish_mode text not null default 'manual_copy' check (publish_mode in ('api', 'manual_copy')),
  status public.post_status not null default 'draft',
  scheduled_for timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.briefs
  add column if not exists workflow_id uuid;

update public.briefs
set workflow_id = gen_random_uuid()
where workflow_id is null;

alter table public.briefs
  alter column workflow_id set default gen_random_uuid();

alter table public.briefs
  alter column workflow_id set not null;

alter table public.posts
  add column if not exists workflow_id uuid;

update public.posts as p
set workflow_id = b.workflow_id
from public.briefs as b
where p.workflow_id is null
  and p.brief_id = b.id;

update public.posts
set workflow_id = gen_random_uuid()
where workflow_id is null;

alter table public.posts
  alter column workflow_id set not null;

create index if not exists briefs_user_id_created_at_idx
  on public.briefs (user_id, created_at desc);

create unique index if not exists briefs_user_id_workflow_id_uidx
  on public.briefs (user_id, workflow_id);

create index if not exists posts_user_id_status_scheduled_idx
  on public.posts (user_id, status, scheduled_for);

create index if not exists posts_brief_id_idx
  on public.posts (brief_id);

create unique index if not exists posts_user_id_workflow_id_platform_uidx
  on public.posts (user_id, workflow_id, platform);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists briefs_set_updated_at on public.briefs;
create trigger briefs_set_updated_at
before update on public.briefs
for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.briefs enable row level security;
alter table public.posts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'briefs'
      and policyname = 'briefs_select_own'
  ) then
    create policy briefs_select_own
      on public.briefs
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'briefs'
      and policyname = 'briefs_insert_own'
  ) then
    create policy briefs_insert_own
      on public.briefs
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'briefs'
      and policyname = 'briefs_update_own'
  ) then
    create policy briefs_update_own
      on public.briefs
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'posts'
      and policyname = 'posts_select_own'
  ) then
    create policy posts_select_own
      on public.posts
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'posts'
      and policyname = 'posts_insert_own'
  ) then
    create policy posts_insert_own
      on public.posts
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'posts'
      and policyname = 'posts_update_own'
  ) then
    create policy posts_update_own
      on public.posts
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
