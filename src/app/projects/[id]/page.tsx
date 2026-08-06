"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import JobsPanel from "@/components/JobsPanel";
import OverviewTab from "@/components/tabs/OverviewTab";
import CrawlTab from "@/components/tabs/CrawlTab";
import TopicsQuestionsTab from "@/components/tabs/TopicsQuestionsTab";
import FaqsTab from "@/components/tabs/FaqsTab";
import BrandTab from "@/components/tabs/BrandTab";
import ExportTab from "@/components/tabs/ExportTab";
import EvalTab from "@/components/tabs/EvalTab";
import AuditTab from "@/components/tabs/AuditTab";
import CoverageTab from "@/components/tabs/CoverageTab";
import RecommendationsTab from "@/components/tabs/RecommendationsTab";
import CompetitorsTab from "@/components/tabs/CompetitorsTab";
import TrackingTab from "@/components/tabs/TrackingTab";
import ArchitectTab from "@/components/tabs/ArchitectTab";
import {
  LayoutDashboard,
  Gauge,
  Target,
  Lightbulb,
  Swords,
  TrendingUp,
  LayoutTemplate,
  Spline,
  MessageCircleQuestion,
  HelpCircle,
  ShieldCheck,
  Download,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];

interface TabDef {
  key: string;
  label: string;
  icon: LucideIcon;
}
interface NavGroup {
  title: string | null;
  tabs: TabDef[];
}

const NAV: NavGroup[] = [
  { title: null, tabs: [{ key: "overview", label: "Resumen", icon: LayoutDashboard }] },
  {
    title: "Diagnóstico",
    tabs: [
      { key: "audit", label: "Auditoría GEO", icon: Gauge },
      { key: "coverage", label: "Cobertura de demanda", icon: Target },
      { key: "recommendations", label: "Recomendaciones", icon: Lightbulb },
    ],
  },
  {
    title: "Competencia",
    tabs: [
      { key: "competitors", label: "Competencia", icon: Swords },
      { key: "tracking", label: "Evolución", icon: TrendingUp },
    ],
  },
  { title: "Estrategia", tabs: [{ key: "architect", label: "Arquitecto de sitio", icon: LayoutTemplate }] },
  {
    title: "Datos",
    tabs: [
      { key: "crawl", label: "Crawl", icon: Spline },
      { key: "questions", label: "Demanda (tópicos & preguntas)", icon: MessageCircleQuestion },
    ],
  },
  {
    title: "Contenido",
    tabs: [
      { key: "faqs", label: "FAQs", icon: HelpCircle },
      { key: "brand", label: "Auditoría de marca", icon: ShieldCheck },
      { key: "export", label: "Export", icon: Download },
      { key: "eval", label: "Eval", icon: FlaskConical },
    ],
  },
];

const ALL_TABS = NAV.flatMap((g) => g.tabs);

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<string>("overview");
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

  const activeLabel = ALL_TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <Link href="/projects" className="text-xs text-zinc-500 hover:text-zinc-800">
              ← Proyectos
            </Link>
            <h1 className="mt-1 text-xl font-bold text-zinc-900">{project.name}</h1>
            <a
              href={project.root_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 hover:underline"
            >
              {project.domain}
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 lg:flex-row">
        {/* Sidebar nav */}
        <nav className="shrink-0 lg:w-60">
          <div className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
            {NAV.map((group, gi) => (
              <div key={gi} className="lg:mb-3">
                {group.title && (
                  <div className="hidden px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 lg:block">
                    {group.title}
                  </div>
                )}
                <div className="flex gap-1 lg:flex-col">
                  {group.tabs.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:w-full ${
                          active
                            ? "bg-zinc-900 font-medium text-white"
                            : "text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="lg:truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-800">{activeLabel}</h2>
          </div>
          <TabContent tab={tab} project={project} onNavigate={setTab} />
        </div>

        {/* Jobs */}
        <aside className="shrink-0 lg:w-64">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Trabajos</h3>
          <JobsPanel projectId={id} />
        </aside>
      </div>
    </div>
  );
}

function TabContent({
  tab,
  project,
  onNavigate,
}: {
  tab: string;
  project: Project;
  onNavigate: (tab: string) => void;
}) {
  switch (tab) {
    case "overview":
      return <OverviewTab projectId={project.id} onNavigate={onNavigate} />;
    case "audit":
      return <AuditTab projectId={project.id} />;
    case "coverage":
      return <CoverageTab projectId={project.id} />;
    case "recommendations":
      return <RecommendationsTab projectId={project.id} />;
    case "competitors":
      return <CompetitorsTab projectId={project.id} />;
    case "tracking":
      return <TrackingTab projectId={project.id} />;
    case "architect":
      return <ArchitectTab projectId={project.id} />;
    case "crawl":
      return <CrawlTab projectId={project.id} />;
    case "questions":
      return <TopicsQuestionsTab projectId={project.id} />;
    case "faqs":
      return <FaqsTab projectId={project.id} />;
    case "brand":
      return <BrandTab projectId={project.id} />;
    case "export":
      return <ExportTab projectId={project.id} />;
    case "eval":
      return <EvalTab projectId={project.id} />;
    default:
      return null;
  }
}
