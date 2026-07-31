import { z } from "zod";
import { MAX_IMAGE_BYTES, validateImageBytes, type ValidatedImage } from "@/lib/image-signature";

const MAX_MULTIPART_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
export const MAX_JSON_BODY_BYTES = 32 * 1024;

const ERROR_STATUS = {
  unauthorized: 401,
  invalid_input: 400,
  unsupported_media: 415,
  payload_too_large: 413,
  invalid_response: 502,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

export type ContractResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ApiErrorCode };

export type BulkCapabilitiesInput = {
  readonly company: string;
  readonly capabilities: string[];
  readonly industry: string | null;
};

export type DraftRecord = {
  readonly id: string;
  readonly image_path: string;
  readonly status: "pending" | "processing" | "extracted" | "failed";
  readonly extracted: ReadonlyExtractedCard | null;
  readonly error: string | null;
  readonly attempts: number;
  readonly enrich: ReadonlyEnrichSuggestion | null;
  readonly created_at: string;
};

export type DraftResponse = DraftRecord & { readonly image_url: string | null };

export type CardSaveResponse = { readonly id: string; readonly created: boolean };

export type FinalizeDraftResponse = { readonly id: string; readonly created: true };

export type CardSaveRequest = {
  readonly draft_id: string | null;
  readonly supersedes_id: string | null;
  readonly image_path: string | null;
  readonly name: string | null;
  readonly name_en: string | null;
  readonly title: string | null;
  readonly department: string | null;
  readonly company: string | null;
  readonly company_en: string | null;
  readonly phone: string | null;
  readonly mobile: string | null;
  readonly mobile2: string | null;
  readonly fax: string | null;
  readonly email: string | null;
  readonly email2: string | null;
  readonly website: string | null;
  readonly address: string | null;
  readonly postal_code: string | null;
  readonly tax_code: string | null;
  readonly raw_text: string | null;
  readonly industry: string | null;
  readonly capabilities: string[];
  readonly capabilities_source: "manual" | "web" | null;
  readonly confidence: number | null;
  readonly notes: string | null;
  readonly met_at: string | null;
  readonly met_context: string | null;
};

export type ExtractedCardRecord = ReadonlyExtractedCard;

type ReadonlyExtractedCard = {
  readonly name: string | null;
  readonly name_en: string | null;
  readonly title: string | null;
  readonly department: string | null;
  readonly company: string | null;
  readonly company_en: string | null;
  readonly phone: string | null;
  readonly mobile: string | null;
  readonly mobile2: string | null;
  readonly fax: string | null;
  readonly email: string | null;
  readonly email2: string | null;
  readonly website: string | null;
  readonly address: string | null;
  readonly postal_code: string | null;
  readonly tax_code: string | null;
  readonly raw_text: string | null;
  readonly industry: string | null;
  readonly capabilities: string[];
  readonly confidence: number;
};

type ReadonlyEnrichSuggestion = {
  readonly industry: string | null;
  readonly capabilities: string[];
  readonly summary: string | null;
  readonly confident: boolean;
  readonly sources: Array<{
    readonly url: string;
    readonly title: string;
  }>;
};

/**
 * 응답 계약이 정한 상한 — 스키마와 정규화가 **같은 값**을 본다.
 *
 * 이 상한이 쓰기 쪽과 갈라지면 "저장은 되는데 다시 못 읽는" 행이 생긴다.
 * 그런 행은 목록 조회를 502 로 무너뜨리고, 목록이 안 뜨니 사용자가 그 행을
 * 지울 수도 없어 계정이 통째로 막힌다. 상한을 바꿀 일이 있으면 여기만 고친다.
 */
export const CARD_LIMITS = {
  text: 500,
  phone: 64,
  rawText: 10_000,
  summary: 1_000,
  tag: 80,
  tags: 12,
  sourceTitle: 200,
  sources: 10,
  url: 2_000,
  path: 1_000,
  error: 1_000,
} as const;

/** 정규화가 다듬어 주는 필드 목록. 스키마 키와 1:1 로 유지한다. */
const CARD_TEXT_FIELDS = [
  "name", "name_en", "title", "department", "company", "company_en",
  "email", "email2", "website", "address", "postal_code", "tax_code", "industry",
] as const;
const CARD_PHONE_FIELDS = ["phone", "mobile", "mobile2", "fax"] as const;

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullableText = (maximum: number) => boundedText(maximum).nullable();
const absoluteUrl = boundedText(CARD_LIMITS.url)
  .url()
  .refine((value) => value.startsWith("https://") || value.startsWith("http://"));
