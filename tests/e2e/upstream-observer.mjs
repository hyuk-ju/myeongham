import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (process.env.QUEUE_UPSTREAM_OBSERVER === "1") {
  const root = process.env.E2E_RUN_ROOT;
  if (root !== undefined && root.length > 0) {
    const statePath = resolve(root, "queue-upstream-observer.json");
    const releasePath = resolve(root, "queue-upstream-release");
    const originalFetch = globalThis.fetch;
    let count = 0;

    globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("chatgpt.com/backend-api")) return originalFetch(input, init);
    count += 1;
    await writeFile(statePath, JSON.stringify({ count, held: true }), { mode: 0o600 });
    for (let attempt = 0; attempt < 1_200; attempt += 1) {
      try {
        await access(releasePath);
        break;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        await new Promise((settle) => setTimeout(settle, 50));
      }
    }
    await writeFile(statePath, JSON.stringify({ count, held: false }), { mode: 0o600 });
    return new Response(JSON.stringify({ error: "observer_fixture" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    };
  }
}
