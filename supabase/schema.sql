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

do $$
begin
  create type public.brand_blueprint_status as enum (
    'draft',
    'approved'
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

create table if not exists public.brand_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  onboarding_path text not null default 'build_personal_brand' check (
    onboarding_path in ('build_personal_brand', 'find_what_to_be_known_for', 'find_my_niche')
  ),
  version integer not null default 1 check (version >= 1),
  status public.brand_blueprint_status not null default 'draft',
  niche text not null,
  audience text not null,
  brand_tone text not null,
  personality_traits text[] not null default '{}',
  content_pillars jsonb not null,
  elevator_pitch text not null,
  bio_short text not null,
  interview_mode text not null default 'brand_architect_mode' check (
    interview_mode in ('brand_architect_mode')
  ),
  interview_answers text[] not null default '{}',
  interview_transcript text not null,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brand_blueprints_personality_traits_count check (
    array_length(personality_traits, 1) between 3 and 5
  ),
  constraint brand_blueprints_content_pillars_count check (
    jsonb_typeof(content_pillars) = 'array'
    and jsonb_array_length(content_pillars) = 3
  ),
  constraint brand_blueprints_interview_answers_count check (
    array_length(interview_answers, 1) = 3
  )
);

alter table public.brand_blueprints
  add column if not exists onboarding_path text;

update public.brand_blueprints
set onboarding_path = coalesce(onboarding_path, 'build_personal_brand');

alter table public.brand_blueprints
  alter column onboarding_path set default 'build_personal_brand';

alter table public.brand_blueprints
  alter column onboarding_path set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'brand_blueprints_onboarding_path_check'
  ) then
    alter table public.brand_blueprints
      add constraint brand_blueprints_onboarding_path_check
      check (onboarding_path in ('build_personal_brand', 'find_what_to_be_known_for', 'find_my_niche'));
  end if;
end
$$;

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

create index if not exists brand_blueprints_user_id_updated_at_idx
  on public.brand_blueprints (user_id, updated_at desc);

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

drop trigger if exists brand_blueprints_set_updated_at on public.brand_blueprints;
create trigger brand_blueprints_set_updated_at
before update on public.brand_blueprints
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
alter table public.brand_blueprints enable row level security;
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
      and tablename = 'brand_blueprints'
      and policyname = 'brand_blueprints_select_own'
  ) then
    create policy brand_blueprints_select_own
      on public.brand_blueprints
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_blueprints'
      and policyname = 'brand_blueprints_insert_own'
  ) then
    create policy brand_blueprints_insert_own
      on public.brand_blueprints
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_blueprints'
      and policyname = 'brand_blueprints_update_own'
  ) then
    create policy brand_blueprints_update_own
      on public.brand_blueprints
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  create type public.publish_job_status as enum (
    'queued',
    'processing',
    'retrying',
    'failed',
    'published'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id uuid not null,
  platform public.social_platform not null,
  post_id uuid not null references public.posts(id) on delete cascade,
  idempotency_key text not null,
  status public.publish_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_retry_at timestamptz,
  last_error text,
  dead_lettered_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint publish_jobs_dead_letter_guard check (
    status <> 'failed' or dead_lettered_at is not null
  )
);

create unique index if not exists publish_jobs_user_id_idempotency_key_uidx
  on public.publish_jobs (user_id, idempotency_key);

create index if not exists publish_jobs_user_status_retry_idx
  on public.publish_jobs (user_id, status, next_retry_at);

create index if not exists publish_jobs_user_workflow_platform_updated_idx
  on public.publish_jobs (user_id, workflow_id, platform, updated_at desc);

drop trigger if exists publish_jobs_set_updated_at on public.publish_jobs;
create trigger publish_jobs_set_updated_at
before update on public.publish_jobs
for each row execute function public.set_updated_at();

alter table public.publish_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'publish_jobs'
      and policyname = 'publish_jobs_select_own'
  ) then
    create policy publish_jobs_select_own
      on public.publish_jobs
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'publish_jobs'
      and policyname = 'publish_jobs_insert_own'
  ) then
    create policy publish_jobs_insert_own
      on public.publish_jobs
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'publish_jobs'
      and policyname = 'publish_jobs_update_own'
  ) then
    create policy publish_jobs_update_own
      on public.publish_jobs
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
