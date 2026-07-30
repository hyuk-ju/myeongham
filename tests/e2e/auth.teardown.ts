import { createClerkClient } from "@clerk/nextjs/server";
import { test as teardown } from "@playwright/test";
import {
  cleanupAuthArtifacts,
  readTicketReference,
  requiredEnvironment,
} from "./fixtures";

teardown("authenticated local teardown", async () => {
  const reference = await readTicketReference();
  if (reference !== null && !reference.consumed) {
    const clerk = createClerkClient({
      secretKey: requiredEnvironment("CLERK_SECRET_KEY"),
      publishableKey: requiredEnvironment("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    });
    await clerk.signInTokens.revokeSignInToken(reference.id);
  }
  await cleanupAuthArtifacts({ removeRunRoot: true });
});
