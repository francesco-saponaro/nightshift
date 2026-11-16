import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoApi } from "../src/api/demo.js";
import { RunStrip } from "../src/components/run-strip.js";
import { IncidentDetail } from "../src/screens/incident.js";
import { IncidentsTable, finding } from "../src/screens/incidents.js";
import { SettingsScreen } from "../src/screens/settings.js";
import { stepsOf } from "../src/timeline.js";
import { renderScreen } from "./harness.js";

describe("the run strip", () => {
  it("draws one cell per step with its outcome and time in the accessible name", async () => {
    const rows = await demoApi.listIncidents();
    const run = await demoApi.getRun(rows[2]!.runs[0]!.id);
    await renderScreen(<RunStrip steps={stepsOf(run!.events)} />);
    const cells = screen.getAllByRole("listitem");
    expect(cells).toHaveLength(9);
    expect(cells[0]!.getAttribute("aria-label")).toMatch(/^Checkout: ok, \d+(\.\d)? s$/);
    expect(cells[7]!.getAttribute("aria-label")).toBe("Pull request: not opened");
    expect(cells[7]!.dataset["status"]).toBe("off");
    expect(cells[8]!.dataset["status"]).toBe("ok");
  });
});

describe("the incidents screen", () => {
  it("states the night's finding from the rows and lists each incident with its run", async () => {
    const rows = await demoApi.listIncidents();
    expect(finding(rows)).toBe("3 incidents, 3 fixed by the night shift, 0 waiting for a person; no pull request opened, NIGHTSHIFT_OPEN_PR is off.");
    await renderScreen(<IncidentsTable rows={rows} />);
    const table = screen.getByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(3);
    expect(within(bodyRows[0]!).getByRole("link", { name: /inc-ec6c6789/ })).toHaveProperty("href", expect.stringContaining("/incidents/inc-ec6c6789"));
    expect(within(bodyRows[0]!).getByText("PostHog")).toBeTruthy();
    expect(within(bodyRows[0]!).getByText("Fixed")).toBeTruthy();
    expect(within(bodyRows[2]!).getByText("+34 −10")).toBeTruthy();
  });

  it("keeps its frame when there is nothing yet", async () => {
    await renderScreen(<IncidentsTable rows={[]} />);
    expect(screen.getByText(/No incident has come in yet/)).toBeTruthy();
    expect(finding([])).toBe("No incident has come in yet; the webhooks are listening.");
  });
});

describe("the incident screen", () => {
  it("shows the error, the reproduction's failing output, the verification table, both verdicts and the pull request", async () => {
    const row = (await demoApi.getIncident("inc-aef82d2a"))!;
    const run = (await demoApi.getRun(row.runs[0]!.id))!;
    await renderScreen(<IncidentDetail row={row} run={run} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("inc-aef82d2a");
    const error = screen.getByRole("region", { name: "The error" });
    expect(within(error).getByText(/duplicate key value violates unique constraint/)).toBeTruthy();
    const reproduction = screen.getByRole("region", { name: "The reproduction" });
    expect(within(reproduction).getByText(/expected \[ 201, 500 \] to deeply equal \[ 200, 201 \]/)).toBeTruthy();
    const verification = screen.getByRole("table", { name: "Verification commands" });
    expect(within(verification).getAllByRole("row")).toHaveLength(6);
    expect(within(verification).getByText("pnpm lint")).toBeTruthy();
    const gates = screen.getByRole("region", { name: "The gates" });
    expect(within(gates).getByText("APPROVED")).toBeTruthy();
    expect(within(gates).getByText(/^SIMPLE — 4 files, \+40 −10/)).toBeTruthy();
    const pr = screen.getByRole("region", { name: "The pull request" });
    expect(within(pr).getByText(/^Not opened: NIGHTSHIFT_OPEN_PR is not set/)).toBeTruthy();
    expect(within(pr).getByRole("heading", { name: "The gates" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Facts" }).textContent).toContain("nightshift/inc-aef82d2a");
  });

  it("shows the agent's transcript grouped by phase, with tool calls as rows", async () => {
    const row = (await demoApi.getIncident("inc-f42f2815"))!;
    const run = (await demoApi.getRun(row.runs[0]!.id))!;
    await renderScreen(<IncidentDetail row={row} run={run} />);
    const transcript = screen.getByRole("region", { name: "The agent's transcript" });
    expect(within(transcript).getByRole("heading", { name: /Reproduction/ })).toBeTruthy();
    expect(within(transcript).getAllByText("Read").length).toBeGreaterThan(1);
    expect(within(transcript).getByText(/replayed from a recorded transcript/)).toBeTruthy();
  });
});

describe("the settings screen", () => {
  it("names every integration with whether it is configured, and says when it is the demo", async () => {
    const health = await demoApi.health();
    await renderScreen(<SettingsScreen health={health} />);
    for (const name of ["Sentry", "PostHog", "Coding agent", "Sandbox", "Pull requests"]) expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.getAllByText("Not configured")).toHaveLength(4);
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.getByText(/recorded runs/)).toBeTruthy();
  });
});
