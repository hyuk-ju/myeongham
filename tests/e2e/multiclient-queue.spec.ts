import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const hasCredentials = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_TESTING_TOKEN",
  "CLERK_FAPI",
  "DEV_LOGIN_USER_ID",
].every((name) => Boolean(process.env[name]));

test("same-owner contexts allow one active extraction and refetch busy", async ({ browser, page }) => {
  test.skip(!hasCredentials, "credential_gate");
  test.skip(process.env.QUEUE_UPSTREAM_OBSERVER !== "1", "observer_gate");
  const fixture = await readFile(resolve(process.cwd(), "tests/fixtures/cards/valid-jpeg.jpg"));
  const upload = await page.request.post("/api/drafts", {
    multipart: { image: { name: "queue.jpg", mimeType: "image/jpeg", buffer: fixture } },
  });
  expect(upload.status()).toBe(201);
  const body: unknown = await upload.json();
  const draftId = typeof body === "object" && body !== null && "id" in body && typeof body.id === "string" ? body.id : null;
  expect(draftId).not.toBeNull();

  const secondContext = await browser.newContext({ storageState: resolve(process.env.E2E_RUN_ROOT ?? "", "storage-state.json") });
  const second = await secondContext.newPage();
  const observerRoot = process.env.E2E_RUN_ROOT ?? "";
  const observerState = resolve(observerRoot, "queue-upstream-observer.json");
  const observerRelease = resolve(observerRoot, "queue-upstream-release");
  const firstCall = page.evaluate(async (id) => {
    const response = await fetch(`/api/drafts/${id}/extract`, { method: "POST" });
    return { status: response.status, body: (await response.json()) as unknown };
  }, draftId);
  await expect.poll(async () => JSON.parse(await readFile(observerState, "utf8"))).toMatchObject({ count: 1, held: true });
  const secondCall = await second.evaluate(async (id) => {
    const response = await fetch(`/api/drafts/${id}/extract`, { method: "POST" });
    return { status: response.status, body: (await response.json()) as unknown };
  }, draftId);
  expect(secondCall.status).toBe(409);
  expect(secondCall.body).toMatchObject({ code: "busy" });
  await writeFile(observerRelease, "release", { mode: 0o600 });
  const firstResult = await firstCall;
  expect([409, 502]).toContain(firstResult.status);
  await expect.poll(async () => JSON.parse(await readFile(observerState, "utf8"))).toEqual({ count: 1, held: false });
  await secondContext.close();
});
