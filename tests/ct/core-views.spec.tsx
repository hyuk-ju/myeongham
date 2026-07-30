import { expect, test } from "@playwright/experimental-ct-react";
import AxeBuilder from "@axe-core/playwright";
import { AuthShell } from "@/app/auth-shell";
import { NotAllowedView } from "@/app/not-allowed/not-allowed-view";

test("Given the pure auth shell When mounted with synthetic content Then the core identity renders", async ({
  mount,
}) => {
  const view = await mount(
    <AuthShell>
      <button type="button">Synthetic sign in</button>
    </AuthShell>,
  );

  await expect(view.getByRole("heading", { name: "명함첩" })).toBeVisible();
  await expect(view.getByRole("button", { name: "Synthetic sign in" })).toBeVisible();
});

test("Given a synthetic not-allowed state When mounted Then the current error contract renders", async ({
  mount,
}) => {
  const view = await mount(
    <AuthShell error="not_allowed">
      <span>Blocked fixture</span>
    </AuthShell>,
  );

  await expect(view).toContainText("허용되지 않은 계정입니다.");
  await expect(view).toContainText("ALLOWED_EMAILS");
});

test("Given a pure not-allowed view When mounted Then support details stay masked", async ({
  mount,
}) => {
  const view = await mount(
    <NotAllowedView
      supportCode="ABCD-EF01-2345"
      maskedEmail="p*****@example.com"
      privateRelay={false}
      signOutAction={<button type="button">다른 계정으로 로그인</button>}
    />,
  );

  await expect(view.getByText("ABCD-EF01-2345")).toBeVisible();
  await expect(view.getByText("p*****@example.com")).toBeVisible();
  await expect(view.getByRole("button", { name: "지원 정보 복사" })).toBeVisible();
  await expect(view).not.toContainText("user_");
});

test("Given the production-styled pure auth view When audited Then axe finds no baseline violations", async ({
  mount,
  page,
}) => {
  await mount(
    <AuthShell>
      <button type="button">Synthetic sign in</button>
    </AuthShell>,
  );

  const audit = await new AxeBuilder({ page })
    .include('[data-testid="ct-production-styles"]')
    .analyze();
  expect(audit.violations).toEqual([]);
});
