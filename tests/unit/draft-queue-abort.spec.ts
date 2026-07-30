import { describe, expect, it, vi } from "vitest";
import {
  createUploadResourceRegistry,
  releaseUploadResource,
} from "@/lib/draft-queue-state";
import { createDraftQueueTransport } from "@/lib/draft-queue-transport";

describe("queue cancellation and resource cleanup", () => {
  it("Given resources added after mount When cleanup runs Then every URL and file reference is released", () => {
    const registry = createUploadResourceRegistry();
    const revoke = vi.fn();
    registry.files.set("late", new File(["fixture"], "late.jpg"));
    registry.urls.set("late", "blob:late");
    registry.controllers.set("late", new AbortController());

    releaseUploadResource(registry, "late", revoke);

    expect(revoke).toHaveBeenCalledWith("blob:late");
    expect(registry.files.has("late")).toBe(false);
    expect(registry.urls.has("late")).toBe(false);
    expect(registry.controllers.has("late")).toBe(false);
  });

  it("Given an active extraction When its signal is aborted Then transport receives the same cancellation signal", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      return Response.json({ code: "stale_token", error: "stale_token" }, { status: 409 });
    });

    const result = await createDraftQueueTransport(fetcher).extract("draft-id", controller.signal);

    expect(result).toEqual({ ok: false, code: "stale_token" });
    expect(controller.signal.aborted).toBe(true);
  });
});
