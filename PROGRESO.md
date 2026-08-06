# Estado del rebuild — Plataforma GEO/SEO Audit & Benchmark

> Documento para **retomar el trabajo** en cualquier sesión sin perder contexto.
> El estado real está en el código + tests; esto es el mapa.

## Qué es el proyecto (en una línea)
Se está reconstruyendo la app (antes "generador de FAQs") hacia una **plataforma de auditoría y benchmark GEO/SEO/AEO**: dado el sitio de una marca (o un documento), la puntúa por dimensión con evidencia, la compara vs. competencia, entrega un plan con entregables, y re-mide en el tiempo.

## Stack y datos clave
- Next.js (App Router) + Vercel · Supabase (Postgres, project `crskfdmmesiddjjoxmzj`) · LLM vía `src/lib/llm.ts` (**Gemini `gemini-flash-lite-latest`, free tier**; Anthropic opcional por `LLM_PROVIDER`).
- Repo: `GabrielBiasin/FAQ-SEO`. Prod: https://faq-aeo.vercel.app (auto-deploy por push).
- Cola de jobs batched + worker auto-encadenado + watchdog. `project_id` en todo.
- Restricción real: **Gemini free no tiene grounding web** (quota 0) → demanda/marca/citación corren degradadas; se cubren con SERP + cobertura. Sin APIs SEO pagas → señales "duras" (backlinks/DR) quedan `unavailable`.

## Documentos de diseño (fuente de verdad del plan)
En el scratchpad de la sesión (o pedírselos al usuario): `spec-plataforma-geo.md`, `respuesta-handoff.md`, `diseno-P0.md`. Este último tiene el **detalle de todos los PRs de P0** con criterios de aceptación.

## Metodología (decidida y confirmada)
- Tres dimensiones de primer nivel: **Readiness / Authority / Visibility** (score global = resumen secundario).
- **Contrato de señales versionado en Git** (no en la base); la base solo registra qué versión se usó.
- Estados de medición: `measured/inferred/estimated/field_measured/lab_measured/budget_defined/unavailable/experimental/failed`.
- **`score: null` si cobertura < `COVERAGE_MIN` (0.6)** — falta de datos NO es puntaje bajo; señales no medibles no arrastran.
- Deterministas en código; `llm_assisted` con temperatura baja + rúbrica fija + evidencia obligatoria + prompt versionado.
- `METHODOLOGY_VERSION = "2026.1"`.

## Progreso (PRs)
- **PR 0.1** ✅ Migración `0006`: `audit_snapshots`, `signal_measurements`, `evidence_items`, `dimension_scores`, `methodology_versions` + enums. Tipos DB.
- **PR 0.2** ✅ Núcleo del contrato: `src/lib/audit/{types,registry,aggregate}.ts`. `computeRegistryVersion` (hash estable), `aggregateDimension` (regla de cobertura). vitest + tests.
- **PR 0.3** ✅ 7 evaluadores deterministas de **Discoverability** (`src/lib/audit/signals/discoverability.ts`) + golden fixtures (sano/roto) + test de determinismo. 19 tests verdes.
- **PR 0.4** ⏭️ **SIGUIENTE**: runner de auditoría. Extender el crawler para capturar `<head>` (canonical, meta robots, hreflang, httpStatus) + robots + sitemaps → armar `AuditContext` real → correr evaluadores → agregar dimensión → **persistir snapshot completo en una transacción (inmutable)**. AC: misma web dos veces ⇒ snapshot equivalente.
- **PR 0.5** ⏭️ API `GET /api/projects/:id/audit/latest` + UI mínima que muestra score/estado/cobertura/confianza/evidencia (null-safe: `score: null` = "cobertura insuficiente", no 0).

## Fuera de P0 (no implementar aún)
Authority, Visibility, SOV (orgánico/generativo), competencia, Arquitecto de sitio, PageSpeed/performance. P0 valida la maquinaria con Discoverability; **P1A** suma técnico completo + PageSpeed (gratis) + matriz de cobertura + Readiness + recomendaciones; **P1B**: competencia, Arquitecto JSON/MD, briefs, Schema.

## Cómo verificar
- `npm test` (vitest) — deben pasar todos.
- `npx tsc --noEmit` — limpio.
- Migraciones en `supabase/migrations/`.

## Notas operativas
- El pipeline viejo de FAQs sigue vivo y **es un entregable**, no se toca.
- Rotar credenciales que pasaron por chat (tokens de deploy, API keys) cuando corresponda.
