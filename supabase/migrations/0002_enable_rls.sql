-- Phase 1 security posture: enable RLS on all tables with NO policies.
-- The app accesses everything via the service-role key (which bypasses RLS),
-- so this denies the public/anon role entirely without affecting the app.
-- This resolves the "RLS Disabled in Public" critical advisories.
--
-- Phase 2 will add membership-scoped policies (see notes in 0001_init.sql) and
-- switch the app's browser client from API-route/service-role access to direct
-- RLS-protected access.

alter table public.projects        enable row level security;
alter table public.crawls          enable row level security;
alter table public.pages           enable row level security;
alter table public.seed_questions  enable row level security;
alter table public.brand_audits    enable row level security;
alter table public.topics          enable row level security;
alter table public.questions       enable row level security;
alter table public.faqs            enable row level security;
alter table public.jobs            enable row level security;
alter table public.golden_faqs     enable row level security;
alter table public.evals           enable row level security;
alter table public.citation_checks enable row level security;
