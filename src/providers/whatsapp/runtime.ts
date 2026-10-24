import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { readTransitFileInput } from "../provider-files.ts";
import { ProviderRequestError, providerInputError, providerUserAgent } from "../provider-runtime.ts";

export const whatsappGraphApiBaseUrl = "https://graph.facebook.com";
export const whatsappGraphApiVersion = "v23.0";
const whatsappMeFields = "id,name";
const analyticsDefaultWindowSeconds = 30 * 24 * 60 * 60;

type WhatsAppPhase = "validate" | "execute";
type WhatsAppActionHandler = ProviderRuntimeHandler<WhatsAppActionContext>;

export interface WhatsAppActionContext {
  accessToken: string;
  wabaId?: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

interface WhatsAppRequestInput {
  accessToken: string;
  path: string;
  operation: string;
  phase: WhatsAppPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  rawBody?: BodyInit;
}

export const whatsappActionHandlers: ProviderActionHandlers<"whatsapp", WhatsAppActionHandler> = {
  get_phone_numbers(input, context) {
    return whatsappGetPhoneNumbers(input, context);
  },
  get_phone_number(input, context) {
    return whatsappGetPhoneNumber(input, context);
  },
  get_business_profile(input, context) {
    return whatsappGetBusinessProfile(input, context);
  },
  get_message_templates(input, context) {
    return whatsappGetMessageTemplates(input, context);
  },
  get_template_status(input, context) {
    return whatsappGetTemplateStatus(input, context);
  },
  get_message_analytics(input, context) {
    return whatsappGetMessageAnalytics(input, context);
  },
  get_pricing_analytics(input, context) {
    return whatsappGetPricingAnalytics(input, context);
  },
  get_template_analytics(input, context) {
    return whatsappGetTemplateAnalytics(input, context);
  },
  create_message_template(input, context) {
    return whatsappCreateMessageTemplate(input, context);
  },
  delete_message_template(input, context) {
    return whatsappDeleteMessageTemplate(input, context);
  },
  send_message(input, context) {
    return whatsappSendTextMessage(input, context);
  },
  send_template_message(input, context) {
    return whatsappSendTemplateMessage(input, context);
  },
  send_media(input, context) {
    return whatsappSendMedia(input, context);
  },
  send_media_by_id(input, context) {
    return whatsappSendMediaById(input, context);
  },
  upload_media(input, context) {
    return whatsappUploadMedia(input, context);
  },
  get_media_info(input, context) {
    return whatsappGetMediaInfo(input, context);
  },
  send_location(input, context) {
    return whatsappSendLocation(input, context);
  },
  send_contacts(input, context) {
    return whatsappSendContacts(input, context);
  },
  send_interactive_buttons(input, context) {
    return whatsappSendInteractiveButtons(input, context);
  },
  send_interactive_list(input, context) {
    return whatsappSendInteractiveList(input, context);
  },
};

export async function validateWhatsAppCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const profile = await whatsappRequest<Record<string, unknown>>({
    accessToken: input.apiKey,
    path: "/me",
    query: { fields: whatsappMeFields },
    fetcher,
    signal,
    operation: "validate_credential",
    phase: "validate",
  });
  const accountId = readString(profile.id) ?? "me";
  const displayName = readString(profile.name) ?? "WhatsApp Business";
  const wabaId = optionalString(input.values.wabaId);

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      graphApiVersion: whatsappGraphApiVersion,
      validationEndpoint: "/me",
      wabaId,
      profileId: accountId,
      profileName: readString(profile.name),
    }),
  };
}

async function whatsappGetPhoneNumbers(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const wabaId = requireWabaId(input, context, "get_phone_numbers");
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${wabaId}/phone_numbers`,
    query: { after: input.after, limit: input.limit },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_phone_numbers",
    phase: "execute",
  });
  return {
    phone_numbers: looseArray(payload.data ?? payload).map((item) => normalizePhoneNumber(item)),
    paging: normalizePaging(payload.paging),
  };
}

async function whatsappGetPhoneNumber(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${String(input.phone_number_id)}`,
    query: { fields: input.fields },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_phone_number",
    phase: "execute",
  });
  return normalizePhoneNumber(payload);
}