const httpsUrl = boundedText(CARD_LIMITS.url).url().startsWith("https://");
const tagList = z.array(boundedText(CARD_LIMITS.tag)).max(CARD_LIMITS.tags);

const ExtractedCardSchema = z.object({
  name: nullableText(CARD_LIMITS.text), name_en: nullableText(CARD_LIMITS.text),
  title: nullableText(CARD_LIMITS.text), department: nullableText(CARD_LIMITS.text),
  company: nullableText(CARD_LIMITS.text), company_en: nullableText(CARD_LIMITS.text),
  phone: nullableText(CARD_LIMITS.phone), mobile: nullableText(CARD_LIMITS.phone),
  mobile2: nullableText(CARD_LIMITS.phone), fax: nullableText(CARD_LIMITS.phone),
  email: nullableText(CARD_LIMITS.text), email2: nullableText(CARD_LIMITS.text),
  website: nullableText(CARD_LIMITS.text), address: nullableText(CARD_LIMITS.text),
  postal_code: nullableText(CARD_LIMITS.text), tax_code: nullableText(CARD_LIMITS.text),
  raw_text: nullableText(CARD_LIMITS.rawText), industry: nullableText(CARD_LIMITS.text),
  capabilities: tagList, confidence: z.number().min(0).max(1),
}).strict();

const EnrichSuggestionSchema = z.object({
  industry: nullableText(CARD_LIMITS.text), capabilities: tagList,
  summary: nullableText(CARD_LIMITS.summary), confident: z.boolean(),
  sources: z.array(
    z.object({ url: httpsUrl, title: boundedText(CARD_LIMITS.sourceTitle) }).strict(),
  ).max(CARD_LIMITS.sources),
}).strict();

const DraftRecordSchema = z.object({
  id: z.string().uuid(), image_path: boundedText(CARD_LIMITS.path),
  status: z.enum(["pending", "processing", "extracted", "failed"]),
  extracted: ExtractedCardSchema.nullable(), error: nullableText(CARD_LIMITS.error),
  attempts: z.number().int().min(0),
  enrich: EnrichSuggestionSchema.nullable(), created_at: z.iso.datetime({ offset: true }),
}).strict();

const DraftResponseSchema = DraftRecordSchema.extend({ image_url: absoluteUrl.nullable() });

/**
 * 계약을 못 지키는 행에서 최소한의 신원만 건져낸다.
 *
 * 이걸로 내려보낸 행은 화면에 "실패" 카드로 뜨므로, 사용자가 직접 지우거나
 * 다시 시도할 수 있다. 목록 전체가 사라지는 것보다 언제나 낫다.
 */
const SalvagedDraftSchema = z.object({
  id: z.string().uuid(), image_path: boundedText(CARD_LIMITS.path),
  created_at: z.iso.datetime({ offset: true }),
  attempts: z.number().int().min(0).catch(0),
}).transform((row): DraftRecord => ({
  ...row, status: "failed", extracted: null, enrich: null, error: "invalid_record",
}));

const BulkCapabilitiesSchema = z.object({
  company: boundedText(CARD_LIMITS.text), capabilities: tagList.min(1),
  industry: nullableText(CARD_LIMITS.text).default(null),
}).strict();
const CardSaveResponseSchema = z.object({ id: z.string().uuid(), created: z.boolean() }).strict();
const FinalizeDraftResponseSchema = z.object({ id: z.string().uuid(), created: z.literal(true) }).strict();
const SignedUrlSchema = z.object({
  path: boundedText(1_000),
  signedUrl: absoluteUrl.nullable().optional(),
  signedURL: z.string().nullable().optional(),
  error: z.unknown().nullable().optional(),
}).strict().transform(({ path, signedUrl }, ctx) => {
  if (typeof signedUrl !== "string") {
    ctx.addIssue({ code: "custom", message: "Missing signedUrl" });
    return z.NEVER;
  }
  return { path, signedUrl };
});
const optionalCardText = (maximum: number) => boundedText(maximum).nullable().optional().default(null);
const optionalUuid = z.string().uuid().nullable().optional().default(null);
const CardSaveRequestSchema = z.object({
  draft_id: optionalUuid,
  supersedes_id: optionalUuid,
  image_path: optionalCardText(1_000),
  name: optionalCardText(500),
  name_en: optionalCardText(500),
  title: optionalCardText(500),
  department: optionalCardText(500),
  company: optionalCardText(500),
  company_en: optionalCardText(500),
  phone: optionalCardText(64),
  mobile: optionalCardText(64),
  mobile2: optionalCardText(64),
  fax: optionalCardText(64),
  email: optionalCardText(500),
  email2: optionalCardText(500),
  website: optionalCardText(500),
  address: optionalCardText(500),
  postal_code: optionalCardText(500),
  tax_code: optionalCardText(500),
  raw_text: optionalCardText(10_000),
  industry: optionalCardText(500),
  capabilities: z.array(boundedText(80)).max(12).optional().default([])
    .transform((values) => [...new Set(values)]),
  capabilities_source: z.enum(["manual", "web"]).nullable().optional().default(null),
  confidence: z.number().finite().min(0).max(1).nullable().optional().default(null),
  notes: optionalCardText(2_000),
  met_at: optionalCardText(64),
  met_context: optionalCardText(2_000),
}).strict();

