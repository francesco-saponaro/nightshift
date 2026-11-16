import { serverApi } from "./client.js";
import { demoApi } from "./demo.js";
import type { DashboardApi } from "./types.js";

export const DEMO = import.meta.env["VITE_DEMO"] === "1";
export const api: DashboardApi = DEMO ? demoApi : serverApi();
export type * from "./types.js";
