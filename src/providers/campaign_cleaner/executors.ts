import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderTransitFile } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "campaign_cleaner";
const campaignCleanerApiBaseUrl = "https://api.campaigncleaner.com";
const campaignCleanerCreditsPath = "/v1/get_credits";

type CampaignCleanerHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const campaignCleanerActionHandlers: ProviderActionHandlers<"campaign_cleaner", CampaignCleanerHandler> = {
  send_campaign(input, context) {
    return sendCampaign(input, context);
  },
  get_campaign_status(input, context) {
    return getCampaignStatus(input, context);
  },
  get_campaign(input, context) {
    return getCampaign(input, context);
  },
  get_campaign_pdf_analysis(input, context) {
    return getCampaignPdfAnalysis(input, context);
  },
  list_campaigns(_input, context) {
    return listCampaigns(context);
  },
  get_credits(_input, context) {
    return getCredits(context);
  },
  delete_campaign(input, context) {
    return deleteCampaign(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, campaignCleanerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson({
      apiKey: input.apiKey,
      fetcher,
      signal,
      path: campaignCleanerCreditsPath,
      method: "GET",
      phase: "validate",
    });
    return {
      profile: {
        accountId: service,
        displayName: "Campaign Cleaner API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: campaignCleanerApiBaseUrl,
        validationEndpoint: campaignCleanerCreditsPath,
        credits: parseCredits(payload),
      }),
    };
  },
};

async function sendCampaign(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: "/v1/send_campaign",
    method: "POST",
    body: {
      send_campaign: compactObject({
        campaign_html: requiredProviderString(input.campaign_html, "campaign_html"),
        campaign_name: requiredProviderString(input.campaign_name, "campaign_name"),
        adjust_font_colors: optionalBoolean(input.adjust_font_colors),
        adjust_font_size: optionalBoolean(input.adjust_font_size),
        convert_h_to_p_tags: optionalBoolean(input.convert_h_to_p_tags),
        custom_info: optionalString(input.custom_info),
        host_extensionless_images: optionalBoolean(input.host_extensionless_images),
        inline_css: optionalBoolean(input.inline_css),
        inline_css_important: optionalBoolean(input.inline_css_important),
        media_queries_important: optionalBoolean(input.media_queries_important),
        min_font_size_allowed: optionalInteger(input.min_font_size_allowed),
        max_font_size_allowed: optionalInteger(input.max_font_size_allowed),
        preserve_media_queries: optionalBoolean(input.preserve_media_queries),
        relative_links_base_url: optionalString(input.relative_links_base_url),
        remove_classes_and_ids: optionalBoolean(input.remove_classes_and_ids),
        remove_comments: optionalBoolean(input.remove_comments),
        remove_control_non_printable: optionalBoolean(input.remove_control_non_printable),
        remove_css_inheritance: optionalBoolean(input.remove_css_inheritance),
        remove_image_height: optionalBoolean(input.remove_image_height),
        remove_successive_punctuation: optionalBoolean(input.remove_successive_punctuation),
        replace_diacritics: optionalBoolean(input.replace_diacritics),
        replace_non_ascii_characters: optionalBoolean(input.replace_non_ascii_characters),
        resize_and_host: optionalBoolean(input.resize_and_host),
        set_image_max_width: optionalInteger(input.image_max_width),
        surrounding_div: optionalSurroundingDiv(input.surrounding_div),
        webhook_url: optionalString(input.webhook_url),
      }),
    },
    phase: "execute",
  });

  return {
    campaign: parseCampaignReference(payload),
  };
}

async function getCampaignStatus(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: "/v1/get_campaign_status",
    method: "POST",
    body: campaignIdBody(input),
    phase: "execute",
  });
  return {
    campaign_status: parseCampaignSummary(
      optionalRecord(requiredRecord(payload).campaign_status) ?? optionalRecord(requiredRecord(payload).campaign),
    ),
  };
}

async function getCampaign(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: "/v1/get_campaign",
    method: "POST",
    body: {
      campaign: compactObject({
        id: campaignId(input),
        minimize_html: optionalBoolean(input.minimize_html),
      }),
    },
    phase: "execute",
  });
  const campaign = optionalRecord(requiredRecord(payload).campaign);
  if (!campaign) throw new ProviderRequestError(502, "campaign_cleaner response missing campaign", payload);
  return { campaign };
}

async function getCampaignPdfAnalysis(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }
  const id = campaignId(input);
  const response = await context.fetcher(buildUrl("/v1/get_campaign_pdf_analysis"), {
    method: "POST",
    headers: headers(context.apiKey, "application/pdf", true),
    body: JSON.stringify(campaignIdBody(input)),
    signal: context.signal,
  });
  if (!response.ok) {
    throw createError(response.status, await readPayload(response), "execute");
  }

  const mimeType = response.headers.get("content-type") ?? "application/pdf";
  const name =
    sanitizeFilename(
      readContentDispositionFilename(response.headers.get("content-disposition")) ?? `campaign-cleaner-${id}.pdf`,
    ) ?? `campaign-cleaner-${id}.pdf`;
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: name,
    createError: (message) => new ProviderRequestError(413, message),
  });
  const upload = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
  const content: ProviderTransitFile = {
    fileId: upload.fileId,
    downloadUrl: upload.downloadUrl,
    sizeBytes: upload.sizeBytes,
    name,
    mimeType,
  };
  return { content };
}

