-- P1B — Competencia: modelo + páginas crawleadas + snapshots de benchmark.
-- (El valor de enum 'run_competitor' se agrega en 0010a, aparte, por PG.)

create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  root_url text not null,
  domain text not null,
  source text not null default 'manual',        -- manual | auto
  is_priority boolean not null default false,
  status text not null default 'new',            -- new | queued | running | done | error
  pages_count integer not null default 0,
  error text,
  last_run_at timestamptz,
  max_pages integer not null default 15,
  created_at timestamptz not null default now()
);
create index if not exists competitors_project_idx on public.competitors(project_id);

create table if not exists public.competitor_pages (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  url text not null,
  title text,
  headings jsonb not null default '[]'::jsonb,
  clean_text text not null default '',
  word_count integer not null default 0,
  http_status integer,
  canonical_url text,
  meta_robots text,
  hreflang jsonb not null default '[]'::jsonb,
  internal_links jsonb not null default '[]'::jsonb,
  meta_description text,
  img_total integer not null default 0,
  img_with_alt integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists competitor_pages_competitor_idx on public.competitor_pages(competitor_id);

create table if not exists public.competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  methodology_version text not null,
  signal_registry_version text not null,
  readiness_score numeric,
  coverage_score numeric,
  dimensions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists competitor_snapshots_competitor_idx on public.competitor_snapshots(competitor_id);

alter table public.competitors enable row level security;
alter table public.competitor_pages enable row level security;
alter table public.competitor_snapshots enable row level security;
