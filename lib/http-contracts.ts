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

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullableText = (maximum: number) => boundedText(maximum).nullable();
const absoluteUrl = boundedText(2_000)
  .url()
  .refine((value) => value.startsWith("https://") || value.startsWith("http://"));
const httpsUrl = boundedText(2_000).url().startsWith("https://");

const ExtractedCardSchema = z.object({
  name: nullableText(500), name_en: nullableText(500), title: nullableText(500), department: nullableText(500),
  company: nullableText(500), company_en: nullableText(500), phone: nullableText(64), mobile: nullableText(64),
  mobile2: nullableText(64), fax: nullableText(64), email: nullableText(500), email2: nullableText(500),
  website: nullableText(500), address: nullableText(500), postal_code: nullableText(500), tax_code: nullableText(500),
  raw_text: nullableText(10_000), industry: nullableText(500),
  capabilities: z.array(boundedText(80)).max(12), confidence: z.number().min(0).max(1),
}).strict();

const EnrichSuggestionSchema = z.object({
  industry: nullableText(500), capabilities: z.array(boundedText(80)).max(12), summary: nullableText(1_000),
  confident: z.boolean(),
  sources: z.array(z.object({ url: httpsUrl, title: boundedText(200) }).strict()).max(10),
}).strict();

const DraftRecordSchema = z.object({
  id: z.string().uuid(), image_path: boundedText(1_000),
  status: z.enum(["pending", "processing", "extracted", "failed"]),
  extracted: ExtractedCardSchema.nullable(), error: nullableText(1_000), attempts: z.number().int().min(0),
  enrich: EnrichSuggestionSchema.nullable(), created_at: z.string().datetime(),
}).strict();

const DraftResponseSchema = DraftRecordSchema.extend({ image_url: absoluteUrl.nullable() });
const BulkCapabilitiesSchema = z.object({
  company: boundedText(500), capabilities: z.array(boundedText(80)).min(1).max(12), industry: nullableText(500).default(null),
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

export function parseDraftRecord(value: unknown): ContractResult<DraftRecord> {
  return parseSchema(DraftRecordSchema, value);
}

export function parseDraftRecords(value: unknown): ContractResult<readonly DraftRecord[]> {
  return parseSchema(z.array(DraftRecordSchema), value);
}

export function parseDraftResponse(value: unknown): ContractResult<DraftResponse> {
  return parseSchema(DraftResponseSchema, value);
}

export function parseDraftListResponse(value: unknown): ContractResult<readonly DraftResponse[]> {
  const parsed = parseSchema(z.object({ drafts: z.array(DraftResponseSchema) }).strict(), value);
  if (!parsed.ok) return parsed;
  return success(parsed.value.drafts);
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
