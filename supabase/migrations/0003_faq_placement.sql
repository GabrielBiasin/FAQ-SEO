-- FAQ placement: map each question/FAQ to the site section/page where it
-- should be published (Home, Contacto, each service/product page), targeting
-- 5–10 FAQs per relevant section.

alter type job_type add value if not exists 'assign_placements';

alter table public.questions
  add column if not exists placement_page_id uuid references public.pages(id) on delete set null,
  add column if not exists placement_section text;

create index if not exists questions_placement_page_id_idx
  on public.questions(placement_page_id);
