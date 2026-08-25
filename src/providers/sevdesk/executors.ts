import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalBoolean, optionalIntegerLike, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "sevdesk";
const sevdeskApiBaseUrl = "https://my.sevdesk.de/api/v1";
const sevdeskValidationPath = "/Contact";

type SevdeskRequestPhase = "validate" | "execute";

interface SevdeskActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type SevdeskActionHandler = (input: Record<string, unknown>, context: SevdeskActionContext) => Promise<unknown>;

interface SevdeskRequestInput {
  context: SevdeskActionContext;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  phase: SevdeskRequestPhase;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}

interface SevdeskListPayload {
  objects: unknown[];
  total: number | null;
}

export const sevdeskActionHandlers: ProviderActionHandlers<"sevdesk", SevdeskActionHandler> = {
  async list_contacts(input, context): Promise<unknown> {
    const payload = await requestSevdeskJson({
      context,
      path: "/Contact",
      phase: "execute",
      query: compactDefined({
        depth: readOptionalDepth(input.depth),
        customerNumber: optionalString(input.customerNumber),
        limit: readOptionalBoundedInteger(input.limit, "limit", { minimum: 1, maximum: 1000 }),
        offset: readOptionalBoundedInteger(input.offset, "offset", { minimum: 0 }),
        countAll: optionalBoolean(input.countAll),
        embed: stringifyEmbed(input.embed),
      }),
    });
    const listPayload = readListPayload(payload);
    return {
      contacts: listPayload.objects.map((item) => readObject(item, "contact")),
      total: listPayload.total,
    };
  },
  async get_contact(input, context): Promise<unknown> {
    const payload = await requestSevdeskJson({
      context,
      path: `/Contact/${readPositiveInteger(input.contactId, "contactId")}`,
      phase: "execute",
      query: compactDefined({ embed: stringifyEmbed(input.embed) }),
      notFoundAsInvalidInput: true,
    });
    return {
      contact: readSingleContactPayload(payload),
    };
  },
  async create_contact(input, context): Promise<unknown> {
    const payload = await requestSevdeskJson({
      context,
      path: "/Contact",
      method: "POST",
      phase: "execute",
      body: buildContactMutationBody(input),
    });
    return {
      contact: readSingleContactPayload(payload),
    };
  },
  async update_contact(input, context): Promise<unknown> {
    const contactId = readPositiveInteger(input.contactId, "contactId");
    const payload = await requestSevdeskJson({
      context,
      path: `/Contact/${contactId}`,
      method: "PUT",
      phase: "execute",
      body: buildContactMutationBody(omitKeys(input, ["contactId"])),
      notFoundAsInvalidInput: true,
    });
    return {
      contact: readSingleContactPayload(payload),
    };
  },
  async delete_contact(input, context): Promise<unknown> {
    await requestSevdeskJson({
      context,
      path: `/Contact/${readPositiveInteger(input.contactId, "contactId")}`,
      method: "DELETE",
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SevdeskActionContext>({
  service,
  handlers: sevdeskActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SevdeskActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: SevdeskActionContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestSevdeskJson({
      context,
      path: sevdeskValidationPath,
      phase: "validate",
      query: {
        limit: 1,
      },
    });
    readListPayload(payload);

    return {
      profile: {
        accountId: "api_key",
        displayName: "sevdesk API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: sevdeskApiBaseUrl,
        validationEndpoint: sevdeskValidationPath,
      },
    };
  },
};

async function requestSevdeskJson(input: SevdeskRequestInput): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildSevdeskUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: {
        Authorization: input.context.apiKey,
        Accept: "application/json",
        "User-Agent": providerUserAgent,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: input.context.signal,
    });
    payload = await readSevdeskPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `sevdesk request failed: ${error.message}` : "sevdesk request failed",
    );
  }

  if (!response.ok) {
    throw createSevdeskError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
  }

  return payload;
}

async function readSevdeskPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "sevdesk returned invalid JSON");
  }
}

function createSevdeskError(
  response: Response,
  payload: unknown,
  phase: SevdeskRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractSevdeskErrorMessage(payload) ?? `sevdesk request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, { status: response.status });
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, { status: response.status });
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, { status: response.status });
  }

  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, { status: response.status });
  }

  return new ProviderRequestError(response.status || 502, message, { status: response.status });
}

function extractSevdeskErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.Exception) ??
    optionalString(record.exception) ??
    optionalString(record.additionalInformation) ??
    optionalString(error?.message) ??
    optionalString(error?.error) ??
    extractFirstObjectMessage(record.objects)
  );
}

function extractFirstObjectMessage(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const first = optionalRecord(value[0]);
  return first ? (optionalString(first.message) ?? optionalString(first.error)) : undefined;
}

function buildSevdeskUrl(path: string, query?: Record<string, string | number | boolean | undefined>): URL {
  const url = new URL(path.replace(/^\//, ""), `${sevdeskApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function readListPayload(payload: unknown): SevdeskListPayload {
  const record = readObject(payload, "list response");
  const objects = record.objects;
  if (!Array.isArray(objects)) {
    throw new ProviderRequestError(502, "invalid sevdesk objects response");
  }

  return {
    objects,
    total: readOptionalTotal(record.total),
  };
}

function readSingleContactPayload(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "contact response");
  if (Array.isArray(record.objects)) {
    const first = record.objects[0];
    if (!first || typeof first !== "object" || Array.isArray(first)) {
      throw new ProviderRequestError(502, "invalid sevdesk contact response");
    }
    return first as Record<string, unknown>;
  }

  return record;
}

function readOptionalTotal(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  throw new ProviderRequestError(502, "invalid sevdesk total response");
}

function buildContactMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactDefined({
    name: input.name,
    status: input.status,
    customerNumber: input.customerNumber,
    parent: input.parent,
    surename: input.surename,
    familyname: input.familyname,
    titel: input.titel,
    category: input.category,
    description: input.description,
    academicTitle: input.academicTitle,
    gender: input.gender,
    name2: input.name2,
    birthday: input.birthday,
    vatNumber: input.vatNumber,
    bankAccount: input.bankAccount,
    bankNumber: input.bankNumber,
    defaultCashbackTime: input.defaultCashbackTime,
    defaultCashbackPercent: input.defaultCashbackPercent,
    defaultTimeToPay: input.defaultTimeToPay,
    taxNumber: input.taxNumber,
    taxOffice: input.taxOffice,
    exemptVat: input.exemptVat,
    defaultDiscountAmount: input.defaultDiscountAmount,
    defaultDiscountPercentage: input.defaultDiscountPercentage,
    buyerReference: input.buyerReference,
    governmentAgency: input.governmentAgency,
  });
}

function omitKeys(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));
}

function stringifyEmbed(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const items = value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
  return items.length > 0 ? items.join(",") : undefined;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid sevdesk ${label}`);
  }
  return value as Record<string, unknown>;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readOptionalBoundedInteger(
  value: unknown,
  fieldName: string,
  bounds: { minimum: number; maximum?: number },
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (parsed === undefined || parsed < bounds.minimum) {
    throw new ProviderRequestError(400, `${fieldName} is invalid`);
  }
  if (bounds.maximum !== undefined && parsed > bounds.maximum) {
    throw new ProviderRequestError(400, `${fieldName} is invalid`);
  }
  return parsed;
}

function readOptionalDepth(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const depth = optionalString(value);
  if (depth === "0" || depth === "1") {
    return depth;
  }

  throw new ProviderRequestError(400, "depth must be 0 or 1");
}

function compactDefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
