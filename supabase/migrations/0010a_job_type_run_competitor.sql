-- Nuevo tipo de trabajo: crawl + auditoría de un competidor en un solo job.
alter type public.job_type add value if not exists 'run_competitor';
