import type { Page } from "@playwright/test";

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysFromToday(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export async function addTodo(page: Page, title: string, dueOn?: string) {
  await page.getByLabel("Title").fill(title);
  if (dueOn) await page.getByLabel("Due on").fill(dueOn);
  await page.getByRole("button", { name: "Add" }).click();
}
