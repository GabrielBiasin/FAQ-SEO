// Tiny client-side fetch helpers with JSON + error handling.

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `GET ${url} failed`);
  return json as T;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `POST ${url} failed`);
  return json as T;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `DELETE ${url} failed`);
  return json as T;
}

/** Kick the worker to drain the queue (fire-and-forget friendly). */
export function pokeWorker(projectId?: string) {
  return apiPost("/api/worker", { project_id: projectId }).catch(() => {});
}
