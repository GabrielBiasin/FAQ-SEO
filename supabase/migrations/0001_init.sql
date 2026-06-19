-- ============================================================================
-- FAQ AEO tool — initial schema (Phase 1)
-- Everything hangs off project_id, ready for multi-tenancy in Phase 2.
-- RLS policies are written but left permissive/disabled for Phase 1.
-- ============================================================================

-- Enums -----------------------------------------------------------------------
create type project_status   as enum ('active', 'archived');
create type run_status       as enum ('queued', 'running', 'done', 'error');
create type job_type         as enum (
  'crawl_site', 'analyze_topics', 'brand_audit', 'discover_questions',
  'generate_answers', 'verify_answers', 'run_eval', 'citation_check'
);
create type seed_source      as enum (
  'sales', 'support', 'manual', 'web_search', 'paa', 'autocomplete', 'search_console'
);
create type question_tier    as enum ('head', 'mid', 'long');
create type question_intent  as enum (
  'definitional', 'process', 'comparative', 'transactional', 'product'
);
create type faq_status       as enum ('draft', 'needs_review', 'approved', 'rejected');
create type citation_engine  as enum ('chatgpt', 'claude', 'perplexity', 'gemini');

-- projects --------------------------------------------------------------------
create table projects (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null,
  domain        text not null,
  root_url      text not null,
  voice_guide   text,
  topic_summary text,
  status        project_status not null default 'active'
);

-- crawls ----------------------------------------------------------------------
create table crawls (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  project_id  uuid not null references projects(id) on delete cascade,
  status      run_status not null default 'queued',
  pages_count integer not null default 0,
  max_pages   integer not null default 50,
  started_at  timestamptz,
  finished_at timestamptz,
  error       text
);
create index on crawls (project_id);

-- pages -----------------------------------------------------------------------
create table pages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  crawl_id   uuid not null references crawls(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  url        text not null,
  title      text,
  headings   jsonb not null default '[]'::jsonb,
  clean_text text not null default '',
  word_count integer not null default 0
);
create index on pages (crawl_id);
create index on pages (project_id);

-- seed_questions --------------------------------------------------------------
create table seed_questions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  text       text not null,
  source     seed_source not null default 'manual',
  raw_meta   jsonb
);
create index on seed_questions (project_id);

-- brand_audits ----------------------------------------------------------------
create table brand_audits (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  status     run_status not null default 'queued',
  findings   jsonb not null default '[]'::jsonb,
  gaps       jsonb not null default '[]'::jsonb,
  summary    text
);
create index on brand_audits (project_id);

-- topics ----------------------------------------------------------------------
create table topics (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  summary    text,
  priority   integer not null default 0
);
create index on topics (project_id);

-- questions -------------------------------------------------------------------
create table questions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  project_id     uuid not null references projects(id) on delete cascade,
  topic_id       uuid references topics(id) on delete set null,
  text           text not null,
  tier           question_tier not null default 'mid',
  intent         question_intent not null default 'definitional',
  source         text not null default 'manual',
  priority_score double precision not null default 0,
  status         text not null default 'active'
);
create index on questions (project_id);
create index on questions (topic_id);

-- faqs ------------------------------------------------------------------------
create table faqs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  project_id         uuid not null references projects(id) on delete cascade,
  question_id        uuid not null references questions(id) on delete cascade,
  answer_text        text not null default '',
  source_page_id     uuid references pages(id) on delete set null,
  status             faq_status not null default 'draft',
  confidence         double precision,
  unsupported_claims jsonb not null default '[]'::jsonb,
  prompt_version     text not null default 'v1.0.0'
);
create index on faqs (project_id);
create index on faqs (question_id);

-- jobs (work queue) -----------------------------------------------------------
create table jobs (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  type       job_type not null,
  status     run_status not null default 'queued',
  payload    jsonb not null default '{}'::jsonb,
  result     jsonb,
  error      text,
  attempts   integer not null default 0
);
create index on jobs (project_id);
create index on jobs (status);

-- golden_faqs (eval gold set) -------------------------------------------------
create table golden_faqs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references projects(id) on delete cascade,
  question     text not null,
  ideal_answer text not null,
  notes        text
);
create index on golden_faqs (project_id);

-- evals -----------------------------------------------------------------------
create table evals (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  project_id     uuid not null references projects(id) on delete cascade,
  faq_id         uuid references faqs(id) on delete set null,
  prompt_version text not null,
  judge_model    text not null,
  rubric_scores  jsonb not null default '{}'::jsonb,
  overall_score  double precision not null default 0,
  passed         boolean not null default false
);
create index on evals (project_id);
create index on evals (prompt_version);

-- citation_checks -------------------------------------------------------------
create table citation_checks (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  question   text not null,
  engine     citation_engine not null,
  cited      boolean not null default false,
  position   integer,
  checked_at timestamptz not null default now()
);
create index on citation_checks (project_id);

-- ============================================================================
-- Row Level Security — PHASE 2 PREP
-- Left DISABLED in Phase 1 (single-user, service-role access).
-- To enable multi-tenancy in Phase 2: enable RLS on each table and uncomment
-- the policies below, scoping by a project membership / auth.uid() mapping.
-- ============================================================================
-- Example (commented for Phase 2):
-- alter table projects enable row level security;
-- create policy "members read own projects" on projects
--   for select using ( id in (select project_id from project_members where user_id = auth.uid()) );
-- ... (repeat per table, joining through project_id) ...
