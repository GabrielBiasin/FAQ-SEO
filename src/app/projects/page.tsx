"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Proyectos</h1>
            <p className="text-sm text-zinc-500">Sitios de clientes para generar FAQs AEO</p>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            {showForm ? "Cancelar" : "+ Nuevo proyecto"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {showForm && (
          <CreateProjectForm
            onCreated={() => {
              setShowForm(false);
              load();
            }}
          />
        )}

        {loading ? (
          <p className="text-zinc-500">Cargando…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center text-zinc-500">
            No hay proyectos todavía. Creá el primero.
          </div>
        ) : (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-zinc-900">{p.name}</h3>
                      <p className="text-sm text-zinc-500">{p.domain}</p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-zinc-400">
                      {p.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateProjectForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    domain: "",
    root_url: "",
    voice_guide: "",
    max_pages: 50,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await apiPost("/api/projects", form);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";
  const label = "block text-sm font-medium text-zinc-700 mb-1";

  return (
    <form
      onSubmit={submit}
      className="mb-6 space-y-4 rounded-lg border border-zinc-200 bg-white p-5"
    >
      <div>
        <label className={label}>Nombre *</label>
        <input
          className={input}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Cliente X"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Dominio *</label>
          <input
            className={input}
            value={form.domain}
            onChange={(e) => set("domain", e.target.value)}
            placeholder="ejemplo.com"
            required
          />
        </div>
        <div>
          <label className={label}>Root URL *</label>
          <input
            className={input}
            value={form.root_url}
            onChange={(e) => set("root_url", e.target.value)}
            placeholder="https://ejemplo.com"
            required
          />
        </div>
      </div>
      <div>
        <label className={label}>Guía de voz / tono (opcional)</label>
        <textarea
          className={input}
          rows={3}
          value={form.voice_guide}
          onChange={(e) => set("voice_guide", e.target.value)}
          placeholder="Tono cercano, en español rioplatense, sin tecnicismos…"
        />
      </div>
      <div>
        <label className={label}>Máx. páginas a crawlear</label>
        <input
          type="number"
          className={input}
          value={form.max_pages}
          min={1}
          max={500}
          onChange={(e) => set("max_pages", Number(e.target.value))}
        />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {submitting ? "Creando…" : "Crear proyecto"}
      </button>
    </form>
  );
}
