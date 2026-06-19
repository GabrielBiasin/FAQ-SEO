"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import JobsPanel from "@/components/JobsPanel";
import CrawlTab from "@/components/tabs/CrawlTab";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];

const TABS = [
  { key: "crawl", label: "Crawl" },
  { key: "questions", label: "Tópicos & Preguntas" },
  { key: "brand", label: "Auditoría de marca" },
  { key: "faqs", label: "FAQs" },
  { key: "export", label: "Export" },
  { key: "eval", label: "Eval" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<TabKey>("crawl");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ project: Project }>(`/api/projects/${id}`)
      .then((r) => setProject(r.project))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [id]);

  if (error)
    return (
      <div className="p-8 text-red-600">
        {error} — <Link href="/projects" className="underline">volver</Link>
      </div>
    );
  if (!project) return <div className="p-8 text-zinc-500">Cargando…</div>;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <div className="mx-auto max-w-5xl">
          <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Proyectos
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">{project.name}</h1>
          <p className="text-sm text-zinc-500">
            <a
              href={project.root_url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {project.domain}
            </a>
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-8">
        <nav className="flex gap-1 border-b border-zinc-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TabContent tab={tab} project={project} />
          </div>
          <aside className="lg:col-span-1">
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">Trabajos</h3>
            <JobsPanel projectId={id} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function TabContent({ tab, project }: { tab: TabKey; project: Project }) {
  const placeholder = (milestone: string) => (
    <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-400">
      Pendiente — se implementa en {milestone}.
    </div>
  );

  switch (tab) {
    case "crawl":
      return <CrawlTab projectId={project.id} />;
    case "questions":
      return placeholder("Milestones 4–5");
    case "brand":
      return placeholder("Milestone 7");
    case "faqs":
      return placeholder("Milestone 6");
    case "export":
      return placeholder("Milestone 8");
    case "eval":
      return placeholder("Milestone 9");
    default:
      return null;
  }
}
