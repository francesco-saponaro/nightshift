import { expect, test } from "@playwright/test";
import { addTodo } from "./helpers.js";

test("a to-do can be added, ticked off and removed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "To-dos" })).toBeVisible();

  await addTodo(page, "Renew the passport");
  const item = page.getByRole("listitem").filter({ hasText: "Renew the passport" });
  await expect(item).toBeVisible();
  await expect(item).toContainText("no due date");
  await expect(page.getByLabel("Title")).toHaveValue("");

  await item.getByRole("checkbox").click();
  await expect(item).toHaveClass(/done/);

  await item.getByRole("button", { name: "Remove: Renew the passport" }).click();
  await expect(item).toHaveCount(0);
});

test("an empty title is refused with a message, not a crash", async ({ page }) => {
  await page.goto("/");
  await addTodo(page, "   ");
  await expect(page.getByRole("alert")).toContainText("title");
  await expect(page.getByRole("alert")).not.toContainText("500");
});
