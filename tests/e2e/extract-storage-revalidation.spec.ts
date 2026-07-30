import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const hasCredentials = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_TESTING_TOKEN",
  "CLERK_FAPI",
  "DEV_LOGIN_USER_ID",
].every((name) => Boolean(process.env[name]));

const adversarialFixtures = [
  { name: "spoofed-jpeg.jpg", code: "unsupported_media" },
  { name: "truncated-jpeg.jpg", code: "unsupported_media" },
  { name: "oversize.bin", code: "payload_too_large" },
] as const;

test("replaced storage bytes are rejected before AI and preserve the draft", async ({ page }) => {
  test.skip(!hasCredentials, "credential_gate");
  test.skip(process.env.QUEUE_UPSTREAM_OBSERVER !== "1", "observer_gate");
  const upload = await page.request.post("/api/drafts", {
    multipart: {
      image: {
        name: "revalidation.jpg",
        mimeType: "image/jpeg",
        buffer: await readFile(resolve(process.cwd(), "tests/fixtures/cards/valid-jpeg.jpg")),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const body: unknown = await upload.json();
  if (typeof body !== "object" || body === null || !("id" in body) || !("image_path" in body)) throw new Error("invalid upload response");
  if (typeof body.id !== "string" || typeof body.image_path !== "string") throw new Error("invalid upload response");
  const token = await page.evaluate(async () => {
    const clerk = Reflect.get(globalThis, "Clerk");
    const session = typeof clerk === "object" && clerk !== null ? Reflect.get(clerk, "session") : null;
    const getToken = typeof session === "object" && session !== null ? Reflect.get(session, "getToken") : null;
    if (typeof getToken !== "function") return null;
    const value: unknown = await Reflect.apply(getToken, session, []);
    return typeof value === "string" ? value : null;
  });
  expect(token).toEqual(expect.any(String));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  expect(supabaseUrl).toBeTruthy();
  expect(supabaseKey).toBeTruthy();
  let aiCalls = 0;
  const observerState = resolve(process.env.E2E_RUN_ROOT ?? "", "queue-upstream-observer.json");
  for (const fixture of adversarialFixtures) {
    const replacement = await readFile(resolve(process.cwd(), "tests/fixtures/cards", fixture.name));
    const objectUrl = `${supabaseUrl}/storage/v1/object/card-images/${body.image_path}`;
    const replaceResponse = await page.request.fetch(objectUrl, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, apikey: supabaseKey ?? "", "content-type": "image/jpeg", "x-upsert": "true" },
      data: replacement,
    });
    expect(replaceResponse.ok()).toBeTruthy();
    const extraction = await page.evaluate(async (id) => {
      const response = await fetch(`/api/drafts/${id}/extract`, { method: "POST" });
      return { status: response.status, body: (await response.json()) as unknown };
    }, body.id);
    expect(extraction.body).toMatchObject({ error: fixture.code });
    expect([413, 415]).toContain(extraction.status);
    const draftResponse = await page.request.get("/api/drafts");
    expect(draftResponse.status()).toBe(200);
    const draftsValue: unknown = await draftResponse.json();
    expect(draftsValue).toMatchObject({ drafts: expect.arrayContaining([expect.objectContaining({ id: body.id, status: "failed" })]) });
    try {
      await access(observerState);
      const observer: unknown = JSON.parse(await readFile(observerState, "utf8"));
      if (typeof observer === "object" && observer !== null && "count" in observer && typeof observer.count === "number") aiCalls = observer.count;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    expect(aiCalls).toBe(0);
  }
});
