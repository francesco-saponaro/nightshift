export interface Todo {
  id: string;
  title: string;
  dueOn: string | null;
  done: boolean;
  daysLeft: number | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "content-type": "application/json" } : {} });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const issues = body && typeof body === "object" && "issues" in body ? (body as { issues: { path: string; message: string }[] }).issues : [];
    const message = issues.length ? issues.map((i) => `${i.path}: ${i.message}`).join("; ") : `The server answered ${res.status}.`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  list: () => call<{ todos: Todo[] }>("/api/todos").then((r) => r.todos),
  add: (input: { title: string; dueOn: string | null; clientKey: string }) => call<Todo>("/api/todos", { method: "POST", body: JSON.stringify(input) }),
  setDone: (id: string, done: boolean) => call<Todo>(`/api/todos/${id}`, { method: "PATCH", body: JSON.stringify({ done }) }),
  remove: (id: string) => call<void>(`/api/todos/${id}`, { method: "DELETE" }),
};
