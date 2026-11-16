import type { DashboardApi, Health } from "./types.js";

/** The agent's read API, reached through /api (proxied by Vite in development, by the host in production). */
export function serverApi(base = "/api"): DashboardApi {
  async function get<T>(path: string): Promise<T | null> {
    const res = await fetch(`${base}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return (await res.json()) as T;
  }
  return {
    listIncidents: async () => (await get<{ incidents: DashboardApi extends never ? never : Awaited<ReturnType<DashboardApi["listIncidents"]>> }>("/incidents"))?.incidents ?? [],
    getIncident: (id) => get(`/incidents/${encodeURIComponent(id)}`),
    getRun: (id) => get(`/runs/${encodeURIComponent(id)}`),
    health: async () => ({ ...(await get<Omit<Health, "demo">>("/health"))!, demo: false }),
    skills: async () => (await get<{ skills: Awaited<ReturnType<DashboardApi["skills"]>>["skills"] }>("/skills")) ?? { skills: [] },
  };
}
