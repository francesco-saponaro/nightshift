import { expect, test } from "@playwright/test";
import { addTodo, daysFromToday } from "./helpers.js";

test("a to-do due tomorrow says so, whatever the time of day", async ({ page }) => {
  await page.goto("/");
  await addTodo(page, "Call the bank", daysFromToday(1));
  const item = page.getByRole("listitem").filter({ hasText: "Call the bank" });
  await expect(item).toContainText("due tomorrow");
});

test("a to-do due today is not overdue", async ({ page }) => {
  await page.goto("/");
  await addTodo(page, "Water the plants", daysFromToday(0));
  const item = page.getByRole("listitem").filter({ hasText: "Water the plants" });
  await expect(item).toContainText("due today");
});

test("a to-do due last week is overdue by seven days", async ({ page }) => {
  await page.goto("/");
  await addTodo(page, "Return the library book", daysFromToday(-7));
  const item = page.getByRole("listitem").filter({ hasText: "Return the library book" });
  await expect(item).toContainText("overdue by 7 days");
});
