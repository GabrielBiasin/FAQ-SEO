-- Job type para la auditoría + RPC que persiste un snapshot completo en UNA
-- transacción (funciones plpgsql son atómicas) → snapshot inmutable.

alter type job_type add value if not exists 'run_audit';

create or replace function public.insert_audit_snapshot(
  p_project_id uuid,
  p_methodology_version text,
  p_signal_registry_version text,
  p_input_kind text,
  p_root_url text,
  p_crawl_id uuid,
  p_measurements jsonb,
  p_dimensions jsonb
) returns uuid
language plpgsql
as $$
declare
  v_snapshot uuid;
  m jsonb;
  v_measurement uuid;
  e jsonb;
  d jsonb;
begin
  insert into public.audit_snapshots(
    project_id, status, methodology_version, signal_registry_version, input_kind, root_url, crawl_id
  ) values (
    p_project_id, 'done', p_methodology_version, p_signal_registry_version, p_input_kind, p_root_url, p_crawl_id
  ) returning id into v_snapshot;

  for m in select value from jsonb_array_elements(p_measurements) loop
    insert into public.signal_measurements(
      snapshot_id, project_id, signal_id, signal_version, top_dimension, sub_dimension,
      type, state, raw, normalized, confidence, model, prompt_version, error
    ) values (
      v_snapshot, p_project_id, m->>'signal_id', (m->>'signal_version')::int,
      (m->>'top_dimension')::top_dimension, m->>'sub_dimension', (m->>'type')::signal_type,
      (m->>'state')::measurement_state, coalesce(m->'raw','{}'::jsonb),
      nullif(m->>'normalized','')::numeric, nullif(m->>'confidence','')::numeric,
      m->>'model', m->>'prompt_version', m->>'error'
    ) returning id into v_measurement;

    for e in select value from jsonb_array_elements(coalesce(m->'evidence','[]'::jsonb)) loop
      insert into public.evidence_items(measurement_id, project_id, key, kind, value, url)
      values (v_measurement, p_project_id, e->>'key', e->>'kind', coalesce(e->'value','null'::jsonb), e->>'url');
    end loop;
  end loop;

  for d in select value from jsonb_array_elements(p_dimensions) loop
    insert into public.dimension_scores(
      snapshot_id, project_id, top_dimension, sub_dimension, score, state, coverage,
      confidence, measured_signals, total_signals
    ) values (
      v_snapshot, p_project_id, (d->>'top_dimension')::top_dimension, d->>'sub_dimension',
      nullif(d->>'score','')::numeric, (d->>'state')::measurement_state, (d->>'coverage')::numeric,
      nullif(d->>'confidence','')::numeric, (d->>'measured_signals')::int, (d->>'total_signals')::int
    );
  end loop;

  insert into public.methodology_versions(version) values (p_methodology_version)
    on conflict (version) do nothing;

  return v_snapshot;
end;
$$;
