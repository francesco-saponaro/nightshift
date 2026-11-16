import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

/** Renders a screen the way the app does: inside a router (links need one) and a query client (the strips fetch their run). */
export async function renderScreen(element: ReactNode): Promise<{ container: HTMLElement }> {
  const rootRoute = createRootRoute({ component: () => element });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ["/"] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    if (!result.container.textContent && !result.container.querySelector("ol, table, section")) throw new Error("not rendered yet");
  });
  return result;
}
