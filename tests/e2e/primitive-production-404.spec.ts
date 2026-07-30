import { expect, test } from "@playwright/test";

test("development primitive showcase is unavailable in production", async ({
  request,
}) => {
  const response = await request.get("/dev/primitives");
  expect(response.status()).toBe(404);
});
