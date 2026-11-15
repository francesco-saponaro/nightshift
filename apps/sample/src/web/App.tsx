import { useEffect, useState, type FormEvent } from "react";
import { dueLabel } from "../server/dates.js";
import { api, type Todo } from "./api.js";

function newDraft() {
  return { title: "", dueOn: "", key: crypto.randomUUID() };
}

export function App() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  // The draft carries its own client key. A double click sends the same draft twice, key included, and the server
  // must create it once. The key changes only when the draft is cleared, in the same state update as the title.
  const [draft, setDraft] = useState(() => newDraft());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.list().then(setTodos, (e: Error) => setError(e.message));
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const todo = await api.add({ title: draft.title, dueOn: draft.dueOn || null, clientKey: draft.key });
      setTodos((current) => ((current ?? []).some((t) => t.id === todo.id) ? current : [...(current ?? []), todo]));
      setDraft((current) => (current.key === draft.key ? newDraft() : current));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggle(todo: Todo) {
    try {
      const updated = await api.setDone(todo.id, !todo.done);
      setTodos((current) => (current ?? []).map((t) => (t.id === todo.id ? updated : t)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(todo: Todo) {
    try {
      await api.remove(todo.id);
      setTodos((current) => (current ?? []).filter((t) => t.id !== todo.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main>
      <h1>To-dos</h1>
      <form onSubmit={add} aria-label="Add a to-do">
        <input aria-label="Title" placeholder="What needs doing?" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input aria-label="Due on" type="date" value={draft.dueOn} onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })} />
        <button className="primary" type="submit">
          Add
        </button>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {todos === null ? (
        <p className="empty">Loading…</p>
      ) : todos.length === 0 ? (
        <p className="empty">Nothing to do.</p>
      ) : (
        <ul aria-label="To-dos">
          {todos.map((todo) => (
            <li key={todo.id} className={todo.done ? "done" : ""}>
              <input type="checkbox" aria-label={`Done: ${todo.title}`} checked={todo.done} onChange={() => toggle(todo)} />
              <span className="title">{todo.title}</span>
              <span className={`due${todo.daysLeft !== null && todo.daysLeft < 0 ? " overdue" : ""}`}>{dueLabel(todo.daysLeft)}</span>
              <button className="remove" type="button" aria-label={`Remove: ${todo.title}`} onClick={() => remove(todo)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