async function whatsappGetBusinessProfile(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${String(input.phone_number_id)}/whatsapp_business_profile`,
    query: { fields: input.fields },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_business_profile",
    phase: "execute",
  });
  return normalizeBusinessProfile(extractFirstRecord(payload.data) ?? payload);
}

async function whatsappGetMessageTemplates(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const wabaId = requireWabaId(input, context, "get_message_templates");
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${wabaId}/message_templates`,
    query: {
      after: input.after,
      limit: input.limit,
      status: input.status,
      category: input.category,
      language: input.language,
      name_or_content: input.name_or_content,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_message_templates",
    phase: "execute",
  });
  return {
    templates: looseArray(payload.data ?? payload).map((item) => normalizeTemplate(item)),
    paging: normalizePaging(payload.paging),
  };
}

async function whatsappGetTemplateStatus(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${String(input.template_id)}`,
    query: { fields: input.fields },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_template_status",
    phase: "execute",
  });
  return normalizeTemplate(payload);
}

interface AnalyticsWindow {
  start: number;
  end: number;
}

async function whatsappGetMessageAnalytics(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const wabaId = requireWabaId(input, context, "get_message_analytics");
  const window = resolveAnalyticsWindow(input, "get_message_analytics");
  const granularity = readString(input.granularity) ?? "DAY";
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${wabaId}`,
    query: {
      fields: graphAnalyticsField("analytics", {
        start: window.start,
        end: window.end,
        granularity,
        phone_numbers: input.phone_numbers,
        product_types: input.product_types,
        country_codes: input.country_codes,
      }),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_message_analytics",
    phase: "execute",
  });
  const analytics = asRecord(payload.analytics, "analytics");
  return compactObject({
    granularity: readString(analytics.granularity) ?? granularity,
    phone_numbers: readStringArray(analytics.phone_numbers),
    country_codes: readStringArray(analytics.country_codes),
    data_points: looseArray(analytics.data_points).map((item) => normalizeMessageAnalyticsDataPoint(item)),
  });
}

async function whatsappGetPricingAnalytics(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const wabaId = requireWabaId(input, context, "get_pricing_analytics");
  const window = resolveAnalyticsWindow(input, "get_pricing_analytics");
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${wabaId}`,
    query: {
      fields: graphAnalyticsField("pricing_analytics", {
        start: window.start,
        end: window.end,
        granularity: readString(input.granularity) ?? "DAILY",
        phone_numbers: input.phone_numbers,
        country_codes: input.country_codes,
        metric_types: input.metric_types,
        pricing_types: input.pricing_types,
        pricing_categories: input.pricing_categories,
        dimensions: input.dimensions,
      }),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_pricing_analytics",
    phase: "execute",
  });
  const analytics = asRecord(payload.pricing_analytics, "pricing_analytics");
  return {
    data_points: flattenAnalyticsData(analytics.data).map((item) => normalizePricingAnalyticsDataPoint(item)),
  };
}

async function whatsappGetTemplateAnalytics(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const wabaId = requireWabaId(input, context, "get_template_analytics");
  const useWabaTimezone = optionalBoolean(input.use_waba_timezone) ?? false;
  const window = resolveTemplateAnalyticsWindow(input, useWabaTimezone);
  const templateIds = looseArray(input.template_ids);
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${wabaId}/template_analytics`,
    query: {
      start: window.start,
      end: window.end,
      // The template_analytics edge accepts DAILY only.
      granularity: "DAILY",
      // Meta's documented syntax: template_ids=[id,id] and metric_types=a,b, both unquoted.
      template_ids: `[${templateIds.map((id) => String(id)).join(",")}]`,
      metric_types: graphList(input.metric_types),
      product_type: input.product_type,
      use_waba_timezone: useWabaTimezone ? "true" : undefined,
      after: input.after,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_template_analytics",
    phase: "execute",
  });
  const buckets = looseArray(payload.data).map((entry) => optionalRecord(entry));
  return compactObject({
    waba_timezone: buckets.map((bucket) => readString(bucket?.waba_timezone)).find((zone) => zone !== undefined),
    data_points: flattenAnalyticsData(payload.data).map((item) => normalizeTemplateAnalyticsDataPoint(item)),
    paging: normalizePaging(payload.paging),
  });
}

