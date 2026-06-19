-- FAQ AEO Tool — initial schema
-- Run this in the Supabase SQL editor (or via supabase db push)
-- Phase 1: RLS policies are written but disabled; enable in Phase 2 when auth is added.

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────
create type project_status as enum ('active', 'archived');
create type crawl_status   as enum ('queued', 'running', 'done', 'error');
create type job_status     as enum ('queued', 'running', 'done', 'error');
create type job_type       as enum (
  'crawl_site', 'analyze_topics', 'brand_audit',
  'discover_questions', 'generate_answers', 'verify_answers',
  'run_eval', 'citation_check'
);
create type seed_source as enum (
  'sales', 'support', 'manual', 'web_search',
  'paa', 'autocomplete', 'search_console'
);
create type question_tier   as enum ('head', 'mid', 'long');
create type question_intent as enum (
  'definitional', 'process', 'comparative', 'transactional', 'product'
);
create type faq_status     as enum ('draft', 'needs_review', 'approved', 'rejected');
create type citation_engine as enum ('chatgpt', 'claude', 'perplexity', 'gemini');

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

create table projects (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,
  domain       text not null,
  root_url     text not null,
  voice_guide  text,
  topic_summary text,
  status       project_status not null default 'active'
);

create table crawls (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references projects(id) on delete cascade,
  status       crawl_status not null default 'queued',
  pages_count  int not null default 0,
  max_pages    int not null default 100,
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text
);

create table pages (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  crawl_id     uuid not null references crawls(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  url          text not null,
  title        text,
  headings     jsonb not null default '[]',
  clean_text   text not null default '',
  word_count   int not null default 0
);

create table seed_questions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references projects(id) on delete cascade,
  text         text not null,
  source       seed_source not null default 'manual',
  raw_meta     jsonb
);

create table brand_audits (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references projects(id) on delete cascade,
  status       crawl_status not null default 'queued',
  findings     jsonb not null default '[]',
  gaps         jsonb not null default '[]',
  summary      text
);

create table topics (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  summary      text,
  priority     int not null default 0
);

create table questions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  project_id     uuid not null references projects(id) on delete cascade,
  topic_id       uuid references topics(id) on delete set null,
  text           text not null,
  tier           question_tier not null default 'mid',
  intent         question_intent not null default 'definitional',
  source         text not null default 'manual',
  priority_score float not null default 0,
  status         text not null default 'active'
);

create table faqs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  project_id         uuid not null references projects(id) on delete cascade,
  question_id        uuid not null references questions(id) on delete cascade,
  answer_text        text not null,
  source_page_id     uuid references pages(id) on delete set null,
  status             faq_status not null default 'draft',
  confidence         float,
  unsupported_claims jsonb not null default '[]',
  prompt_version     text not null default 'v1.0.0'
);

create table jobs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references projects(id) on delete cascade,
  type         job_type not null,
  status       job_status not null default 'queued',
  payload      jsonb not null default '{}',
  result       jsonb,
  error        text,
  attempts     int not null default 0
);

create table golden_faqs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  project_id    uuid not null references projects(id) on delete cascade,
  question      text not null,
  ideal_answer  text not null,
  notes         text
);

create table evals (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  project_id     uuid not null references projects(id) on delete cascade,
  faq_id         uuid references faqs(id) on delete set null,
  prompt_version text not null,
  judge_model    text not null,
  rubric_scores  jsonb not null default '{}',
  overall_score  float not null default 0,
  passed         boolean not null default false
);

create table citation_checks (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references projects(id) on delete cascade,
  question     text not null,
  engine       citation_engine not null,
  cited        boolean not null default false,
  position     int,
  checked_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
create index on crawls(project_id);
create index on pages(project_id);
create index on pages(crawl_id);
create index on seed_questions(project_id);
create index on brand_audits(project_id);
create index on topics(project_id);
create index on questions(project_id);
create index on questions(topic_id);
create index on faqs(project_id);
create index on faqs(question_id);
create index on faqs(status);
create index on jobs(project_id, status);
create index on evals(project_id, prompt_version);
create index on citation_checks(project_id);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Phase 1: RLS enabled but with permissive policies (no auth).
-- Phase 2: replace the permissive policies with user-scoped ones.
-- ─────────────────────────────────────────────
alter table projects       enable row level security;
alter table crawls         enable row level security;
alter table pages          enable row level security;
alter table seed_questions enable row level security;
alter table brand_audits   enable row level security;
alter table topics         enable row level security;
alter table questions      enable row level security;
alter table faqs           enable row level security;
alter table jobs           enable row level security;
alter table golden_faqs    enable row level security;
alter table evals          enable row level security;
alter table citation_checks enable row level security;

-- Phase 1: allow all (single-user, no auth)
-- Phase 2: replace with: using (auth.uid() = user_id) for each table
create policy "phase1_allow_all" on projects        for all using (true) with check (true);
create policy "phase1_allow_all" on crawls          for all using (true) with check (true);
create policy "phase1_allow_all" on pages           for all using (true) with check (true);
create policy "phase1_allow_all" on seed_questions  for all using (true) with check (true);
create policy "phase1_allow_all" on brand_audits    for all using (true) with check (true);
create policy "phase1_allow_all" on topics          for all using (true) with check (true);
create policy "phase1_allow_all" on questions       for all using (true) with check (true);
create policy "phase1_allow_all" on faqs            for all using (true) with check (true);
create policy "phase1_allow_all" on jobs            for all using (true) with check (true);
create policy "phase1_allow_all" on golden_faqs     for all using (true) with check (true);
create policy "phase1_allow_all" on evals           for all using (true) with check (true);
create policy "phase1_allow_all" on citation_checks for all using (true) with check (true);
