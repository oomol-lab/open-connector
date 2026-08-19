import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, requiredRecord } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const twentyCrmApiBaseUrl = "https://api.twenty.com";

const twentyCrmApiUrl = new URL(twentyCrmApiBaseUrl);

type TwentyCrmPhase = "validate" | "execute";

interface TwentyCrmRequestOptions {
  method: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

export const twentyCrmActionHandlers: ProviderActionHandlers<
  "twenty_crm",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_metadata_objects(_input, context) {
    return listMetadataObjects(context);
  },
  list_records(input, context) {
    return listRecords(input, context);
  },
  retrieve_record(input, context) {
    return retrieveRecord(input, context);
  },
  create_record(input, context) {
    return createRecord(input, context);
  },
  update_record(input, context) {
    return updateRecord(input, context);
  },
  delete_record(input, context) {
    return deleteRecord(input, context);
  },
};

export async function validateTwentyCrmCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await listMetadataObjects({ apiKey, fetcher, signal }, "validate");
  const firstObject = result.objects[0];
  const firstObjectName =
    typeof firstObject?.labelPlural === "string"
      ? firstObject.labelPlural
      : typeof firstObject?.namePlural === "string"
        ? firstObject.namePlural
        : undefined;

  return {
    profile: {
      accountId: "twenty_crm:workspace",
      displayName: firstObjectName ? `Twenty workspace with ${firstObjectName}` : "Twenty CRM Workspace",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: twentyCrmApiBaseUrl,
      authMethod: "bearer",
      validationEndpoint: "/rest/metadata/objects",
      metadataObjectCount: result.objects.length,
      firstObjectName,
    }),
  };
}

async function listMetadataObjects(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: TwentyCrmPhase = "execute",
): Promise<{ objects: Record<string, unknown>[]; raw: Record<string, unknown> }> {
  const payload = await requestTwentyCrmJson(
    {
      method: "GET",
      path: "/rest/metadata/objects",
    },
    context,
    phase,
  );
  const record = requireProviderObject(payload, "Twenty CRM metadata response");

  return {
    objects: readArray(record, "data").map((item) => requireProviderObject(item, "Twenty CRM metadata object")),
    raw: record,
  };
}

async function listRecords(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTwentyCrmJson(
    {
      method: "GET",
      path: `/rest/${encodeObjectName(readRequiredString(input.objectNamePlural, "objectNamePlural"))}`,
      query: compactObject({
        limit: optionalInteger(input.limit),
        starting_after: readOptionalString(input.startingAfter),
        ending_before: readOptionalString(input.endingBefore),
        filter: stringifyJsonQuery(input.filter),
        orderBy: stringifyJsonQuery(input.orderBy),
        depth: optionalInteger(input.depth),
      }),
    },
    context,
  );
  const record = requireProviderObject(payload, "Twenty CRM list records response");

  return {
    records: readArray(record, "data").map((item) => requireProviderObject(item, "Twenty CRM record")),
    pageInfo: optionalRecord(record.pageInfo) ?? {},
    raw: record,
  };
}

async function retrieveRecord(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTwentyCrmJson(
    {
      method: "GET",
      path: buildRecordPath(input),
    },
    context,
  );
  const record = requireProviderObject(payload, "Twenty CRM retrieve record response");

  return {
    record: readRecordPayload(record),
    raw: record,
  };
}

async function createRecord(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTwentyCrmJson(
    {
      method: "POST",
      path: `/rest/${encodeObjectName(readRequiredString(input.objectNamePlural, "objectNamePlural"))}`,
      body: requiredRecord(input.data, "data", providerInvalidInput),
    },
    context,
  );
  const record = requireProviderObject(payload, "Twenty CRM create record response");

  return {
    record: readRecordPayload(record),
    raw: record,
  };
}

async function updateRecord(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTwentyCrmJson(
    {
      method: "PATCH",
      path: buildRecordPath(input),
      body: requiredRecord(input.data, "data", providerInvalidInput),
    },
    context,
  );
  const record = requireProviderObject(payload, "Twenty CRM update record response");

  return {
    record: readRecordPayload(record),
    raw: record,
  };
}

async function deleteRecord(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTwentyCrmJson(
    {
      method: "DELETE",
      path: buildRecordPath(input),
    },
    context,
  );
  const record = requireProviderObject(payload, "Twenty CRM delete record response");
  const success = typeof record.success === "boolean" ? record.success : true;

  return {
    record: optionalRecord(record.data) ?? null,
    success,
    raw: record,
  };
}

async function requestTwentyCrmJson(
  options: TwentyCrmRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: TwentyCrmPhase = "execute",
): Promise<unknown> {
  const url = new URL(options.path, twentyCrmApiUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await context.fetcher(url.toString(), {
    method: options.method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: context.signal,
  });

  const text = await response.text();
  const payload = text ? parseTwentyCrmJson(text) : {};
  if (!response.ok) {
    const isCredentialError = response.status === 401 || response.status === 403;
    throw new ProviderRequestError(
      isCredentialError && phase === "validate" ? 400 : response.status,
      readErrorMessage(payload) ?? `Twenty CRM API request failed with status ${response.status}`,
      payload,
    );
  }

  return payload;
}

function buildRecordPath(input: Record<string, unknown>): string {
  const objectNamePlural = encodeObjectName(readRequiredString(input.objectNamePlural, "objectNamePlural"));
  const id = encodeURIComponent(readRequiredString(input.id, "id"));
  return `/rest/${objectNamePlural}/${id}`;
}

function encodeObjectName(value: string): string {
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new ProviderRequestError(400, "objectNamePlural must be a path segment");
  }

  return encodeURIComponent(value);
}

function readRecordPayload(record: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(record.data) ?? record;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Twenty CRM ${key} response was not an array`);
  }

  return value;
}

function stringifyJsonQuery(value: unknown): string | undefined {
  const object = optionalRecord(value);
  return object ? JSON.stringify(object) : undefined;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseTwentyCrmJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Twenty CRM API returned invalid JSON");
  }
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = record.message ?? record.error;
  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === "string").join("; ") || undefined;
  }

  return undefined;
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return payload as Record<string, unknown>;
}

function providerInvalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
