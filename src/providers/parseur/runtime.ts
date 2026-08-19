import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const parseurApiBaseUrl = "https://api.parseur.com";

type ParseurContext = ApiKeyProviderContext;
type QueryValue = string | number | boolean | undefined;

export const parseurActionHandlers: ProviderActionHandlers<
  "parseur",
  (input: Record<string, unknown>, context: ParseurContext) => Promise<unknown>
> = {
  list_mailboxes(input, context) {
    return requestPage("/parser", input, context, normalizeMailboxPage);
  },
  async get_mailbox(input, context) {
    return {
      mailbox: normalizeMailbox(
        await parseurRequest({ path: `/parser/${integer(input.id, "id")}` }, context),
        "mailbox",
      ),
    };
  },
  async get_mailbox_schema(input, context) {
    return {
      schema: requiredRecord(
        await parseurRequest({ path: `/parser/${integer(input.id, "id")}/schema` }, context),
        "schema",
      ),
    };
  },
  list_mailbox_documents(input, context) {
    return requestPage(`/parser/${integer(input.id, "id")}/document_set`, input, context, normalizeDocumentPage);
  },
  async get_document(input, context) {
    return {
      document: normalizeDocument(
        await parseurRequest({ path: `/document/${integer(input.id, "id")}` }, context),
        "document",
        true,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("parseur", parseurActionHandlers);

export async function validateParseurCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  await parseurRequest({ path: "/" }, { apiKey, fetcher });
  return {
    profile: { accountId: "parseur_api_key", displayName: "Parseur API Key", grantedScopes: [] },
    metadata: { apiBaseUrl: parseurApiBaseUrl, validationEndpoint: "/" },
  };
}

async function requestPage(
  path: string,
  input: Record<string, unknown>,
  context: ParseurContext,
  normalize: (payload: unknown) => unknown,
) {
  return normalize(
    await parseurRequest(
      {
        path,
        query: compactObject({
          page: optionalInteger(input.page),
          page_size: optionalInteger(input.page_size),
          search: optionalString(input.search),
          ordering: optionalString(input.ordering),
          received_after: optionalString(input.received_after),
          received_before: optionalString(input.received_before),
          status: optionalString(input.status),
          tz: optionalString(input.tz),
          with_result: optionalBoolean(input.with_result),
        }),
      },
      context,
    ),
  );
}

async function parseurRequest(
  input: { path: string; query?: Record<string, QueryValue> },
  context: Pick<ParseurContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const url = new URL(input.path, parseurApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      headers: { accept: "application/json", authorization: context.apiKey, "user-agent": providerUserAgent },
      signal: context.signal,
    });
    payload = await readJson(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Parseur request failed: ${error.message}` : "Parseur request failed",
    );
  }
  if (!response.ok) throw parseurError(response.status, payload);
  return payload;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Parseur response was not valid JSON");
  }
}

function parseurError(status: number, payload: unknown): ProviderRequestError {
  const message =
    pickString(optionalRecord(payload), "detail", "message", "error") ?? `Parseur request failed with ${status || 500}`;
  return new ProviderRequestError(status === 403 ? 400 : status || 500, message, payload);
}

function normalizeMailboxPage(value: unknown) {
  const payload = requiredRecord(value, "payload");
  return {
    meta: normalizePageMeta(payload),
    mailboxes: array(payload.results, "results").map((item, index) =>
      normalizeMailboxSummary(item, `results.${index}`),
    ),
  };
}

function normalizeDocumentPage(value: unknown) {
  const payload = requiredRecord(value, "payload");
  return {
    meta: normalizePageMeta(payload),
    documents: array(payload.results, "results").map((item, index) =>
      normalizeDocument(item, `results.${index}`, false),
    ),
  };
}

function normalizePageMeta(payload: Record<string, unknown>) {
  return {
    count: integer(payload.count, "count"),
    current: integer(payload.current, "current"),
    total: integer(payload.total, "total"),
  };
}

function normalizeMailboxSummary(value: unknown, fieldName: string) {
  const item = requiredRecord(value, fieldName);
  return {
    id: integer(item.id, `${fieldName}.id`),
    name: requiredString(item.name, `${fieldName}.name`),
    email_prefix: requiredString(item.email_prefix, `${fieldName}.email_prefix`),
    document_count: integer(item.document_count, `${fieldName}.document_count`),
    template_count: integer(item.template_count, `${fieldName}.template_count`),
    last_activity: optionalString(item.last_activity) ?? null,
    document_per_status_count: optionalRecord(item.document_per_status_count) ?? {},
    raw: item,
  };
}

function normalizeMailbox(value: unknown, fieldName: string) {
  const item = requiredRecord(value, fieldName);
  return {
    ...normalizeMailboxSummary(value, fieldName),
    webhook_count: integer(item.webhook_count, `${fieldName}.webhook_count`),
    default_timezone: optionalString(item.default_timezone) ?? null,
    csv_download: optionalString(item.csv_download) ?? null,
    json_download: optionalString(item.json_download) ?? null,
    xls_download: optionalString(item.xls_download) ?? null,
  };
}

function normalizeDocument(value: unknown, fieldName: string, includeResult: boolean) {
  const item = requiredRecord(value, fieldName);
  return {
    id: integer(item.id, `${fieldName}.id`),
    name: requiredString(item.name, `${fieldName}.name`),
    parser: integer(item.parser, `${fieldName}.parser`),
    status: requiredString(item.status, `${fieldName}.status`),
    status_source: optionalString(item.status_source) ?? null,
    received: optionalString(item.received) ?? null,
    processed: optionalString(item.processed) ?? null,
    original_document_url: optionalString(item.original_document_url) ?? null,
    json_download_url: optionalString(item.json_download_url) ?? null,
    csv_download_url: optionalString(item.csv_download_url) ?? null,
    xls_download_url: optionalString(item.xls_download_url) ?? null,
    ...(includeResult
      ? {
          result: item.result ?? null,
          content: optionalString(item.content) ?? null,
          next_id: item.next_id == null ? null : integer(item.next_id, "next_id"),
          prev_id: item.prev_id == null ? null : integer(item.prev_id, "prev_id"),
        }
      : {}),
    raw: item,
  };
}

function array(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${fieldName} must be an array`);
  return value;
}

function pickString(input: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!input) return undefined;
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) return value;
  }
  return undefined;
}
