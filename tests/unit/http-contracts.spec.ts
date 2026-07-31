// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARD_LIMITS,
  errorResponse,
  MAX_JSON_BODY_BYTES,
  parseBulkCapabilitiesRequest,
  parseCardSaveRequest,
  parseDraftListResponse,
  parseDraftRecord,
  parseDraftRecords,
  parseDraftResponse,
  parseDraftUploadRequest,
  parseSignedUrls,
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

/** 실제로 대기열을 막았던 명함(품목 나열형)을 본뜬 추출 결과 */
const extractedCard = {
  name: "박규민", name_en: null, title: "대표이사", department: null,
  company: "(주)미르텍", company_en: null,
  phone: "070-4714-2900", mobile: "010-8859-0413", mobile2: null, fax: "070-4032-5893",
  email: "mirtekpcb@naver.com", email2: null, website: null,
  address: "인천광역시 서구 건지로", postal_code: null, tax_code: null,
  raw_text: "(주)미르텍 PCB Machine & Materials Sales", industry: "PCB 장비 및 자재 판매",
  capabilities: ["PCB"], confidence: 0.95,
};

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
      body: JSON.stringify({
        company: "Acme",
        capabilities: Array.from({ length: CARD_LIMITS.tags + 1 }, (_, index) => `tag-${index}`),
      }),
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

  it("Given more capability tags than the contract allows When a draft is parsed Then the row survives with the tags clamped", () => {
    const capabilities = Array.from({ length: CARD_LIMITS.tags + 3 }, (_, index) => `태그${index}`);

    const parsed = parseDraftRecord({
      ...draftRecord("extracted"),
      extracted: { ...extractedCard, capabilities },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.extracted?.capabilities).toEqual(
      capabilities.slice(0, CARD_LIMITS.tags),
    );
  });

  it("Given an oversized tag or error message When a draft is parsed Then the row is clamped instead of rejected", () => {
    const parsed = parseDraftRecord({
      ...draftRecord("failed"),
      error: "가".repeat(CARD_LIMITS.error + 500),
      extracted: { ...extractedCard, capabilities: ["가".repeat(CARD_LIMITS.tag + 40)] },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.error?.length).toBe(CARD_LIMITS.error);
    expect(parsed.ok && parsed.value.extracted?.capabilities[0].length).toBe(CARD_LIMITS.tag);
  });

  it("Given one unsalvageable row in a list When the list is parsed Then the other rows still load", () => {
    const good = { ...draftRecord("pending"), id: "11111111-1111-4111-8111-111111111111" };
    const broken = { ...draftRecord("pending"), id: "22222222-2222-4222-8222-222222222222", status: "unknown" };

    const parsed = parseDraftRecords([good, broken, { id: "not-a-uuid" }]);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.map((row) => [row.id, row.status, row.error])).toEqual([
      [good.id, "pending", null],
      [broken.id, "failed", "invalid_record"],
    ]);
  });

  it("Given a poisoned row in the draft list response When the client parses it Then the queue is not wiped out", () => {
    const drafts = [
      { ...draftRecord("extracted"), image_url: null },
      { ...draftRecord("extracted"), id: "33333333-3333-4333-8333-333333333333", status: "nope", image_url: null },
    ];

    const parsed = parseDraftListResponse({ drafts });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value).toHaveLength(2);
    expect(parsed.ok && parsed.value[1]).toMatchObject({ status: "failed", image_url: null });
  });

  it("Given a PostgreSQL timestamptz offset When a draft is parsed Then the server record is accepted", () => {
    const createdAt = "2026-07-30T05:56:49.28697+00:00";

    expect(parseDraftRecord({ ...draftRecord("pending"), created_at: createdAt })).toEqual({
      ok: true,
      value: expect.objectContaining({ created_at: createdAt }),
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

  it("Given Supabase Storage signed URL rows When parsed Then SDK metadata does not reject usable URLs", () => {
    expect(parseSignedUrls([{
      path: "owner/card.jpg",
      signedURL: "/object/sign/card-images/owner/card.jpg?token=raw",
      signedUrl: "https://example.test/storage/v1/object/sign/card-images/owner/card.jpg?token=encoded",
      error: null,
    }])).toEqual({
      ok: true,
      value: [{
        path: "owner/card.jpg",
        signedUrl: "https://example.test/storage/v1/object/sign/card-images/owner/card.jpg?token=encoded",
      }],
    });
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
