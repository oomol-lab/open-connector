import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, requiredResponseRecord } from "../provider-runtime.ts";

type QueryValue = string | number | boolean | undefined;
type SmartleadAiRequestPhase = "validate" | "execute";
type SmartleadAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const smartleadAiApiBaseUrl = "https://server.smartlead.ai/api/v1";

export const smartleadAiActionHandlers: ProviderActionHandlers<"smartlead_ai", SmartleadAiActionHandler> = {
  list_campaigns: executeListCampaigns,
  get_campaign: executeGetCampaign,
  list_email_accounts: executeListEmailAccounts,
  list_campaign_leads: executeListCampaignLeads,
};

export async function validateSmartleadAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  await smartleadAiRequest({ path: "/campaigns/", phase: "validate" }, { apiKey, fetcher, signal });

  return {
    profile: { accountId: "api_key", displayName: "Smartlead API Key", grantedScopes: [] },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: smartleadAiApiBaseUrl,
      validationEndpoint: "/campaigns/",
    },
  };
}

async function executeListCampaigns(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await smartleadAiRequest(
    {
      path: "/campaigns/",
      query: compactObject({
        client_id: optionalInteger(input.client_id),
        include_tags: optionalBoolean(input.include_tags),
      }),
      phase: "execute",
    },
    context,
  );

  return { campaigns: normalizeCampaigns(payload), raw: payload };
}

async function executeGetCampaign(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const campaignId = requiredInteger(input.campaign_id, "campaign_id", 400);
  const payload = await smartleadAiRequest(
    {
      path: `/campaigns/${campaignId}`,
      query: compactObject({ include_tags: optionalBoolean(input.include_tags) }),
      phase: "execute",
    },
    context,
  );

  return { campaign: normalizeCampaign(unwrapDataObject(payload, "campaign"), "campaign"), raw: payload };
}

async function executeListEmailAccounts(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await smartleadAiRequest(
    {
      path: "/email-accounts/",
      query: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
        isInUse: optionalString(input.isInUse),
        emailWarmupStatus: optionalString(input.emailWarmupStatus),
        isSmtpSuccess: optionalString(input.isSmtpSuccess),
        isWarmupBlocked: optionalString(input.isWarmupBlocked),
        esp: optionalString(input.esp),
        username: optionalString(input.username),
        client_id: optionalInteger(input.client_id),
        fetch_campaigns: optionalString(input.fetch_campaigns),
      }),
      phase: "execute",
    },
    context,
  );

  return { email_accounts: normalizeEmailAccounts(payload), raw: payload };
}

async function executeListCampaignLeads(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const campaignId = requiredInteger(input.campaign_id, "campaign_id", 400);
  const payload = await smartleadAiRequest(
    {
      path: `/campaigns/${campaignId}/leads`,
      query: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
        status: optionalString(input.status),
        lead_category_id: optionalInteger(input.lead_category_id),
        emailStatus: optionalString(input.emailStatus),
        created_at_gt: optionalString(input.created_at_gt),
        last_sent_time_gt: optionalString(input.last_sent_time_gt),
        event_time_gt: optionalString(input.event_time_gt),
      }),
      phase: "execute",
    },
    context,
  );
  const result = requiredResponseRecord(payload, "payload");

  return {
    total_leads: nullableIntegerOrIntegerString(result.total_leads, "total_leads"),
    offset: nullableInteger(result.offset, "offset"),
    limit: nullableInteger(result.limit, "limit"),
    leads: requiredArray(result.data, "data").map((item, index) => normalizeCampaignLead(item, `data[${index}]`)),
    raw: payload,
  };
}

