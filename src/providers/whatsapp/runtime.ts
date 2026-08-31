import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, readTransitFileInput } from "../provider-runtime.ts";

export const whatsappGraphApiBaseUrl = "https://graph.facebook.com";
export const whatsappGraphApiVersion = "v23.0";
const whatsappMeFields = "id,name";

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
    query: { limit: input.limit },
    fetcher: context.fetcher,
    signal: context.signal,
    operation: "get_phone_numbers",
    phase: "execute",
  });
  return {
    phone_numbers: extractArray(payload.data ?? payload).map((item) => normalizePhoneNumber(item)),
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
    templates: extractArray(payload.data ?? payload).map((item) => normalizeTemplate(item)),
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
  const buttons = extractArray(input.buttons).map((item) => {
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
    if (input.status === 401 || graphErrorCode === 190) return new ProviderRequestError(409, message, input.payload);
    if (input.status === 400 || input.status === 403 || input.status === 404) {
      return new ProviderRequestError(input.status, message, input.payload);
    }
  }
  return new ProviderRequestError(input.status || 500, message, input.payload);
}

function normalizeMessageSendResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    contacts: extractArray(payload.contacts).map((item) => {
      const record = asRecord(item, "contacts[]");
      return {
        input: readString(record.input) ?? "",
        wa_id: readString(record.wa_id) ?? "",
      };
    }),
    messages: extractArray(payload.messages).map((item) => {
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
    components: extractArray(record.components).map((item) => normalizeTemplateComponent(item)),
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
    buttons: extractArray(record.buttons).map((item) => normalizeTemplateButton(item)),
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
  return compactObject({
    cursors,
    previous: readString(record.previous),
    next: readString(record.next),
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

function extractArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractFirstRecord(value: unknown): Record<string, unknown> | undefined {
  return extractArray(value).find((item): item is Record<string, unknown> => optionalRecord(item) !== undefined);
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
