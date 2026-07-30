import { expect, test } from "@playwright/test";

test("Given authenticated local state When navigating core routes Then navigation remains authenticated", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "명함첩" })).toBeVisible();

  for (const route of ["/cards", "/ask", "/settings"]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}$`));
    await expect(page).not.toHaveURL(/\/sign-in/);
  }
});
