// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  errorResponse,
  MAX_JSON_BODY_BYTES,
  parseBulkCapabilitiesRequest,
  parseCardSaveRequest,
  parseDraftRecord,
  parseDraftResponse,
  parseDraftUploadRequest,
} from "@/lib/http-contracts";

const fixture = (name: string) =>
  readFile(resolve(process.cwd(), "tests/fixtures/cards", name));

function multipartRequest(file: Blob, filename: string): Request {
  const form = new FormData();
  form.set("image", file, filename);
  return new Request("http://example.test/api/drafts", { method: "POST", body: form });
}

function draftRecord(status: string) {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    image_path: "user_123/00000000-0000-0000-0000-000000000000.jpg",
    status,
    extracted: null,
    error: null,
    attempts: 0,
    enrich: null,
    created_at: "2026-07-29T00:00:00.000Z",
  };
}

describe("HTTP boundary contracts", () => {
  it("Given malformed or oversized JSON When parsed Then stable machine errors are returned", async () => {
    const malformed = new Request("http://example.test/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const oversized = new Request("http://example.test/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"company":"${"x".repeat(MAX_JSON_BODY_BYTES)}","capabilities":["tag"]}`,
    });

    await expect(parseBulkCapabilitiesRequest(malformed)).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });
    await expect(parseBulkCapabilitiesRequest(oversized)).resolves.toEqual({
      ok: false,
      code: "payload_too_large",
    });
  });

  it("Given unknown fields or overlong capability arrays When parsed Then input is rejected", async () => {
    const unknown = new Request("http://example.test/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company: "Acme", capabilities: ["CNC"], unexpected: true }),
    });
    const overlong = new Request("http://example.test/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company: "Acme", capabilities: Array.from({ length: 13 }, (_, index) => `tag-${index}`) }),
    });

    await expect(parseBulkCapabilitiesRequest(unknown)).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });
    await expect(parseBulkCapabilitiesRequest(overlong)).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("Given a valid bounded bulk-capability request When parsed Then normalized readonly values are returned", async () => {
    const request = new Request("http://example.test/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ company: "  Acme  ", capabilities: [" CNC ", "Milling"], industry: "  Manufacturing " }),
    });

    await expect(parseBulkCapabilitiesRequest(request)).resolves.toEqual({
      ok: true,
      value: { company: "Acme", capabilities: ["CNC", "Milling"], industry: "Manufacturing" },
    });

    const withoutIndustry = new Request("http://example.test/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company: "Acme", capabilities: ["CNC"] }),
    });
    await expect(parseBulkCapabilitiesRequest(withoutIndustry)).resolves.toEqual({
      ok: true,
      value: { company: "Acme", capabilities: ["CNC"], industry: null },
    });
  });

  it("Given malformed multipart or a missing image When parsed Then input is rejected before storage", async () => {
    const malformed = new Request("http://example.test/api/drafts", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=missing" },
      body: "not-a-multipart-body",
    });
    const missing = new Request("http://example.test/api/drafts", {
      method: "POST",
      body: new FormData(),
    });

    await expect(parseDraftUploadRequest(malformed)).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });
    await expect(parseDraftUploadRequest(missing)).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });

    const empty = new Request("http://example.test/api/drafts", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=missing" },
      body: "",
    });
    await expect(parseDraftUploadRequest(empty)).resolves.toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("Given spoofed or oversized image uploads When parsed Then no image reaches the trusted result", async () => {
    const spoofed = new Blob([await fixture("spoofed-jpeg.jpg")], {
      type: "image/jpeg",
    });
    const oversized = new Blob([await fixture("oversize.bin")], {
      type: "image/jpeg",
    });

    await expect(parseDraftUploadRequest(multipartRequest(spoofed, "spoofed.jpg"))).resolves.toEqual({
      ok: false,
      code: "unsupported_media",
    });
    await expect(parseDraftUploadRequest(multipartRequest(oversized, "oversize.jpg"))).resolves.toEqual({
      ok: false,
      code: "payload_too_large",
    });

    const mismatched = new Blob([await fixture("valid-png.png")], { type: "image/jpeg" });
    await expect(parseDraftUploadRequest(multipartRequest(mismatched, "card.jpg"))).resolves.toEqual({
      ok: false,
      code: "unsupported_media",
    });
  });

  it("Given valid Todo 1 image fixtures When uploaded as matching multipart files Then detected metadata is returned", async () => {
    const jpeg = new Blob([await fixture("valid-jpeg.jpg")], { type: "image/jpeg" });
    const png = new Blob([await fixture("valid-png.png")], { type: "image/png" });
    const webp = new Blob([await fixture("valid-webp.webp")], { type: "image/webp" });

    await expect(parseDraftUploadRequest(multipartRequest(jpeg, "card.jpg"))).resolves.toMatchObject({
      ok: true,
      value: { contentType: "image/jpeg", extension: "jpg" },
    });
    await expect(parseDraftUploadRequest(multipartRequest(png, "card.png"))).resolves.toMatchObject({
      ok: true,
      value: { contentType: "image/png", extension: "png" },
    });
    await expect(parseDraftUploadRequest(multipartRequest(webp, "card.webp"))).resolves.toMatchObject({
      ok: true,
      value: { contentType: "image/webp", extension: "webp" },
    });
  });

  it("Given an invalid server draft status When parsed Then the server response is rejected", () => {
    expect(parseDraftRecord(draftRecord("unknown"))).toEqual({
      ok: false,
      code: "invalid_response",
    });
  });

  it("Given a valid enriched draft When parsed Then structured sources survive the response boundary", () => {
    const enrich = {
      industry: "Manufacturing",
      capabilities: ["CNC"],
      summary: "Precision manufacturer",
      confident: true,
      sources: [{ url: "https://example.test/company", title: "Company profile" }],
    };

    expect(parseDraftResponse({ ...draftRecord("extracted"), enrich, image_url: null })).toEqual({
      ok: true,
      value: expect.objectContaining({ enrich }),
    });
    expect(parseDraftResponse({
      ...draftRecord("extracted"),
      enrich: { ...enrich, sources: ["https://example.test/company"] },
      image_url: null,
    })).toEqual({ ok: false, code: "invalid_response" });
  });

  it("Given a bounded card-save body When parsed Then draft handoff fields and card values are typed", () => {
    expect(parseCardSaveRequest({
      draft_id: "00000000-0000-4000-8000-000000000000",
      company: "  Acme  ",
      capabilities: [" CNC ", "CNC"],
      confidence: 0.8,
      capabilities_source: "manual",
    })).toEqual({
      ok: true,
      value: expect.objectContaining({
        draft_id: "00000000-0000-4000-8000-000000000000",
        company: "Acme",
        capabilities: ["CNC"],
        confidence: 0.8,
        capabilities_source: "manual",
        supersedes_id: null,
      }),
    });
  });

  it("Given owner or transition fields, invalid ids, or overlong card fields When parsed Then input is rejected", () => {
    expect(parseCardSaveRequest({ company: "Acme", owner_id: "owner-1" })).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(parseCardSaveRequest({ draft_id: "not-a-uuid" })).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(parseCardSaveRequest({ notes: "x".repeat(2_001) })).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("Given an unknown draft response field When parsed Then the response is rejected", () => {
    expect(parseDraftResponse({ ...draftRecord("pending"), image_url: null, extra: true })).toEqual({
      ok: false,
      code: "invalid_response",
    });
  });

  it("Given a machine error code When a response is created Then its HTTP status and JSON envelope are stable", async () => {
    const response = errorResponse("unsupported_media");

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: "unsupported_media" });
  });
});
