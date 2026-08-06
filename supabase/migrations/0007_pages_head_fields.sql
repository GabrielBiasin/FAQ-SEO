-- Campos de <head> + status para la auditoría determinista (aditivo, nullable).
alter table public.pages
  add column if not exists http_status   integer,
  add column if not exists canonical_url  text,
  add column if not exists meta_robots    text,
  add column if not exists hreflang       jsonb not null default '[]'::jsonb,
  add column if not exists internal_links jsonb not null default '[]'::jsonb;