export function errorResponse(code: ApiErrorCode): Response {
  return Response.json({ error: code }, { status: ERROR_STATUS[code] });
}

export function jsonResponse(body: object, status = 200): Response {
  return Response.json(body, { status });
}

export async function parseDraftUploadRequest(request: Request): Promise<ContractResult<ValidatedImage>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    return failure("invalid_input");
  }

  const bytes = await readBoundedBody(request, MAX_MULTIPART_BODY_BYTES);
  if (!bytes.ok) return bytes;

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  let form: FormData;
  try {
    form = await new Request(request.url, { method: request.method, headers, body: bytes.value }).formData();
  } catch (error) {
    if (error instanceof TypeError) return failure("invalid_input");
    throw error;
  }

  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== "image" || !isUploadFile(entries[0][1])) {
    return failure("invalid_input");
  }

  const file = entries[0][1];
  const declaredType = file.type.toLowerCase();
  const image = validateImageBytes(new Uint8Array(await file.arrayBuffer()));
  if (!image.ok) return image;
  if (declaredType !== image.value.contentType) return failure("unsupported_media");
  return success(image.value);
}

export async function parseBulkCapabilitiesRequest(request: Request): Promise<ContractResult<BulkCapabilitiesInput>> {
  const body = await parseJsonBody(request);
  if (!body.ok) return body;
  return parseInputSchema(BulkCapabilitiesSchema, body.value);
}

/**
 * AI 응답이나 저장된 행을 계약이 정한 상한에 맞춰 다듬는다 (검증이 아니라 정규화).
 *
 * 쓰기 직전과 읽기 직후 **양쪽에서** 부른다. 쓰기 쪽이 이걸 통과시키면 DB 에
 * 못 읽는 행이 생기지 않고, 읽기 쪽이 한 번 더 부르므로 이미 저장돼 버린
 * 과거의 불량 행도 조회 시점에 저절로 복구된다.
 */
export function normalizeExtractedCard(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const card: Record<string, unknown> = {};
  for (const key of CARD_TEXT_FIELDS) card[key] = clampText(value[key], CARD_LIMITS.text);
  for (const key of CARD_PHONE_FIELDS) card[key] = clampText(value[key], CARD_LIMITS.phone);
  card.raw_text = clampText(value.raw_text, CARD_LIMITS.rawText);
  card.capabilities = clampTags(value.capabilities);
  const confidence = Number(value.confidence);
  card.confidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;
  return card;
}

export function normalizeEnrichSuggestion(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  return {
    industry: clampText(value.industry, CARD_LIMITS.text),
    capabilities: clampTags(value.capabilities),
    summary: clampText(value.summary, CARD_LIMITS.summary),
    confident: value.confident === true,
    sources: clampSources(value.sources),
  };
}

export function parseExtractedCard(value: unknown): ContractResult<ExtractedCardRecord> {
  return parseSchema(ExtractedCardSchema, value);
}

export function parseDraftRecord(value: unknown): ContractResult<DraftRecord> {
  return parseSchema(DraftRecordSchema, normalizeDraftRow(value));
}

export function parseDraftRecords(value: unknown): ContractResult<readonly DraftRecord[]> {
  return parseDraftRows(value, DraftRecordSchema, (row) => row);
}

export function parseDraftResponse(value: unknown): ContractResult<DraftResponse> {
  return parseSchema(DraftResponseSchema, normalizeDraftRow(value));
}

export function parseDraftListResponse(value: unknown): ContractResult<readonly DraftResponse[]> {
  if (!isPlainObject(value)) return failure("invalid_response");
  return parseDraftRows(value.drafts, DraftResponseSchema, (row) => ({ ...row, image_url: null }));
}

/**
 * 목록은 **행 단위로** 판정한다.
 *
 * 배열 하나로 통째로 검증하면 계약을 어긴 행 하나가 목록 전체를 502 로
 * 무너뜨리고, 목록이 안 뜨니 사용자는 그 행을 지울 수도 없어 대기열이 영구히
 * 막힌다. 살릴 수 없는 행은 "실패" 카드로 내려보내 스스로 복구할 길을 남긴다.
 */
