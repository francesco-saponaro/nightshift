# React, as it is written here

The front of the sample app is small on purpose: one `App.tsx`, one `api.ts`, one stylesheet. This file says how React is written in it, so a change fits what is there instead of bringing a second way of doing things. Read it whenever the change touches a `.tsx` file.

## State

- State lives in the component that renders it, with `useState`. There is no store, no context, no reducer, and a fix does not add one. If two components need the same state, lift it to the nearest parent.
- A form is one object in state (`draft`), not one `useState` per field. The draft carries the client key that makes the submit idempotent, so a double submit sends the same key twice and the server creates one row. The key changes in the same state update that clears the title, never before and never in a ref, or a second click can send the old title with a new key.
- A list from the server is `T[] | null`: `null` while loading, `[]` when empty. Do not model loading with a boolean beside the data; the two can disagree.
- Update a list from the previous value (`setTodos((current) => ...)`), never from the closure, so two answers arriving close together both land.
- After a create, add the answer to the list only if its id is not already there. The server may answer the same to-do twice (double submit).

## Effects

- `useEffect` is for talking to the outside world on mount, and little else. The only effect in `App.tsx` loads the list once. Do not add an effect to derive state from other state; compute it in render.
- No effect depends on a value it also sets.
- There is no `useMemo` or `useCallback` in this app and a fix does not introduce one. Nothing here is slow enough to measure.

## Data fetching

- All requests go through `api.ts`. A component never calls `fetch`.
- `api.ts` throws `ApiError` with the status and a sentence built from the server's `issues`, so the user reads "title: the title cannot be empty", not "Request failed". A 500 reads "The server answered 500." and nothing more; the detail is in the tracker, not on the screen.
- A request that carries no body sends no `content-type` header. Fastify refuses an empty JSON body with a 400.
- Every call site catches and shows the error in the one `role="alert"` paragraph. There is no toast library and no error boundary for request errors.

## Forms and events

- A form submits with `onSubmit` and `event.preventDefault()`, never with an `onClick` on the button, so Enter works.
- Inputs are controlled (`value` + `onChange`). Labels are real labels or `aria-label`; the verification scenarios find fields by them.
- Do not disable the submit button while a request is in flight to "prevent" a double submit. The server is idempotent on the client key; that is the fix, and disabling the button hides the test of it.
- Do not clear the form before the server has answered. A failed submit keeps what the user typed.

## Rendering

- Three states, in this order: `null` → "Loading…", `[]` → "Nothing to do.", otherwise the list. Keep the order so the empty state never flashes before the first load.
- A to-do's due label comes from `dueLabel(daysLeft)` in `src/server/dates.ts`, shared with the API. Do not reimplement it in the front; a fix to the wording is one change in one place.
- Classes carry state (`done`, `overdue`) and the stylesheet styles them. No inline styles, no CSS-in-JS, no utility framework; the whole stylesheet is fifty lines.
- Keys are the server's ids, never the index.

## What not to add

A router, a query library, a form library, a component library, a state library, a test renderer. The app is a fixture for Nightshift, and every library is one more thing an incident can be about. If a fix seems to need one of these, the fix is wrong.

## Tests

The front is tested through the verification scenarios in `apps/sample/verification/`, in a real browser, and not with a component test runner. A change to the front comes with the scenario that shows it, or the change to the scenario it affects.
