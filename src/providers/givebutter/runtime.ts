import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderActionSources } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { mapProviderActionSources, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const givebutterApiBaseUrl = "https://api.givebutter.com/v1";
const givebutterValidationPath = "/campaigns";

type GivebutterPhase = "validate" | "execute";
type GivebutterQueryValue = string | number | boolean | undefined;
type GivebutterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface GivebutterListSource {
  kind: "list";
  path: string;
  outputKey: string;
}

interface GivebutterGetSource {
  kind: "get";
  path: string;
  inputKey: string;
  outputKey: string;
}

type GivebutterActionSource = GivebutterListSource | GivebutterGetSource;

const givebutterActionSources: ProviderActionSources<"givebutter", GivebutterActionSource> = {
  list_campaigns: { kind: "list", path: "/campaigns", outputKey: "campaigns" },
  get_campaign: { kind: "get", path: "/campaigns", inputKey: "campaignId", outputKey: "campaign" },
  list_contacts: { kind: "list", path: "/contacts", outputKey: "contacts" },
  get_contact: { kind: "get", path: "/contacts", inputKey: "contactId", outputKey: "contact" },
  list_transactions: { kind: "list", path: "/transactions", outputKey: "transactions" },
  get_transaction: {
    kind: "get",
    path: "/transactions",
    inputKey: "transactionId",
    outputKey: "transaction",
  },
  list_funds: { kind: "list", path: "/funds", outputKey: "funds" },
  get_fund: { kind: "get", path: "/funds", inputKey: "fundId", outputKey: "fund" },
  list_recurring_plans: { kind: "list", path: "/plans", outputKey: "recurringPlans" },
  get_recurring_plan: {
    kind: "get",
    path: "/plans",
    inputKey: "recurringPlanId",
    outputKey: "recurringPlan",
  },
  list_chapters: { kind: "list", path: "/chapters", outputKey: "chapters" },
  get_chapter: { kind: "get", path: "/chapters", inputKey: "chapterId", outputKey: "chapter" },
};

export const givebutterActionHandlers: ProviderActionHandlers<"givebutter", GivebutterActionHandler> =
  mapProviderActionSources(
    "givebutter",
    givebutterActionSources,
    (_name, source): GivebutterActionHandler =>
      source.kind === "list"
        ? (input, context) => listGivebutterResource(input, context, source)
        : (input, context) => getGivebutterResource(input, context, source),
  );

export async function validateGivebutterCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestGivebutterJson(
    {
      path: givebutterValidationPath,
      query: { per_page: 1 },
    },
    input.apiKey,
    fetcher,
    "validate",
    signal,
  );

  return {
    profile: {
      accountId: "givebutter",
      displayName: "Givebutter API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: givebutterApiBaseUrl,
      validationEndpoint: givebutterValidationPath,
    },
  };
}

async function listGivebutterResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  config: { path: string; outputKey: string },
): Promise<unknown> {
  const payload = await requestGivebutterJson(
    {
      path: config.path,
      query: buildListQuery(input),
    },
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );

  const data = Array.isArray(payload.data) ? payload.data : [];
  return {
    [config.outputKey]: data,
    links: optionalRecord(payload.links) ?? {},
    meta: optionalRecord(payload.meta) ?? {},
    raw: payload,
  };
}

async function getGivebutterResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  config: { path: string; inputKey: string; outputKey: string },
): Promise<unknown> {
  const id = readRequiredResourceId(input[config.inputKey], config.inputKey);
  const payload = await requestGivebutterJson(
    {
      path: `${config.path}/${encodeURIComponent(id)}`,
    },
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );

  return {
    [config.outputKey]: optionalRecord(payload.data) ?? payload,
    raw: payload,
  };
}

async function requestGivebutterJson(
  input: {
    path: string;
    query?: Record<string, GivebutterQueryValue>;
  },
  apiKey: string,
  fetcher: typeof fetch,
  phase: GivebutterPhase,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let response: Response;

  try {
    response = await fetcher(buildGivebutterUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey.trim()}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Givebutter request failed: ${error.message}` : "Givebutter request failed",
      error,
    );
  }

  const payload = await readGivebutterPayload(response);
  if (!response.ok) {
    throw createGivebutterError(response.status, payload, phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Givebutter response was not a JSON object");
  }

  return record;
}

function buildGivebutterUrl(input: { path: string; query?: Record<string, GivebutterQueryValue> }): URL {
  const url = new URL(`${givebutterApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildListQuery(input: Record<string, unknown>): Record<string, GivebutterQueryValue> {
  const query: Record<string, GivebutterQueryValue> = {};
  const extraQuery = optionalRecord(input.query);
  for (const [key, value] of Object.entries(extraQuery ?? {})) {
    if (key === "page" || key === "per_page") {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = value;
    }
  }

  const page = optionalInteger(input.page);
  const perPage = optionalInteger(input.perPage);
  if (page !== undefined) {
    query.page = page;
  }
  if (perPage !== undefined) {
    query.per_page = perPage;
  }

  return query;
}

async function readGivebutterPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Givebutter response was not valid JSON");
  }
}

function createGivebutterError(status: number, payload: unknown, phase: GivebutterPhase): ProviderRequestError {
  const message = readGivebutterMessage(payload) ?? `Givebutter request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function readGivebutterMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function readRequiredResourceId(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