function parseDraftRows<T>(
  value: unknown,
  schema: z.ZodType<T>,
  salvage: (row: DraftRecord) => T,
): ContractResult<readonly T[]> {
  if (!Array.isArray(value)) return failure("invalid_response");
  const rows: T[] = [];
  for (const entry of value) {
    const parsed = parseSchema(schema, normalizeDraftRow(entry));
    if (parsed.ok) {
      rows.push(parsed.value);
      continue;
    }
    const salvaged = parseSchema(SalvagedDraftSchema, entry);
    if (salvaged.ok) rows.push(salvage(salvaged.value));
  }
  return success(rows);
}

function normalizeDraftRow(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  return {
    ...value,
    extracted: value.extracted == null ? null : normalizeExtractedCard(value.extracted),
    enrich: value.enrich == null ? null : normalizeEnrichSuggestion(value.enrich),
    error: clampText(value.error, CARD_LIMITS.error),
  };
}

/** 빈 문자열은 null 로, 상한을 넘으면 잘라서 돌려준다. */
function clampText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maximum) return trimmed;
  const sliced = trimmed.slice(0, maximum);
  // 서로게이트 쌍(이모지 등)을 반토막 내지 않는다.
  const tail = sliced.charCodeAt(maximum - 1);
  return (tail >= 0xd800 && tail <= 0xdbff ? sliced.slice(0, -1) : sliced).trimEnd();
}

function clampTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const entry of value) {
    const tag = clampText(entry, CARD_LIMITS.tag);
    if (tag !== null && !tags.includes(tag)) tags.push(tag);
    if (tags.length === CARD_LIMITS.tags) break;
  }
  return tags;
}

/**
 * 출처는 개수와 길이만 다듬는다.
 *
 * 모양이 다른 항목은 **일부러 그대로 둬서 검증에서 걸리게** 한다. 태그 한두
 * 개가 잘리는 것과 달리, 출처가 소리 없이 사라지면 웹 보강 결과의 근거 링크가
 * 통째로 없어진 걸 아무도 알아채지 못한다.
 */
function clampSources(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.slice(0, CARD_LIMITS.sources).map((entry) => {
    if (!isPlainObject(entry)) return entry;
    return {
      ...entry,
      url: clampText(entry.url, CARD_LIMITS.url) ?? entry.url,
      title: clampText(entry.title, CARD_LIMITS.sourceTitle) ?? entry.title,
    };
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCardSaveResponse(value: unknown): ContractResult<CardSaveResponse> {
  return parseSchema(CardSaveResponseSchema, value);
}

export function parseCardSaveRequest(value: unknown): ContractResult<CardSaveRequest> {
  return parseInputSchema(CardSaveRequestSchema, value);
}

export function parseFinalizeDraftResponse(value: unknown): ContractResult<FinalizeDraftResponse> {
  return parseSchema(FinalizeDraftResponseSchema, value);
}

export function parseBulkCapabilitiesResult(value: unknown): ContractResult<number> {
  return parseSchema(z.number().int().min(0), value);
}

export function parseSignedUrls(value: unknown): ContractResult<readonly { readonly path: string; readonly signedUrl: string }[]> {
  return parseSchema(z.array(SignedUrlSchema), value);
}

async function parseJsonBody(request: Request): Promise<ContractResult<unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return failure("invalid_input");
  }
  const bytes = await readBoundedBody(request, MAX_JSON_BODY_BYTES);
  if (!bytes.ok) return bytes;
  if (bytes.value.byteLength === 0) return failure("invalid_input");
  try {
    return success(JSON.parse(new TextDecoder().decode(bytes.value)));
  } catch (error) {
    if (error instanceof SyntaxError) return failure("invalid_input");
    throw error;
  }
}

async function readBoundedBody(request: Request, maximum: number): Promise<ContractResult<Uint8Array<ArrayBuffer>>> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return failure("invalid_input");
    if (Number(declaredLength) > maximum) return failure("payload_too_large");
  }
  if (request.body === null) return failure("invalid_input");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) {
        while (!(await reader.read()).done) {}
        return failure("payload_too_large");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof TypeError) return failure("invalid_input");
    throw error;
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return success(body);
}

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): ContractResult<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return failure("invalid_response");
  return success(parsed.data);
}

function parseInputSchema<T>(schema: z.ZodType<T>, value: unknown): ContractResult<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return failure("invalid_input");
  return success(parsed.data);
}

function isUploadFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && typeof value.arrayBuffer === "function";
}

function success<T>(value: T): ContractResult<T> {
  return { ok: true, value };
}

function failure(code: ApiErrorCode): ContractResult<never> {
  return { ok: false, code };
}
