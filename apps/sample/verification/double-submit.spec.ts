import { expect, test } from "@playwright/test";

test("a double click on Add creates one to-do and shows no error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Title").fill("Book the dentist");
  // Both clicks send a request; collect both answers before judging, or the second one is missed.
  const statuses: number[] = [];
  page.on("response", (r) => {
    if (r.request().method() === "POST" && r.url().endsWith("/api/todos")) statuses.push(r.status());
  });
  await page.getByRole("button", { name: "Add" }).dblclick();
  await expect.poll(() => statuses.length).toBe(2);
  expect(statuses.sort()).toEqual([200, 201]);
  const items = page.getByRole("listitem").filter({ hasText: "Book the dentist" });
  await expect(items).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Book the dentist" })).toHaveCount(1);
});