async function whatsappCreateMessageTemplate(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const wabaId = requireWabaId(input, context, "create_message_template");
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    method: "POST",
    path: `/${wabaId}/message_templates`,
    body: {
      name: input.name,
      category: input.category,
      language: input.language,
      components: input.components,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "create_message_template",
    phase: "execute",
  });
  return {
    id: readString(payload.id) ?? "",
    status: readString(payload.status) ?? "",
    category: readString(payload.category) ?? String(input.category ?? ""),
  };
}

async function whatsappDeleteMessageTemplate(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const wabaId = requireWabaId(input, context, "delete_message_template");
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    method: "DELETE",
    path: `/${wabaId}/message_templates`,
    query: { name: input.name },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "delete_message_template",
    phase: "execute",
  });
  return { success: payload.success !== false };
}

function whatsappSendTextMessage(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type: "text",
      text: {
        body: input.text,
        preview_url: input.preview_url,
      },
      context: input.message_id ? { message_id: input.message_id } : undefined,
    },
    context,
    "send_message",
  );
}

function whatsappSendTemplateMessage(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type: "template",
      template: jsonObject({
        name: input.template_name,
        language: { code: input.language_code },
        components: input.components,
      }),
    },
    context,
    "send_template_message",
  );
}

function whatsappSendMedia(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  const type = String(input.media_type);
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type,
      [type]: jsonObject({
        link: input.link,
        caption: input.caption,
      }),
    },
    context,
    "send_media",
  );
}

function whatsappSendMediaById(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  const type = String(input.media_type);
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type,
      [type]: jsonObject({
        id: input.media_id,
        caption: input.caption,
        filename: input.filename,
      }),
      context: input.reply_to_message_id ? { message_id: input.reply_to_message_id } : undefined,
    },
    context,
    "send_media_by_id",
  );
}

async function whatsappUploadMedia(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  const source = await readTransitFileInput(input.file, context);
  const formData = new FormData();
  formData.set("messaging_product", "whatsapp");
  formData.set("type", source.mimeType);
  formData.set("file", source.file, source.name);

  const uploadPayload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    method: "POST",
    path: `/${String(input.phone_number_id)}/media`,
    rawBody: formData,
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "upload_media",
    phase: "execute",
  });

  const mediaId = readString(uploadPayload.id);
  if (!mediaId) throw new ProviderRequestError(502, "whatsapp upload_media response missing id", uploadPayload);
  return whatsappGetMediaInfo({ media_id: mediaId }, context);
}

