-- Nuevo tipo de trabajo: generar el blueprint de arquitectura de sitio.
alter type public.job_type add value if not exists 'build_blueprint';
