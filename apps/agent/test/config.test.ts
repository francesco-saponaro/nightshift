import { describe, expect, it } from "vitest";
import { fixtureFor, readConfig } from "../src/config.js";

describe("the configuration", () => {
  it("runs dry, opens no pull request and merges nothing unless told to", () => {
    const config = readConfig({});
    expect(config.hasAgentKey).toBe(false);
    expect(config.pullRequests).toBeNull();
    expect(config.sentrySecret).toBe("");
  });

  it("opens pull requests only with NIGHTSHIFT_OPEN_PR, and asks for auto-merge only with NIGHTSHIFT_AUTO_MERGE as well", () => {
    expect(readConfig({ NIGHTSHIFT_AUTO_MERGE: "1" }).pullRequests).toBeNull();
    expect(readConfig({ NIGHTSHIFT_OPEN_PR: "1" }).pullRequests).toEqual({ label: "nightshift", autoMerge: false, author: { name: "Nightshift", email: "nightshift@localhost" } });
    expect(readConfig({ NIGHTSHIFT_OPEN_PR: "1", NIGHTSHIFT_AUTO_MERGE: "1", NIGHTSHIFT_PR_LABEL: "on-call", NIGHTSHIFT_GIT_NAME: "Night Shift", NIGHTSHIFT_GIT_EMAIL: "bot@example.com" }).pullRequests).toEqual({
      label: "on-call",
      autoMerge: true,
      author: { name: "Night Shift", email: "bot@example.com" },
    });
    expect(readConfig({ NIGHTSHIFT_OPEN_PR: "0" }).pullRequests).toBeNull();
    expect(readConfig({ NIGHTSHIFT_OPEN_PR: "false" }).pullRequests).toBeNull();
  });

  it("never reads the agent key itself, only whether there is one", () => {
    const config = readConfig({ ANTHROPIC_API_KEY: "sk-ant-not-a-real-key-0000000000" });
    expect(config.hasAgentKey).toBe(true);
    expect(JSON.stringify(config)).not.toContain("sk-ant");
  });

  it("picks the fixture recorded for the incident's flag, and the first one otherwise", () => {
    const known = ["empty-title", "date-off-by-one", "double-submit"];
    expect(fixtureFor("double-submit", "/f", known)).toBe("/f/double-submit");
    expect(fixtureFor("something-else", "/f", known)).toBe("/f/empty-title");
    expect(fixtureFor(null, "/f", known)).toBe("/f/empty-title");
  });
});
