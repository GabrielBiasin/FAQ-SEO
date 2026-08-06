"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiDelete, pokeWorker } from "@/lib/api";
import { Trash2, Plus, ChevronDown, Globe } from "lucide-react";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { projects } = await apiGet<{ projects: Project[] }>("/api/projects");
      setProjects(projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(p: Project) {
    const ok = window.confirm(
      `¿Borrar el proyecto "${p.name}"?\n\nSe eliminan también su crawl, páginas, preguntas, auditorías, competidores y FAQs. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setDeleting(p.id);
    setError(null);
    try {
      await apiDelete(`/api/projects/${p.id}`);
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al borrar");
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Proyectos</h1>
            <p className="text-sm text-zinc-500">Auditoría y benchmark GEO/SEO por marca</p>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            <Plus size={16} /> {showForm ? "Cancelar" : "Nuevo proyecto"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {showForm && <CreateProjectForm onCancel={() => setShowForm(false)} />}

        {loading ? (
          <p className="text-zinc-500">Cargando…</p>
        ) : projects.length === 0 && !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50"
          >
            <Globe size={24} className="text-zinc-400" />
            <span className="text-sm font-medium text-zinc-700">Creá tu primer proyecto</span>
            <span className="text-xs">Pegá la URL de una marca y empezamos a auditar su presencia GEO/SEO.</span>
          </button>
        ) : (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li
                key={p.id}
                className="group flex items-center gap-2 rounded-xl border border-zinc-200 bg-white pr-3 transition-colors hover:border-zinc-400"
              >
                <Link href={`/projects/${p.id}`} className="flex-1 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-zinc-900">{p.name}</h3>
                      <p className="text-sm text-zinc-500">{p.domain}</p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-zinc-400">{p.status}</span>
                  </div>
                </Link>
                <button
                  onClick={() => deleteProject(p)}
                  disabled={deleting === p.id}
                  title="Borrar proyecto"
                  aria-label={`Borrar ${p.name}`}
                  className="shrink-0 rounded-md p-2 text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {deleting === p.id ? "…" : <Trash2 size={16} strokeWidth={2} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateProjectForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState("");
  const [name, setName] = useState("");
  const [voiceGuide, setVoiceGuide] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [startCrawl, setStartCrawl] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Deriva el dominio en vivo para dar feedback.
  let derivedDomain = "";
  try {
    const u = urlInput.trim();
    if (u) derivedDomain = new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    derivedDomain = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const { project, crawlStarted } = await apiPost<{ project: Project; crawlStarted: boolean }>(
        "/api/projects",
        { root_url: urlInput.trim(), name: name.trim() || undefined, voice_guide: voiceGuide.trim() || undefined, max_pages: maxPages, start_crawl: startCrawl }
      );
      if (crawlStarted) pokeWorker(project.id);
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al crear");
      setSubmitting(false);
    }
  }

  const input =
    "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";
  const label = "block text-sm font-medium text-zinc-700 mb-1";

  return (
    <form onSubmit={submit} className="mb-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <label className={label}>URL del sitio *</label>
        <input
          className={input}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="ejemplo.com  o  https://ejemplo.com"
          autoFocus
          required
        />
        <p className="mt-1 h-4 text-xs text-zinc-400">
          {derivedDomain ? `Se creará el proyecto para ${derivedDomain}` : "Pegá el dominio o la URL completa."}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" checked={startCrawl} onChange={(e) => setStartCrawl(e.target.checked)} />
        Empezar a crawlear el sitio al crear
      </label>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ChevronDown size={14} className={advanced ? "rotate-180 transition-transform" : "transition-transform"} />
        Opciones avanzadas
      </button>

      {advanced && (
        <div className="space-y-4 rounded-lg bg-zinc-50 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Nombre (opcional)</label>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={derivedDomain || "Cliente X"} />
            </div>
            <div>
              <label className={label}>Máx. páginas a crawlear</label>
              <input
                type="number"
                className={input}
                value={maxPages}
                min={1}
                max={500}
                onChange={(e) => setMaxPages(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label className={label}>Guía de voz / tono (opcional)</label>
            <textarea
              className={input}
              rows={2}
              value={voiceGuide}
              onChange={(e) => setVoiceGuide(e.target.value)}
              placeholder="Tono cercano, español rioplatense, sin tecnicismos…"
            />
          </div>
        </div>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !urlInput.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {submitting ? "Creando…" : startCrawl ? "Crear y crawlear" : "Crear proyecto"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800">
          Cancelar
        </button>
      </div>
    </form>
  );
}
