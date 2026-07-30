import { createClerkClient } from "@clerk/nextjs/server";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import {
  cleanupAuthArtifacts,
  CredentialGateError,
  e2ePaths,
  parseAuthenticatedClaims,
  readTicketReference,
  requiredEnvironment,
  writeTicketReference,
} from "./fixtures";

setup.describe.configure({ mode: "serial" });

setup("authenticated local setup", async ({ page }) => {
  const secretKey = requiredEnvironment("CLERK_SECRET_KEY");
  const publishableKey = requiredEnvironment("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const frontendApiUrl = requiredEnvironment("CLERK_FAPI");
  const userId = requiredEnvironment("DEV_LOGIN_USER_ID");
  const localSupabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const localSupabaseKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const clerk = createClerkClient({ secretKey, publishableKey });
  let tokenId: string | null = null;

  try {
    await setupClerkTestingToken({ page, options: { frontendApiUrl } });
    const signInToken = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 120,
    });
    tokenId = signInToken.id;
    await writeTicketReference(signInToken.id, false);
    await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(signInToken.token)}`);
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
    await expect(page.getByRole("heading", { name: "명함첩" })).toBeVisible();

    const jwt = await page.evaluate(async () => {
      const clerkValue: unknown = Reflect.get(globalThis, "Clerk");
      if (typeof clerkValue !== "object" || clerkValue === null) return null;
      const session: unknown = Reflect.get(clerkValue, "session");
      if (typeof session !== "object" || session === null) return null;
      const getToken: unknown = Reflect.get(session, "getToken");
      if (typeof getToken !== "function") return null;
      const value: unknown = await Reflect.apply(getToken, session, []);
      return typeof value === "string" ? value : null;
    });
    if (jwt === null) throw new CredentialGateError("Clerk session token unavailable");
    const claims = parseAuthenticatedClaims(jwt);
    if (claims.sub !== userId) throw new CredentialGateError("Clerk subject does not match DEV_LOGIN_USER_ID");

    const response = await fetch(`${localSupabaseUrl}/rest/v1/cards?select=id&limit=1`, {
      headers: {
        apikey: localSupabaseKey,
        authorization: `Bearer ${jwt}`,
      },
    });
    if (!response.ok) throw new CredentialGateError("local Supabase rejected the Clerk JWT");
    await writeTicketReference(signInToken.id, true);
    await page.context().storageState({ path: e2ePaths().storageState });
  } catch (error) {
    if (tokenId !== null) {
      const reference = await readTicketReference();
      if (reference !== null && !reference.consumed) {
        await clerk.signInTokens.revokeSignInToken(reference.id);
      }
    }
    await cleanupAuthArtifacts({ removeRunRoot: true });
    throw error;
  }
});
