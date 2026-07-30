import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolve } from "node:path";
import { AuthView } from "@/app/auth-shell";
import { NotAllowedView } from "@/app/not-allowed/not-allowed-view";
import { Action } from "@/components/ui";

const evidenceRoot = resolve(".omo/evidence/business-card-priority-fixes");
const viewports = [
  { name: "375", width: 375, height: 1200 },
  { name: "768", width: 768, height: 1200 },
  { name: "1280", width: 1280, height: 1200 },
] as const;

for (const viewport of viewports) {
  test(`auth view remains readable at ${viewport.name}px`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    const view = await mount(
      <AuthView error="not_allowed">
        <button type="button">Synthetic sign in</button>
      </AuthView>,
    );
    await expect(view.getByRole("heading", { name: "명함첩" })).toBeVisible();
    await expect(view.getByRole("alert").locator("p")).toHaveCSS(
      "word-break",
      "keep-all",
    );
    await view.getByRole("button", { name: "Synthetic sign in" }).focus();
    await expect(view.getByRole("button", { name: "Synthetic sign in" })).toBeFocused();
    await page.screenshot({
      path: resolve(evidenceRoot, `task-7-auth-${viewport.name}.png`),
      fullPage: true,
    });

    const audit = await new AxeBuilder({ page })
      .include('[data-testid="ct-production-styles"]')
      .analyze();
    expect(audit.violations).toEqual([]);
  });

  test(`not-allowed view masks support details at ${viewport.name}px`, async ({
    mount,
    page,
  }) => {
    await page.setViewportSize(viewport);
    const view = await mount(
      <NotAllowedView
        supportCode="ABCD-EF01-2345"
        maskedEmail="p*****@example.com"
        privateRelay={true}
        signOutAction={
          <Action variant="secondary" className="w-full">
            다른 계정으로 로그인
          </Action>
        }
      />,
    );
    await expect(view.getByText("ABCD-EF01-2345")).toBeVisible();
    await expect(view.getByText("p*****@example.com")).toBeVisible();
    await expect(view).not.toContainText("user_");
    await page.screenshot({
      path: resolve(evidenceRoot, `task-7-not-allowed-${viewport.name}.png`),
      fullPage: true,
    });

    const audit = await new AxeBuilder({ page })
      .include('[data-testid="ct-production-styles"]')
      .analyze();
    expect(audit.violations).toEqual([]);
  });
}
