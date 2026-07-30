import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolve } from "node:path";
import { PrimitiveShowcase } from "@/components/ui/primitive-showcase";

const evidenceRoot = resolve(
  ".omo/evidence/business-card-priority-fixes",
);

for (const viewport of [
  { name: "375", width: 375, height: 1200 },
  { name: "768", width: 768, height: 1200 },
  { name: "1280", width: 1280, height: 1200 },
] as const) {
  test(`primitive showcase is responsive and accessible at ${viewport.name}px`, async ({
    mount,
    page,
  }) => {
    await page.setViewportSize(viewport);
    const view = await mount(<PrimitiveShowcase />);

    await expect(
      view.getByRole("heading", { name: "Paper binder primitives" }),
    ).toBeVisible();
    await view.getByRole("button", { name: "촬영" }).hover();
    await view.getByRole("button", { name: "더 보기" }).focus();
    await expect(view.getByRole("button", { name: "더 보기" })).toBeFocused();

    const controls = view.getByRole("button");
    for (let index = 0; index < (await controls.count()); index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const audit = await new AxeBuilder({ page })
      .include('[data-testid="ct-production-styles"]')
      .analyze();
    expect(audit.violations).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const spinnerDuration = await view
      .locator(".ui-spinner")
      .first()
      .evaluate((element) => getComputedStyle(element).animationDuration);
    expect(Number.parseFloat(spinnerDuration)).toBeLessThanOrEqual(0.00001);

    await page.screenshot({
      path: resolve(evidenceRoot, `task-7-primitives-${viewport.name}.png`),
      fullPage: true,
    });
  });
}
