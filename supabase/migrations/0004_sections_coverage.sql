-- Section-directed coverage: per-project sections with coverage targets,
-- reusable intent templates, and demand/coverage question classification.

create type section_type as enum
  ('home','about_trust','differentiation','transactional','product','other');
create type question_class as enum ('demand','coverage');
alter type job_type add value if not exists 'expand_section';

-- intent_templates: reusable intent patterns. System rows have project_id null;
-- a project personalization is a copy carrying its own project_id.
create table public.intent_templates (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  project_id    uuid references public.projects(id) on delete cascade,
  key           text not null,
  name          text not null,
  section_type  section_type not null,
  intent_brief  text not null,
  default_min   integer not null default 5,
  default_target integer not null default 10,
  is_system     boolean not null default false
);
create index on public.intent_templates (project_id);
create index on public.intent_templates (section_type);

-- sections: site sections detected per project, configurable.
create table public.sections (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  name               text not null,
  urls               jsonb not null default '[]'::jsonb,
  section_type       section_type not null default 'other',
  suggested_type     section_type,
  is_priority        boolean not null default true,
  weight             integer not null default 1,
  intent_template_id uuid references public.intent_templates(id) on delete set null,
  intent_override    text,
  min_faqs           integer not null default 5,
  target_faqs        integer not null default 10,
  status             text not null default 'active'
);
create index on public.sections (project_id);

alter table public.questions
  add column if not exists section_id uuid references public.sections(id) on delete set null,
  add column if not exists question_class question_class not null default 'demand';
create index on public.questions (section_id);

-- Phase 1 posture: RLS on, service-role access only.
alter table public.sections enable row level security;
alter table public.intent_templates enable row level security;

-- Seed system intent templates (one per section_type) — see app spec §4.
insert into public.intent_templates (project_id, key, name, section_type, intent_brief, default_min, default_target, is_system) values
(null, 'home', 'Home (general→particular)', 'home',
 'La sección Home DEBE arrancar con la pregunta definicional ("¿qué hace / qué ofrece la empresa?") y bajar de forma exhaustiva a cada línea de oferta, de lo general a lo particular, asegurando que se entienda todo lo que ofrece la empresa. El arco general→particular es obligatorio, no opcional.',
 6, 10, true),
(null, 'about_trust', 'Confianza y trayectoria', 'about_trust',
 'Sustentadores de confianza: trayectoria, quién está detrás, cómo trabajan, calidad, tiempos de respuesta, ubicación, certificaciones, garantías. Preguntas buyer-facing de confianza (E-E-A-T), fundadas en la info real de la empresa.',
 5, 10, true),
(null, 'differentiation', 'Diferenciación y comparativa', 'differentiation',
 'Diferenciación y comparativa: qué los hace únicos, versatilidad/flexibilidad, por qué elegirlos frente a alternativas más grandes, conveniencia. Intención comparativa y transaccional.',
 5, 10, true),
(null, 'transactional', 'Práctico / transaccional', 'transactional',
 'Práctico: cómo contactar, cómo arrancar un proyecto, cotización, zona de cobertura, tiempos, formas de trabajo. Intención transaccional.',
 5, 10, true),
(null, 'product', 'Producto / servicio específico', 'product',
 'Preguntas de producto/servicio específico, con la mezcla de demanda (volumen/citación) y cobertura (dudas del comprador) que corresponda al producto.',
 5, 10, true),
(null, 'other', 'Genérico configurable', 'other',
 'Brief genérico: preguntas relevantes para esta sección, fundadas en el contenido. Ajustá este brief según la necesidad de la sección.',
 5, 10, true);
