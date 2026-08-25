import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "instantly_ai";
const instantlyAiApiBaseUrl = "https://api.instantly.ai";
const instantlyAiValidationPath = "/api/v2/campaigns?limit=1";

type InstantlyAiRequestPhase = "validate" | "execute";
type InstantlyAiMethod = "GET" | "POST";
type InstantlyAiContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type InstantlyAiActionHandler = (input: Record<string, unknown>, context: InstantlyAiContext) => Promise<unknown>;

export const instantlyAiActionHandlers: ProviderActionHandlers<"instantly_ai", InstantlyAiActionHandler> = {
  list_campaigns(input, context) {
    return instantlyAiGetJson(buildListCampaignsPath(input), context, "execute");
  },
  get_campaign(input, context) {
    const id = readRequiredString(input, "id", "campaign ID");
    return instantlyAiGetJson(`/api/v2/campaigns/${encodeURIComponent(id)}`, context, "execute");
  },
  list_leads(input, context) {
    return instantlyAiPostJson("/api/v2/leads/list", buildListLeadsBody(input), context);
  },
  create_lead(input, context) {
    validateCreateLeadInput(input);
    return instantlyAiPostJson("/api/v2/leads", buildCreateLeadBody(input), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, instantlyAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await instantlyAiGetJson(
      instantlyAiValidationPath,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Instantly.ai API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: instantlyAiApiBaseUrl,
        validationEndpoint: instantlyAiValidationPath,
        validationMode: "campaign_list_probe",
      },
    };
  },
};

function buildListCampaignsPath(input: Record<string, unknown>): string {
  const url = new URL("/api/v2/campaigns", instantlyAiApiBaseUrl);
  setOptionalQuery(url, "limit", optionalInteger(input.limit));
  setOptionalQuery(url, "starting_after", optionalString(input.starting_after));
  setOptionalQuery(url, "search", optionalString(input.search));
  setOptionalQuery(url, "ai_sales_agent_id", optionalString(input.ai_sales_agent_id));
  setOptionalQuery(url, "status", optionalNumber(input.status));
  if (Array.isArray(input.tag_ids)) {
    url.searchParams.set("tag_ids", input.tag_ids.filter(isString).join(","));
  }
  return `${url.pathname}${url.search}`;
}

function buildListLeadsBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    search: optionalString(input.search),
    filter: optionalString(input.filter),
    campaign: optionalString(input.campaign),
    list_id: optionalString(input.list_id),
    in_campaign: optionalBoolean(input.in_campaign),
    in_list: optionalBoolean(input.in_list),
    ids: readOptionalStringArray(input.ids),
    excluded_ids: readOptionalStringArray(input.excluded_ids),
    contacts: readOptionalStringArray(input.contacts),
    limit: optionalInteger(input.limit),
    starting_after: optionalString(input.starting_after),
    organization_user_ids: readOptionalStringArray(input.organization_user_ids),
    smart_view_id: optionalString(input.smart_view_id),
    is_website_visitor: optionalBoolean(input.is_website_visitor),
    distinct_contacts: optionalBoolean(input.distinct_contacts),
    enrichment_status: optionalNumber(input.enrichment_status),
    esg_code: optionalString(input.esg_code),
  });
}

function buildCreateLeadBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    campaign: readNullableString(input.campaign),
    list_id: readNullableString(input.list_id),
    email: readNullableString(input.email),
    personalization: readNullableString(input.personalization),
    website: readNullableString(input.website),
    last_name: readNullableString(input.last_name),
    first_name: readNullableString(input.first_name),
    company_name: readNullableString(input.company_name),
    job_title: readNullableString(input.job_title),
    phone: readNullableString(input.phone),
    lt_interest_status: optionalNumber(input.lt_interest_status),
    pl_value_lead: readNullableString(input.pl_value_lead),
    assigned_to: readNullableString(input.assigned_to),
    skip_if_in_workspace: optionalBoolean(input.skip_if_in_workspace),
    skip_if_in_campaign: optionalBoolean(input.skip_if_in_campaign),
    skip_if_in_list: optionalBoolean(input.skip_if_in_list),
    blocklist_id: optionalString(input.blocklist_id),
    verify_leads_for_lead_finder: optionalBoolean(input.verify_leads_for_lead_finder),
    verify_leads_on_import: optionalBoolean(input.verify_leads_on_import),
    custom_variables: optionalRecord(input.custom_variables),
  });
}

async function instantlyAiGetJson(
  path: string,
  context: InstantlyAiContext,
  phase: InstantlyAiRequestPhase,
): Promise<unknown> {
  return instantlyAiRequestJson("GET", path, undefined, context, phase);
}

async function instantlyAiPostJson(
  path: string,
  body: Record<string, unknown>,
  context: InstantlyAiContext,
): Promise<unknown> {
  return instantlyAiRequestJson("POST", path, body, context, "execute");
}

async function instantlyAiRequestJson(
  method: InstantlyAiMethod,
  path: string,
  body: Record<string, unknown> | undefined,
  context: InstantlyAiContext,
  phase: InstantlyAiRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, instantlyAiApiBaseUrl), {
      method,
      headers: instantlyAiHeaders(context.apiKey, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readInstantlyAiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `instantly_ai request failed: ${error.message}` : "instantly_ai request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createInstantlyAiError(response, payload, phase);
  }

  return payload;
}

function instantlyAiHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readInstantlyAiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createInstantlyAiError(
  response: Response,
  payload: unknown,
  phase: InstantlyAiRequestPhase,
): ProviderRequestError {
  const message =
    extractInstantlyAiErrorMessage(payload) ??
    response.statusText ??
    `instantly_ai request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 402 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractInstantlyAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error);
}

function setOptionalQuery(url: URL, key: string, value: string | number | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

function readRequiredString(input: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${label} is required`);
  }
  return value;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(isString);
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function validateCreateLeadInput(input: Record<string, unknown>): void {
  const hasCampaign = hasNonEmptyString(input.campaign);
  const hasListId = hasNonEmptyString(input.list_id);
  const hasEmail = hasNonEmptyString(input.email);
  const hasFirstName = hasNonEmptyString(input.first_name);
  const hasLastName = hasNonEmptyString(input.last_name);

  if (!hasCampaign && !hasListId) {
    throw new ProviderRequestError(400, "campaign or list_id is required");
  }
  if (hasCampaign && !hasEmail) {
    throw new ProviderRequestError(400, "email is required when campaign is provided");
  }
  if (hasListId && !hasEmail && !hasFirstName && !hasLastName) {
    throw new ProviderRequestError(400, "email, first_name, or last_name is required when list_id is provided");
  }
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