async function smartleadAiRequest(
  input: { path: string; phase: SmartleadAiRequestPhase; query?: Record<string, QueryValue> },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildSmartleadAiUrl(input, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Smartlead request failed: ${error.message}` : "Smartlead request failed",
    );
  }

  if (!response.ok) throw createSmartleadAiError(response.status, payload, input.phase);
  return payload;
}

function buildSmartleadAiUrl(input: { path: string; query?: Record<string, QueryValue> }, apiKey: string): URL {
  const url = new URL(input.path.replace(/^\/+/, ""), `${smartleadAiApiBaseUrl}/`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function createSmartleadAiError(
  status: number,
  payload: unknown,
  phase: SmartleadAiRequestPhase,
): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Smartlead request failed with ${status || 500}`;
  if (status === 401 || status === 403)
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  if ([400, 404, 422].includes(status)) return new ProviderRequestError(400, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function normalizeCampaigns(payload: unknown): Array<Record<string, unknown>> {
  return requiredArray(unwrapDataArray(payload), "campaigns").map((item, index) =>
    normalizeCampaign(item, `campaigns[${index}]`),
  );
}

function normalizeEmailAccounts(payload: unknown): Array<Record<string, unknown>> {
  return requiredArray(unwrapDataArray(payload), "email_accounts").map((item, index) =>
    normalizeEmailAccount(item, `email_accounts[${index}]`),
  );
}

function normalizeCampaign(value: unknown, fieldName: string): Record<string, unknown> {
  const campaign = requiredResponseRecord(value, fieldName);
  return {
    ...campaign,
    id: nullableInteger(campaign.id, `${fieldName}.id`),
    name: nullableString(campaign.name, `${fieldName}.name`),
    status: nullableString(campaign.status, `${fieldName}.status`),
    created_at: nullableString(campaign.created_at, `${fieldName}.created_at`),
    updated_at: nullableString(campaign.updated_at, `${fieldName}.updated_at`),
    client_id: nullableInteger(campaign.client_id, `${fieldName}.client_id`),
    tags: optionalArray(campaign.tags, `${fieldName}.tags`).map((item, index) =>
      normalizeTag(item, `${fieldName}.tags[${index}]`),
    ),
    raw: campaign,
  };
}

function normalizeTag(value: unknown, fieldName: string): Record<string, unknown> {
  const tag = requiredResponseRecord(value, fieldName);
  return {
    ...tag,
    tag_id: nullableInteger(tag.tag_id, `${fieldName}.tag_id`),
    tag_name: nullableString(tag.tag_name, `${fieldName}.tag_name`),
    tag_color: nullableString(tag.tag_color, `${fieldName}.tag_color`),
  };
}

function normalizeEmailAccount(value: unknown, fieldName: string): Record<string, unknown> {
  const account = requiredResponseRecord(value, fieldName);
  return {
    ...account,
    id: nullableInteger(account.id, `${fieldName}.id`),
    from_name: nullableString(account.from_name, `${fieldName}.from_name`),
    from_email: nullableString(account.from_email, `${fieldName}.from_email`),
    username: nullableString(account.username, `${fieldName}.username`),
    type: nullableString(account.type, `${fieldName}.type`),
    client_id: nullableInteger(account.client_id, `${fieldName}.client_id`),
    campaign_count: nullableInteger(account.campaign_count, `${fieldName}.campaign_count`),
    is_smtp_success: nullableBoolean(account.is_smtp_success, `${fieldName}.is_smtp_success`),
    warmup_details: nullableObject(account.warmup_details, `${fieldName}.warmup_details`),
    raw: account,
  };
}

function normalizeCampaignLead(value: unknown, fieldName: string): Record<string, unknown> {
  const campaignLead = requiredResponseRecord(value, fieldName);
  return {
    ...campaignLead,
    campaign_lead_map_id: nullableInteger(campaignLead.campaign_lead_map_id, `${fieldName}.campaign_lead_map_id`),
    lead_category_id: nullableInteger(campaignLead.lead_category_id, `${fieldName}.lead_category_id`),
    status: nullableString(campaignLead.status, `${fieldName}.status`),
    created_at: nullableString(campaignLead.created_at, `${fieldName}.created_at`),
    lead: campaignLead.lead == null ? null : normalizeLeadContact(campaignLead.lead, `${fieldName}.lead`),
    raw: campaignLead,
  };
}

function normalizeLeadContact(value: unknown, fieldName: string): Record<string, unknown> {
  const lead = requiredResponseRecord(value, fieldName);
  return {
    ...lead,
    id: nullableInteger(lead.id, `${fieldName}.id`),
    email: nullableString(lead.email, `${fieldName}.email`),
    first_name: nullableString(lead.first_name, `${fieldName}.first_name`),
    last_name: nullableString(lead.last_name, `${fieldName}.last_name`),
    phone_number: nullableString(lead.phone_number, `${fieldName}.phone_number`),
    company_name: nullableString(lead.company_name, `${fieldName}.company_name`),
    website: nullableString(lead.website, `${fieldName}.website`),
    location: nullableString(lead.location, `${fieldName}.location`),
    linkedin_profile: nullableString(lead.linkedin_profile, `${fieldName}.linkedin_profile`),
    company_url: nullableString(lead.company_url, `${fieldName}.company_url`),
    custom_fields: nullableObject(lead.custom_fields, `${fieldName}.custom_fields`),
    is_unsubscribed: nullableBoolean(lead.is_unsubscribed, `${fieldName}.is_unsubscribed`),
  };
}

function unwrapDataArray(payload: unknown): unknown {
  const record = optionalRecord(payload);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(record?.campaigns)) return record.campaigns;
  if (Array.isArray(record?.data)) return record.data;
  return payload;
}

function unwrapDataObject(payload: unknown, fieldName: string): unknown {
  const record = optionalRecord(payload);
  if (record?.data && typeof record.data === "object" && !Array.isArray(record.data)) return record.data;
  return requiredResponseRecord(payload, fieldName);
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? optionalString(record?.error);
  if (message) return message;
  return optionalString(optionalRecord(record?.error)?.message);
}

function nullableObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  return value == null ? null : requiredResponseRecord(value, fieldName);
}

function requiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${fieldName} must be an array`);
  return value;
}

function optionalArray(value: unknown, fieldName: string): unknown[] {
  return value == null ? [] : requiredArray(value, fieldName);
}

function requiredInteger(value: unknown, fieldName: string, status: number): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ProviderRequestError(status, `${fieldName} must be an integer`);
  return value;
}

function nullableInteger(value: unknown, fieldName: string): number | null {
  return value == null ? null : requiredInteger(value, fieldName, 502);
}

function nullableIntegerOrIntegerString(value: unknown, fieldName: string): number | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return requiredInteger(value, fieldName, 502);
}

function nullableString(value: unknown, fieldName: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new ProviderRequestError(502, `${fieldName} must be a string`);
  return value;
}

function nullableBoolean(value: unknown, fieldName: string): boolean | null {
  if (value == null) return null;
  if (typeof value !== "boolean") throw new ProviderRequestError(502, `${fieldName} must be a boolean`);
  return value;
}
