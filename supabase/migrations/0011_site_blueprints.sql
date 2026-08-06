-- P4 — Arquitecto de sitio: blueprint de estructura ideal + brief para IAs de diseño.
-- (El valor de enum 'build_blueprint' se agrega en 0011a, aparte, por PG.)

create table if not exists public.site_blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'ready',          -- ready | error
  structure jsonb not null default '{}'::jsonb,   -- segmentos → páginas → outline
  prompt_md text,                                 -- brief para IAs de diseño
  model text,
  prompt_version text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists site_blueprints_project_idx on public.site_blueprints(project_id, created_at desc);
alter table public.site_blueprints enable row level security;
