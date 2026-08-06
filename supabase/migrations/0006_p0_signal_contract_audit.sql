-- P0 — Contrato de señales, estados, evidencia y snapshots (aditivo).
-- Base de la reconstrucción hacia auditoría GEO/SEO. No toca tablas existentes.
-- Las DEFINICIONES de señales viven en Git (código); estas tablas solo registran
-- MEDICIONES, evidencia, scores por dimensión y la versión de metodología usada.

create type measurement_state as enum (
  'measured','inferred','estimated',
  'field_measured','lab_measured','budget_defined',
  'unavailable','experimental','failed'
);
create type signal_type as enum ('deterministic','llm_assisted','external','estimated');
create type snapshot_status as enum ('running','done','error');
create type top_dimension as enum ('readiness','authority','visibility');

-- Snapshot inmutable de una auditoría (se persiste completo en una transacción).
create table public.audit_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  project_id              uuid not null references public.projects(id) on delete cascade,
  status                  snapshot_status not null default 'done',
  methodology_version     text not null,
  signal_registry_version text not null,
  input_kind              text not null,          -- 'site' | 'document'
  root_url                text,
  crawl_id                uuid references public.crawls(id) on delete set null,
  error                   text
);
create index on public.audit_snapshots (project_id, created_at desc);

-- Una fila por señal medida en un snapshot. `raw` permite recalcular al cambiar metodología.
create table public.signal_measurements (
  id             uuid primary key default gen_random_uuid(),
  snapshot_id    uuid not null references public.audit_snapshots(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  signal_id      text not null,
  signal_version integer not null,
  top_dimension  top_dimension not null,
  sub_dimension  text not null,
  type           signal_type not null,
  state          measurement_state not null,
  raw            jsonb not null default '{}'::jsonb,
  normalized     numeric,                         -- 0..10 | null
  confidence     numeric,                         -- 0..1  | null
  model          text,                            -- solo llm_assisted
  prompt_version text,                            -- solo llm_assisted
  error          text,
  measured_at    timestamptz not null default now()
);
create index on public.signal_measurements (snapshot_id);
create index on public.signal_measurements (project_id, signal_id);

-- Evidencia por medición (auditar / recalcular).
create table public.evidence_items (
  id             uuid primary key default gen_random_uuid(),
  measurement_id uuid not null references public.signal_measurements(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  key            text not null,
  kind           text not null,                   -- 'url'|'http_status'|'count'|'passage'|'flag'
  value          jsonb not null,
  url            text
);
create index on public.evidence_items (measurement_id);

-- Score por dimensión. `score` NULL cuando la cobertura es insuficiente (no inventar bajo).
create table public.dimension_scores (
  id               uuid primary key default gen_random_uuid(),
  snapshot_id      uuid not null references public.audit_snapshots(id) on delete cascade,
  project_id       uuid not null references public.projects(id) on delete cascade,
  top_dimension    top_dimension not null,
  sub_dimension    text,                          -- null = agregado de la dimensión top
  score            numeric,                       -- 0..10 | NULL
  state            measurement_state not null,
  coverage         numeric not null,              -- 0..1
  confidence       numeric,
  measured_signals integer not null default 0,
  total_signals    integer not null default 0
);
create index on public.dimension_scores (snapshot_id);

-- Log de referencia de versiones metodológicas. Las reglas viven en Git; esto solo registra.
create table public.methodology_versions (
  version    text primary key,
  created_at timestamptz not null default now(),
  notes      text
);

-- RLS habilitada, sin policies (acceso service-role). Policies por organización = Fase 2.
alter table public.audit_snapshots      enable row level security;
alter table public.signal_measurements  enable row level security;
alter table public.evidence_items       enable row level security;
alter table public.dimension_scores     enable row level security;
alter table public.methodology_versions enable row level security;
