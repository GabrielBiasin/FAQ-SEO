# FAQ AEO Tool — Setup

## 1. Variables de entorno

Copiar `.env.local` y completar:

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERP_API_KEY=          # opcional — para PAA/autocomplete
```

## 2. Base de datos (Supabase)

1. Crear proyecto en https://supabase.com
2. Abrir SQL Editor y ejecutar todo el contenido de `supabase/001_initial_schema.sql`

## 3. Desarrollo local

```bash
npm install
npm run dev
```

Abrir http://localhost:3000

## 4. Milestones

- [x] M1 — Setup: Next.js + Supabase schema + Claude client
- [ ] M2 — Jobs queue + UI de proyectos
- [ ] M3 — crawl_site + visualización de páginas
- [ ] M4 — analyze_topics + tab de tópicos
- [ ] M5 — discover_questions (seeds + web search) + edición
- [ ] M6 — generate_answers + verify_answers + revisión de FAQs
- [ ] M7 — brand_audit + su tab
- [ ] M8 — Export
- [ ] M9 — Harness de eval (golden set, juez, dashboard)
- [ ] M10 — citation_check / online tracking
