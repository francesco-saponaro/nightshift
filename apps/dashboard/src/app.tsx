import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "./components/shell.js";
import { useHealth, useIncident, useIncidents, useRun, useSkills } from "./hooks.js";
import { IncidentDetail } from "./screens/incident.js";
import { IncidentsTable, finding } from "./screens/incidents.js";
import { SettingsScreen } from "./screens/settings.js";
import { TheBranches, WhereTheTimeGoes } from "./screens/time.js";
import { SkillsScreen } from "./screens/skills.js";

function Loading({ what }: { what: string }) {
  return <p className="text-muted">Loading {what}…</p>;
}

function Failed({ what, error }: { what: string; error: unknown }) {
  return (
    <p className="empty" role="alert">
      Couldn't load {what}: {error instanceof Error ? error.message : String(error)}. The agent's read API may be down.
    </p>
  );
}

function IncidentsRoute() {
  const incidents = useIncidents();
  const health = useHealth();
  return (
    <article>
      <h1 className="text-[24px] leading-8 font-medium">Incidents</h1>
      <p className="mt-1">{incidents.data ? finding(incidents.data) : incidents.isError ? "The list could not be loaded." : "Reading the record…"}</p>
      {health.data?.demo ? <p className="notice mt-4 inline-block">This is the published demo: three recorded runs, nothing live.</p> : null}
      <div className="mt-6">{incidents.data ? <IncidentsTable rows={incidents.data} /> : incidents.isError ? <Failed what="the incidents" error={incidents.error} /> : <Loading what="the incidents" />}</div>
      {incidents.data?.length ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <WhereTheTimeGoes rows={incidents.data} />
          <TheBranches rows={incidents.data} />
        </div>
      ) : null}
    </article>
  );
}

function IncidentRoute() {
  const { id } = incidentRoute.useParams();
  const incident = useIncident(id);
  const run = useRun(incident.data?.runs[0]?.id);
  if (incident.isError) return <Failed what="the incident" error={incident.error} />;
  if (!incident.data) return incident.isPending ? <Loading what="the incident" /> : <p className="empty">No incident {id} is recorded.</p>;
  return <IncidentDetail row={incident.data} run={run.data ?? null} />;
}

function SkillsRoute() {
  const skills = useSkills();
  if (skills.isError) return <Failed what="the skills" error={skills.error} />;
  if (!skills.data) return <Loading what="the skills" />;
  return <SkillsScreen skills={skills.data.skills} />;
}

function SettingsRoute() {
  const health = useHealth();
  if (health.isError) return <Failed what="the settings" error={health.error} />;
  if (!health.data) return <Loading what="the settings" />;
  return <SettingsScreen health={health.data} />;
}

const rootRoute = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});
const incidentsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: IncidentsRoute });
const incidentRoute = createRoute({ getParentRoute: () => rootRoute, path: "/incidents/$id", component: IncidentRoute });
const skillsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/skills", component: SkillsRoute });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsRoute });

const router = createRouter({ routeTree: rootRoute.addChildren([incidentsRoute, incidentRoute, skillsRoute, settingsRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