async function listCampaigns(context: ApiKeyProviderContext) {
  const payload = requiredRecord(
    await requestJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/get_campaign_list",
      method: "GET",
      phase: "execute",
    }),
  );
  return {
    campaigns: Array.isArray(payload.campaign_list)
      ? payload.campaign_list.map((item) => parseCampaignSummary(optionalRecord(item)))
      : [],
  };
}

async function getCredits(context: ApiKeyProviderContext) {
  const payload = await requestJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: campaignCleanerCreditsPath,
    method: "GET",
    phase: "execute",
  });
  return { credits: parseCredits(payload) };
}

async function deleteCampaign(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = requiredRecord(
    await requestJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/delete_campaign",
      method: "POST",
      body: campaignIdBody(input),
      phase: "execute",
    }),
  );
  const status = optionalString(payload.status);
  if (status !== "success" && status !== "failure") {
    throw new ProviderRequestError(502, "campaign_cleaner delete response missing status", payload);
  }
  return compactObject({ status, error: readErrorMessage(payload.error) });
}

async function requestJson(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  method: "GET" | "POST";
  phase: "validate" | "execute";
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}) {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildUrl(input.path), {
      method: input.method,
      headers: headers(input.apiKey, "application/json", input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `campaign_cleaner request failed: ${error.message}` : "campaign_cleaner request failed",
    );
  }
  if (!response.ok) throw createError(response.status, payload, input.phase);
  return payload;
}

function campaignIdBody(input: Record<string, unknown>) {
  return { campaign: { id: campaignId(input) } };
}

function campaignId(input: Record<string, unknown>) {
  return requiredProviderString(input.campaign_id, "campaign_id");
}

function parseCampaignReference(payload: unknown) {
  const campaign = optionalRecord(requiredRecord(payload).campaign);
  const id = optionalString(campaign?.id);
  if (!id) throw new ProviderRequestError(502, "campaign_cleaner response missing campaign.id", payload);
  return { id };
}

function parseCampaignSummary(value: Record<string, unknown> | undefined) {
  if (!value) throw new ProviderRequestError(502, "campaign_cleaner campaign summary response is missing");
  const id = optionalString(value.id);
  const campaignName = optionalString(value.campaign_name);
  const status = optionalString(value.status);
  const dateAdded = optionalString(value.date_added);
  if (!id || !campaignName || !status || !dateAdded) {
    throw new ProviderRequestError(502, "campaign_cleaner campaign summary response is incomplete", value);
  }
  return { id, campaign_name: campaignName, status, date_added: dateAdded };
}

function parseCredits(payload: unknown) {
  const root = requiredRecord(payload);
  const credits = typeof root.credits === "number" ? root.credits : Number(optionalString(root.credits));
  if (!Number.isFinite(credits))
    throw new ProviderRequestError(502, "campaign_cleaner response missing credits", payload);
  return credits;
}

async function readPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message = readErrorMessage(payload) ?? `campaign_cleaner request failed with ${status}`;
  if (phase === "validate" && (status === 401 || status === 403))
    return new ProviderRequestError(400, message, payload);
  if (status === 401 || status === 403) return new ProviderRequestError(status, message, payload);
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(400, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const error = optionalRecord(record.error);
  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(error?.message) ??
    optionalString(error?.error) ??
    optionalString(error?.detail)
  );
}

function headers(apiKey: string, accept: string, hasBody: boolean) {
  return {
    accept,
    "x-cc-api-key": apiKey,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

function buildUrl(path: string) {
  return new URL(path, campaignCleanerApiBaseUrl);
}

function requiredRecord(value: unknown): Record<string, unknown> {
  return requiredStringRecord(value, "campaign_cleaner response");
}

function requiredStringRecord(value: unknown, fieldName: string) {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  return record;
}

function requiredProviderString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function optionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function optionalSurroundingDiv(value: unknown) {
  const surroundingDiv = optionalRecord(value);
  if (!surroundingDiv) return undefined;
  return compactObject({
    max_width: optionalInteger(surroundingDiv.max_width),
    text_align: optionalString(surroundingDiv.text_align),
    font_size: optionalInteger(surroundingDiv.font_size),
    center_to_parent: optionalBoolean(surroundingDiv.center_to_parent),
  });
}

function readContentDispositionFilename(headerValue: string | null) {
  if (!headerValue) return undefined;
  for (const part of headerValue.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("filename=")) {
      return trimmed.slice("filename=".length).replace(/^"|"$/g, "");
    }
  }
  return undefined;
}

function sanitizeFilename(value: string | undefined) {
  const sanitized = value?.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || undefined;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.campaigncleaner.com",
  auth: { type: "api_key_header", name: "x-cc-api-key" },
});
