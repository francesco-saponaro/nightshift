import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "./api/index.js";
import { stepsOf, type StepSummary } from "./timeline.js";

export function useIncidents() {
  return useQuery({ queryKey: ["incidents"], queryFn: () => api.listIncidents(), refetchInterval: 10_000 });
}

export function useIncident(id: string) {
  return useQuery({ queryKey: ["incident", id], queryFn: () => api.getIncident(id), refetchInterval: 10_000 });
}

export function useRun(id: string | undefined) {
  return useQuery({ queryKey: ["run", id], queryFn: () => (id ? api.getRun(id) : null), enabled: Boolean(id), refetchInterval: 10_000 });
}

/** The run's steps for the strip, or undefined while the events are on their way. */
export function useRunSteps(id: string | undefined): StepSummary[] | undefined {
  const { data } = useRun(id);
  return data ? stepsOf(data.events) : undefined;
}

/** The events of several runs at once, for the blocks that read across the night. */
export function useRuns(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({ queryKey: ["run", id], queryFn: () => api.getRun(id), refetchInterval: 10_000 })),
    combine: (results) => results.map((r) => r.data ?? null),
  });
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: () => api.health(), refetchInterval: 30_000 });
}

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: () => api.skills() });
}
