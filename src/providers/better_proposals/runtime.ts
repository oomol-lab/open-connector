import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BetterProposalsActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const betterProposalsApiBaseUrl = "https://api.betterproposals.io";
const validationPath = "/settings";

type RequestPhase = "validate" | "execute";
type BetterProposalsContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const proposalListPaths: Record<string, string> = {
  list_proposals: "/proposal",
  list_new_proposals: "/proposal/new",
  list_sent_proposals: "/proposal/sent",
  list_opened_proposals: "/proposal/opened",
  list_signed_proposals: "/proposal/signed",
  list_paid_proposals: "/proposal/paid",
};

export const betterProposalsActionHandlers: Record<BetterProposalsActionName, ActionHandler> = {
  get_settings(_input, context) {
    return getResource("/settings", context);
  },
  get_brand_settings(_input, context) {
    return getResource("/settings/brand", context);
  },
  list_proposals(input, context) {
    return listResources(proposalListPaths.list_proposals, input, context);
  },
  list_new_proposals(input, context) {
    return listResources(proposalListPaths.list_new_proposals, input, context);
  },
  list_sent_proposals(input, context) {
    return listResources(proposalListPaths.list_sent_proposals, input, context);
  },
  list_opened_proposals(input, context) {
    return listResources(proposalListPaths.list_opened_proposals, input, context);
  },
  list_signed_proposals(input, context) {
    return listResources(proposalListPaths.list_signed_proposals, input, context);
  },
  list_paid_proposals(input, context) {
    return listResources(proposalListPaths.list_paid_proposals, input, context);
  },
  get_proposal(input, context) {
    return getResource(`/proposal/${encodeURIComponent(requireInputString(input.id, "id"))}`, context);
  },
  async get_proposal_count(_input, context) {
    const payload = await getJson("/proposal/count", context, "execute");
    const record = requireObjectPayload(payload);
    return {
      count: readCount(record.data) ?? readCount(record),
      ...statusFields(record),
      raw: record,
    };
  },
  list_templates(input, context) {
    return listResources("/template", input, context);
  },
  get_template(input, context) {
    return getResource(`/template/${encodeURIComponent(requireInputString(input.id, "id"))}`, context);
  },
  list_document_types(input, context) {
    return listResources("/doctype", input, context);
  },
  list_quotes(input, context) {
    return listResources("/quote", input, context);
  },
  get_quote(input, context) {
    return getResource(`/quote/${encodeURIComponent(requireInputString(input.id, "id"))}`, context);
  },
  list_companies(input, context) {
    return listResources("/company", input, context);
  },
  get_company(input, context) {
    return getResource(`/company/${encodeURIComponent(requireInputString(input.id, "id"))}`, context);
  },
  list_currencies(input, context) {
    return listResources("/currency", input, context);
  },
  get_currency(input, context) {
    return getResource(`/currency/${encodeURIComponent(requireInputString(input.id, "id"))}`, context);
  },
  list_merge_tags(input, context) {
    return listResources("/settings/merge_tag", input, context);
  },
};

export async function validateBetterProposalsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await getJson(validationPath, { apiKey, fetcher, signal }, "validate");
  const record = requireObjectPayload(payload);

  return {
    profile: {
      accountId: "better-proposals-api-key",
      displayName: "Better Proposals API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: betterProposalsApiBaseUrl,
      validationEndpoint: validationPath,
      status: optionalString(record.status),
    }),
  };
}

async function listResources(
  path: string,
  input: Record<string, unknown>,
  context: BetterProposalsContext,
): Promise<Record<string, unknown>> {
  const query = compactObject({
    page: readOptionalPositiveInteger(input.page, "page"),
    per_page: readOptionalPositiveInteger(input.per_page, "per_page"),
    document_type_id: optionalString(input.document_type_id),
  });
  const payload = await getJson(path, context, "execute", query);
  const record = requireObjectPayload(payload);

  return {
    items: readItems(record.data),
    ...statusFields(record),
    raw: record,
  };
}

async function getResource(path: string, context: BetterProposalsContext): Promise<Record<string, unknown>> {
  const payload = await getJson(path, context, "execute");
  const record = requireObjectPayload(payload);

  return {
    resource: optionalRecord(record.data) ?? null,
    ...statusFields(record),
    raw: record,
  };
}

async function getJson(
  path: string,
  context: BetterProposalsContext,
  phase: RequestPhase,
  query: Record<string, unknown> = {},
): Promise<unknown> {
  const url = new URL(path, betterProposalsApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        Bptoken: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `better_proposals request failed: ${error.message}` : "better_proposals request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createRequestError(response, payload, phase);
  }

  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "better_proposals returned invalid JSON");
  }
}

function createRequestError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message =
    extractErrorMessage(payload) ??
    response.statusText ??
    `better_proposals request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const data = optionalRecord(record.data);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(data?.message) ??
    optionalString(data?.error)
  );
}

function requireObjectPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "better_proposals returned invalid JSON");
  }
  return record;
}

function readItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => optionalRecord(item) !== undefined);
}

function readCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return optionalInteger(record.count) ?? optionalInteger(record.total) ?? optionalInteger(record.proposals) ?? null;
}

function statusFields(record: Record<string, unknown>): Record<string, string | null> {
  return {
    status: optionalString(record.status) ?? null,
    message: optionalString(record.message) ?? null,
  };
}

function requireInputString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (result) {
    return result;
  }

  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const resolved = optionalInteger(value);
  if (resolved === undefined) {
    return undefined;
  }
  if (resolved < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return resolved;
}