async function whatsappGetMediaInfo(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  const payload = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    path: `/${String(input.media_id)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_media_info",
    phase: "execute",
  });
  return normalizeMediaInfo(payload);
}

function whatsappSendLocation(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type: "location",
      location: {
        latitude: input.latitude,
        longitude: input.longitude,
        name: input.name,
        address: input.address,
      },
    },
    context,
    "send_location",
  );
}

function whatsappSendContacts(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type: "contacts",
      contacts: input.contacts,
    },
    context,
    "send_contacts",
  );
}

function whatsappSendInteractiveButtons(
  input: Record<string, unknown>,
  context: WhatsAppActionContext,
): Promise<unknown> {
  const buttons = looseArray(input.buttons).map((item) => {
    const record = asRecord(item, "buttons[]");
    return {
      type: "reply",
      reply: {
        id: readString(record.id) ?? "",
        title: readString(record.title) ?? "",
      },
    };
  });
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type: "interactive",
      interactive: jsonObject({
        type: "button",
        header: input.header_text ? { type: "text", text: input.header_text } : undefined,
        body: { text: input.body_text },
        footer: input.footer_text ? { text: input.footer_text } : undefined,
        action: { buttons },
      }),
      context: input.reply_to_message_id ? { message_id: input.reply_to_message_id } : undefined,
    },
    context,
    "send_interactive_buttons",
  );
}

function whatsappSendInteractiveList(input: Record<string, unknown>, context: WhatsAppActionContext): Promise<unknown> {
  return whatsappSendMessageRequest(
    String(input.phone_number_id),
    {
      to: input.to_number,
      type: "interactive",
      interactive: jsonObject({
        type: "list",
        header: input.header_text ? { type: "text", text: input.header_text } : undefined,
        body: { text: input.body_text },
        footer: input.footer_text ? { text: input.footer_text } : undefined,
        action: {
          button: input.button_text,
          sections: input.sections,
        },
      }),
      context: input.reply_to_message_id ? { message_id: input.reply_to_message_id } : undefined,
    },
    context,
    "send_interactive_list",
  );
}

async function whatsappSendMessageRequest(
  phoneNumberId: string,
  payload: Record<string, unknown>,
  context: WhatsAppActionContext,
  operation: string,
): Promise<unknown> {
  const response = await whatsappRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    method: "POST",
    path: `/${phoneNumberId}/messages`,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...payload,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    operation,
    phase: "execute",
  });
  return normalizeMessageSendResponse(response);
}

async function whatsappRequest<T>(input: WhatsAppRequestInput): Promise<T> {
  const url = new URL(`${whatsappGraphApiBaseUrl}/${whatsappGraphApiVersion}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
  });
  const body = input.rawBody ?? (input.body ? JSON.stringify(input.body) : undefined);
  if (input.body && !input.rawBody) headers.set("content-type", "application/json");

  let response: Response;
  let payload: unknown = {};
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: input.signal,
    });
    const text = await response.text();
    if (text) payload = JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProviderRequestError(502, `whatsapp ${input.operation} returned invalid JSON`);
    }
    throw new ProviderRequestError(
      502,
      `whatsapp ${input.operation} request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const graphError = extractGraphError(payload);
  if (!response.ok || graphError) {
    throw normalizeWhatsAppError({
      status: response.status,
      graphError,
      operation: input.operation,
      phase: input.phase,
      payload,
    });
  }
  return payload as T;
}

function normalizeWhatsAppError(input: {
  status: number;
  graphError: Record<string, unknown> | null;
  operation: string;
  phase: WhatsAppPhase;
  payload: unknown;
}): ProviderRequestError {
  const graphErrorCode = optionalNumber(input.graphError?.code);
  const baseMessage =
    readString(input.graphError?.message) ??
    readString(input.graphError?.error_user_msg) ??
    `whatsapp ${input.operation} request failed`;
  const message = `whatsapp ${input.operation} request failed: ${baseMessage}`;

  if (input.status === 429) return new ProviderRequestError(429, message, input.payload);
  if (input.phase === "validate") {
    if (input.status === 400 || input.status === 401 || input.status === 403 || graphErrorCode === 190) {
      return new ProviderRequestError(input.status || 400, message, input.payload);
    }
  } else {
    if (input.status === 401 || graphErrorCode === 190) return new ProviderRequestError(401, message, input.payload);
    if (input.status === 400 || input.status === 403 || input.status === 404) {
      return new ProviderRequestError(input.status, message, input.payload);
    }
  }
  return new ProviderRequestError(input.status || 500, message, input.payload);
}

function normalizeMessageSendResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    contacts: looseArray(payload.contacts).map((item) => {
      const record = asRecord(item, "contacts[]");
      return {
        input: readString(record.input) ?? "",
        wa_id: readString(record.wa_id) ?? "",
      };
    }),
    messages: looseArray(payload.messages).map((item) => {
      const record = asRecord(item, "messages[]");
      return { id: readString(record.id) ?? "" };
    }),
  };
}

function normalizePhoneNumber(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "phone_number");
  return compactObject({
    id: readString(record.id) ?? "",
    display_phone_number: readString(record.display_phone_number),
    verified_name: readString(record.verified_name),
    quality_rating: readString(record.quality_rating),
    code_verification_status: readString(record.code_verification_status),
    platform_type: readString(record.platform_type),
    last_onboarded_time: readString(record.last_onboarded_time),
    throughput: normalizeThroughput(record.throughput),
    webhook_configuration: normalizeWebhookConfiguration(record.webhook_configuration),
  });
}

function normalizeBusinessProfile(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "business_profile");
  return compactObject({
    messaging_product: readString(record.messaging_product),
    about: readString(record.about),
    address: readString(record.address),
    description: readString(record.description),
    email: readString(record.email),
    profile_picture_url: readString(record.profile_picture_url),
    websites: readStringArray(record.websites),
    vertical: readString(record.vertical),
  });
}

function normalizeTemplate(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "template");
  return compactObject({
    id: readString(record.id) ?? "",
    name: readString(record.name) ?? "",
    status: readString(record.status) ?? "",
    category: readString(record.category) ?? "",
    language: readString(record.language) ?? "",
    components: looseArray(record.components).map((item) => normalizeTemplateComponent(item)),
    created_time: readString(record.created_time),
    updated_time: readString(record.updated_time),
    quality_rating: readString(record.quality_rating),
    parameter_format: readString(record.parameter_format),
    previous_category: readString(record.previous_category),
    rejected_reason: readString(record.rejected_reason),
    quality_score: normalizeTemplateQualityScore(record.quality_score),
  });
}

function normalizeTemplateComponent(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "template_component");
  return compactObject({
    type: readString(record.type) ?? "",
    format: readString(record.format),
    text: readString(record.text),
    buttons: looseArray(record.buttons).map((item) => normalizeTemplateButton(item)),
    example: optionalRecord(record.example),
  });
}

function normalizeTemplateButton(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "template_button");
  return compactObject({
    type: readString(record.type) ?? "",
    text: readString(record.text) ?? "",
    url: readString(record.url),
    phone_number: readString(record.phone_number),
    example: readStringArray(record.example),
  });
}

function normalizeTemplateQualityScore(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  return compactObject({
    score: readString(record.score),
    date: optionalNumber(record.date) ?? readString(record.date),
  });
}

function normalizeMediaInfo(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "media_info");
  return compactObject({
    id: readString(record.id) ?? "",
    url: readString(record.url),
    mime_type: readString(record.mime_type),
    sha256: readString(record.sha256),
    file_size: optionalNumber(record.file_size),
    messaging_product: readString(record.messaging_product),
  });
}

function normalizeThroughput(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  return compactObject({ level: readString(record.level) });
}

function normalizeWebhookConfiguration(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  return compactObject({ application: readString(record.application) });
}

function resolveAnalyticsWindow(input: Record<string, unknown>, actionName: string): AnalyticsWindow {
  const end = optionalInteger(input.end) ?? Math.floor(Date.now() / 1000);
  const start = optionalInteger(input.start) ?? end - analyticsDefaultWindowSeconds;
  if (start >= end) throw providerInputError(`whatsapp ${actionName} requires start to be earlier than end`);
  return { start, end };
}

/**
 * Render a WABA analytics field with Meta's dot-chained modifier syntax, e.g.
 * `pricing_analytics.start(1).end(2).granularity(DAILY).dimensions(PRICING_CATEGORY,COUNTRY)`.
 * Every value is written bare, exactly as Meta's reference examples do: no
 * quotes around enums or phone numbers, lists as comma-separated items. Empty
 * lists are omitted, which Meta reads as "no filter", the same as an absent
 * modifier.
 */
function graphAnalyticsField(field: string, modifiers: Record<string, unknown>): string {
  let rendered = field;
  for (const [key, value] of Object.entries(modifiers)) {
    const item = Array.isArray(value) ? graphList(value) : value;
    if (item == null) continue;
    rendered += `.${key}(${String(item)})`;
  }
  return rendered;
}

/** Comma-separated bare items, the list form Meta's analytics reference uses; `undefined` when empty. */
function graphList(value: unknown): string | undefined {
  const items = looseArray(value);
  if (items.length === 0) return undefined;
  return items.map((item) => String(item)).join(",");
}

/**
 * The template_analytics edge takes a UNIX timestamp or a YYYY-MM-DD date, and
 * insists on the date form when use_waba_timezone is set. A timestamp given in
 * that mode is converted to its UTC calendar date so the caller can use one
 * input shape for both modes.
 */
function resolveTemplateAnalyticsWindow(
  input: Record<string, unknown>,
  useWabaTimezone: boolean,
): { start: string | number; end: string | number } {
  const startDate = readString(input.start);
  const endDate = readString(input.end);
  for (const date of [startDate, endDate]) {
    if (
      date !== undefined &&
      (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw providerInputError("whatsapp template analytics requires valid calendar dates");
  }
  const window = resolveAnalyticsWindow(
    {
      start: startDate === undefined ? optionalInteger(input.start) : Date.parse(startDate) / 1000,
      end: endDate === undefined ? optionalInteger(input.end) : Date.parse(endDate) / 1000,
    },
    "get_template_analytics",
  );
  const start = startDate ?? window.start;
  const end = endDate ?? window.end;
  if (!useWabaTimezone) return { start, end };
  const calendarStart = toCalendarDate(start);
  const calendarEnd = toCalendarDate(end);
  if (calendarStart >= calendarEnd) {
    throw providerInputError("whatsapp get_template_analytics requires start to be earlier than end");
  }
  return { start: calendarStart, end: calendarEnd };
}

function toCalendarDate(value: string | number): string {
  if (typeof value === "string") return value;
  return new Date(value * 1000).toISOString().slice(0, 10);
}

/** Meta nests `data_points` under one `data[]` entry per granularity/product bucket; callers want one flat list. */
function flattenAnalyticsData(value: unknown): unknown[] {
  return looseArray(value).flatMap((entry) => looseArray(optionalRecord(entry)?.data_points));
}

function normalizeMessageAnalyticsDataPoint(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "analytics.data_points[]");
  return compactObject({
    start: optionalNumber(record.start),
    end: optionalNumber(record.end),
    sent: optionalNumber(record.sent),
    delivered: optionalNumber(record.delivered),
  });
}

function normalizePricingAnalyticsDataPoint(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "pricing_analytics.data_points[]");
  return compactObject({
    start: optionalNumber(record.start),
    end: optionalNumber(record.end),
    volume: optionalNumber(record.volume),
    cost: optionalNumber(record.cost),
    phone_number: readString(record.phone_number),
    country: readString(record.country),
    pricing_category: readString(record.pricing_category),
    pricing_type: readString(record.pricing_type),
    tier: readString(record.tier),
  });
}

function normalizeTemplateAnalyticsDataPoint(value: unknown): Record<string, unknown> {
  const record = asRecord(value, "template_analytics.data_points[]");
  return compactObject({
    template_id: readString(record.template_id) ?? "",
    start: optionalNumber(record.start),
    end: optionalNumber(record.end),
    sent: optionalNumber(record.sent),
    delivered: optionalNumber(record.delivered),
    read: optionalNumber(record.read),
    clicked: looseArray(record.clicked).map((item) => {
      const click = asRecord(item, "template_analytics.clicked[]");
      return compactObject({
        type: readString(click.type) ?? "",
        button_content: readString(click.button_content) ?? "",
        count: optionalNumber(click.count) ?? 0,
      });
    }),
    cost: looseArray(record.cost).map((item) => {
      const cost = asRecord(item, "template_analytics.cost[]");
      return compactObject({
        type: readString(cost.type) ?? "",
        value: optionalNumber(cost.value),
      });
    }),
  });
}

function normalizePaging(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  const cursorsRecord = optionalRecord(record.cursors);
  const cursors = cursorsRecord
    ? compactObject({
        before: readString(cursorsRecord.before),
        after: readString(cursorsRecord.after),
      })
    : undefined;
  const next = readString(record.next);
  return compactObject({
    cursors,
    previous: readString(record.previous),
    next,
    // Meta keeps `cursors.after` on the final page and signals the end by
    // omitting `next`; a caller walking `after` alone cannot tell the last
    // page from a middle one, so the end is spelled out as a boolean.
    hasMore: next !== undefined,
  });
}

function requireWabaId(input: Record<string, unknown>, context: WhatsAppActionContext, actionName: string): string {
  const wabaId = readString(input.waba_id) ?? readString(input.wabaId) ?? context.wabaId;
  if (!wabaId) {
    throw new ProviderRequestError(
      400,
      `whatsapp ${actionName} requires waba_id. Set the provider wabaId extra field or pass waba_id in the action input.`,
    );
  }
  return wabaId;
}

function extractGraphError(value: unknown): Record<string, unknown> | null {
  const error = optionalRecord(value)?.error;
  return optionalRecord(error) ?? null;
}

function extractFirstRecord(value: unknown): Record<string, unknown> | undefined {
  return looseArray(value).find((item): item is Record<string, unknown> => optionalRecord(item) !== undefined);
}

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `whatsapp ${fieldName} is not an object`, value);
  return record;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}
