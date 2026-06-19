"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { Database } from "@/types/database";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-600",
  running: "bg-blue-100 text-blue-700 animate-pulse",
  done: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

/**
 * Polls /api/jobs for a project and renders a compact live job list.
 * Polling backs off when nothing is active.
 */
export default function JobsPanel({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;

    async function tick() {
      try {
        const { jobs } = await apiGet<{ jobs: Job[] }>(
          `/api/jobs?project_id=${projectId}`
        );
        if (!alive) return;
        setJobs(jobs);
        const hasActive = jobs.some(
          (j) => j.status === "queued" || j.status === "running"
        );
        timer = setTimeout(tick, hasActive ? 2000 : 8000);
      } catch {
        timer = setTimeout(tick, 8000);
      }
    }
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [projectId]);

  if (jobs.length === 0) {
    return <p className="text-sm text-zinc-400">Sin trabajos en cola.</p>;
  }

  return (
    <ul className="space-y-2">
      {jobs.map((j) => (
        <li
          key={j.id}
          className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <span className="font-mono text-zinc-700">{j.type}</span>
          <div className="flex items-center gap-3">
            {j.error && (
              <span className="max-w-xs truncate text-xs text-red-500" title={j.error}>
                {j.error}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                STATUS_STYLES[j.status] ?? "bg-zinc-100 text-zinc-600"
              }`}
            >
              {j.status}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
