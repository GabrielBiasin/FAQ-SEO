-- Sub-dimensión "onpage" de Readiness: meta description + conteo de imágenes/alt.
-- Aditivo y nullable/con default para no romper crawls previos.
alter table public.pages
  add column if not exists meta_description text,
  add column if not exists img_total   integer not null default 0,
  add column if not exists img_with_alt integer not null default 0;
