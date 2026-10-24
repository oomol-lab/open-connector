import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlerSubset } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  looseArray,
  optionalBoolean,
  optionalInteger,
  optionalObjectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  optionalStringArray,
  positiveInteger,
  recordOrEmpty,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  readProviderTextBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const listmonkCredentialHelpUrl = "https://listmonk.app/docs/apis/apis/";
const listmonkLabel = "Listmonk";

// ISO-8601 with an explicit offset; a bare local time would be interpreted in
// whatever timezone the listmonk server runs in.
const sendAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export interface ListmonkActionContext {
  apiUser: string;
  apiKey: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export type ListmonkActionHandler = (
  input: Record<string, unknown>,
  context: ListmonkActionContext,
) => Promise<unknown>;

type ListmonkQueryValue = string | number | boolean | readonly (string | number)[] | undefined;

interface ListmonkRequestOptions {
  context: ListmonkActionContext;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, ListmonkQueryValue>;
  body?: Record<string, unknown>;
}

interface ListmonkCredentialInput {
  values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Build the listmonk API-user Authorization header, `token <api_user>:<token>`.
 */
export function listmonkAuthorizationHeader(apiUser: string, apiKey: string): string {
  return `token ${apiUser}:${apiKey}`;
}

/**
 * Resolve the instance root URL from validator metadata or the raw credential field.
 */
export function resolveListmonkBaseUrl(input: ListmonkCredentialInput): string {
  return normalizeListmonkBaseUrl(optionalString(input.metadata?.baseUrl) ?? optionalString(input.values?.baseUrl));
}

/**
 * Resolve the API username from the credential fields.
 */
export function resolveListmonkApiUser(input: ListmonkCredentialInput): string {
  return requiredInputString(input.values?.apiUser ?? input.metadata?.apiUser, "apiUser");
}

function normalizeListmonkBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const raw = optionalString(value);
  if (!raw) {
    throw providerInputError("baseUrl is required");
  }

  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  if (url.username || url.password || url.search || url.hash) {
    throw providerInputError("baseUrl must be a clean instance root URL");
  }

  // Users often paste the dashboard or API URL; strip it so paths are not double-prefixed.
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/(api|admin)$/i, "") || "/";
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
}

function buildListmonkUrl(
  context: ListmonkActionContext,
  path: string,
  query?: Record<string, ListmonkQueryValue>,
): string {
  const url = new URL(`./api/${path.replace(/^\/+/, "")}`, `${context.baseUrl.replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function sendListmonkRequest(options: ListmonkRequestOptions, accept: string, signal: AbortSignal): Promise<Response> {
  const { context } = options;
  const headers = new Headers({
    accept,
    authorization: listmonkAuthorizationHeader(context.apiUser, context.apiKey),
    "user-agent": providerUserAgent,
  });
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return context.fetcher(buildListmonkUrl(context, options.path, options.query), {
    method: options.method,
    headers,
    body,
    signal,
  });
}

function mapListmonkHttpError(status: number, payload: unknown): ProviderRequestError {
  const message =
    typeof payload === "string" ? optionalString(payload) : optionalString(optionalRecord(payload)?.message);
  return new ProviderRequestError(status, message ?? `Listmonk request failed with HTTP ${status}`, payload);
}

/**
 * Perform one listmonk API call and return the `data` member of its `{ data }` envelope.
 */
async function requestListmonkData(options: ListmonkRequestOptions): Promise<unknown> {
  return runProviderRequest({ signal: options.context.signal, label: listmonkLabel }, async (signal) => {
    const response = await sendListmonkRequest(options, "application/json", signal);
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Listmonk returned an invalid JSON response",
      // Errors from reverse proxies in front of listmonk are often HTML or plain text.
      invalidJsonFallback: (text) => (response.ok ? undefined : text.slice(0, 500)),
    });
    if (!response.ok) {
      throw mapListmonkHttpError(response.status, payload);
    }
    return optionalRecord(payload)?.data ?? null;
  });
}

async function requestListmonkText(options: ListmonkRequestOptions): Promise<string> {
  return runProviderRequest({ signal: options.context.signal, label: listmonkLabel }, async (signal) => {
    const response = await sendListmonkRequest(options, "text/html, application/json", signal);
    const text = await readProviderTextBody(response, "Listmonk response");
    if (!response.ok) {
      const payload = parseProviderJsonBodyText(text, {
        emptyBody: null,
        invalidJsonMessage: "Listmonk returned an invalid error response",
        invalidJsonFallback: (raw) => raw.slice(0, 500),
      });
      throw mapListmonkHttpError(response.status, payload);
    }
    return text;
  });
}

function idPath(resource: string, id: number, suffix = ""): string {
  return `${resource}/${id}${suffix}`;
}

function optionalIdArray(value: unknown, fieldName: string): number[] | undefined {
  return value === undefined ? undefined : requiredIdArray(value, fieldName);
}

function requiredIdArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value)) {
    throw providerInputError(`${fieldName} must be an array of positive integers`);
  }
  return value.map((item) => positiveInteger(item, fieldName, providerInputError));
}

/**
 * Read `id` from `[{ id, ... }]` payloads such as a campaign's lists or media.
 * The IDs are echoed back in replacement PUT bodies, so a payload that cannot
 * be read fails instead of silently detaching every association. listmonk
 * reports a deleted list as id 0, which is dropped.
 */
function readNestedIds(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) {
    throw providerResponseError(`Listmonk ${label} must be an array`);
  }
  return value
    .map((item) => {
      const id = optionalInteger(optionalRecord(item)?.id);
      if (id === undefined) {
        throw providerResponseError(`Listmonk ${label} must contain objects with an integer id`);
      }
      return id;
    })
    .filter((id) => id > 0);
}

/** Campaign media is absent on releases that predate attachments. */
function readCampaignMediaIds(campaign: Record<string, unknown>): number[] {
  return campaign.media === undefined || campaign.media === null ? [] : readNestedIds(campaign.media, "campaign media");
}

function readSendAt(value: unknown, fieldName = "sendAt"): string {
  const sendAt = requiredInputString(value, fieldName);
  if (!sendAtPattern.test(sendAt) || Number.isNaN(Date.parse(sendAt))) {
    throw providerInputError(
      `${fieldName} must be an ISO-8601 timestamp with a timezone offset, for example 2026-10-01T09:00:00+02:00`,
    );
  }
  if (Date.parse(sendAt) <= Date.now()) {
    throw providerInputError(`${fieldName} must be in the future`);
  }
  return sendAt;
}

function pagingQuery(input: Record<string, unknown>): Record<string, ListmonkQueryValue> {
  if (optionalBoolean(input.all) === true) {
    return { per_page: "all" };
  }
  return { page: optionalInteger(input.page), per_page: optionalInteger(input.perPage) };
}

function readPage(key: string, payload: unknown): Record<string, unknown> {
  // listmonk answers an empty minimal list query with a bare [] instead of a page.
  if (Array.isArray(payload)) {
    return {
      [key]: optionalObjectArray(payload, `Listmonk ${key} response`),
      total: payload.length,
      page: 1,
      perPage: 0,
    };
  }
  const page = recordOrEmpty(payload);
  return {
    [key]: optionalObjectArray(page.results, `Listmonk ${key} response`),
    total: optionalInteger(page.total) ?? 0,
    page: optionalInteger(page.page) ?? 1,
    perPage: optionalInteger(page.per_page) ?? 0,
  };
}

function getCampaign(context: ListmonkActionContext, campaignId: number): Promise<Record<string, unknown>> {
  return requestListmonkData({ context, method: "GET", path: idPath("campaigns", campaignId) }).then(recordOrEmpty);
}

/**
 * PUT /api/campaigns/:id binds the request onto the stored campaign, except for
 * the target lists and media attachments, which are reset unless sent again.
 * Always echo the current ones so a partial update never detaches them.
 */
async function updateCampaign(
  context: ListmonkActionContext,
  campaignId: number,
  current: Record<string, unknown>,
  changes: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    lists: readNestedIds(current.lists, "campaign lists"),
    media: readCampaignMediaIds(current),
    ...changes,
  };
  return recordOrEmpty(
    await requestListmonkData({ context, method: "PUT", path: idPath("campaigns", campaignId), body }),
  );
}

async function setCampaignStatus(
  context: ListmonkActionContext,
  campaignId: number,
  status: string,
): Promise<Record<string, unknown>> {
  return recordOrEmpty(
    await requestListmonkData({
      context,
      method: "PUT",
      path: idPath("campaigns", campaignId, "/status"),
      body: { status },
    }),
  );
}

function campaignStatusHandler(status: string): ListmonkActionHandler {
  return async (input, context) => {
    const campaignId = positiveInteger(input.campaignId, "campaignId", providerInputError);
    return { campaign: await setCampaignStatus(context, campaignId, status) };
  };
}

export const listmonkActionHandlers: ProviderActionHandlerSubset<"listmonk", ListmonkActionHandler> = {
  async list_subscribers(input, context) {
    const payload = await requestListmonkData({
      context,
      method: "GET",
      path: "subscribers",
      query: {
        query: optionalString(input.query),
        list_id: optionalIdArray(input.listIds, "listIds"),
        subscription_status: optionalString(input.subscriptionStatus),
        order_by: optionalString(input.orderBy),
        order: optionalString(input.order),
        ...pagingQuery(input),
      },
    });
    return readPage("subscribers", payload);
  },

  async get_subscriber(input, context) {
    const subscriberId = positiveInteger(input.subscriberId, "subscriberId", providerInputError);
    const payload = await requestListmonkData({ context, method: "GET", path: idPath("subscribers", subscriberId) });
    return { subscriber: recordOrEmpty(payload) };
  },

  async create_subscriber(input, context) {
    const body: Record<string, unknown> = {
      email: requiredInputString(input.email, "email"),
      name: requiredInputString(input.name, "name"),
      status: optionalString(input.status) ?? "enabled",
      lists: optionalIdArray(input.listIds, "listIds") ?? [],
      attribs: optionalRecord(input.attribs) ?? {},
      preconfirm_subscriptions: optionalBoolean(input.preconfirmSubscriptions) ?? false,
    };
    const payload = await requestListmonkData({ context, method: "POST", path: "subscribers", body });
    return { subscriber: recordOrEmpty(payload) };
  },

  async update_subscriber(input, context) {
    const subscriberId = positiveInteger(input.subscriberId, "subscriberId", providerInputError);
    // PUT replaces list subscriptions with whatever is sent (an empty array
    // unsubscribes from everything), so merge onto the current subscriber.
    const current = recordOrEmpty(
      await requestListmonkData({ context, method: "GET", path: idPath("subscribers", subscriberId) }),
    );
    const body: Record<string, unknown> = {
      email: optionalString(input.email) ?? optionalString(current.email),
      name: optionalString(input.name) ?? optionalString(current.name),
      status: optionalString(input.status) ?? optionalString(current.status),
      lists: optionalIdArray(input.listIds, "listIds") ?? readNestedIds(current.lists, "subscriber lists"),
      attribs: optionalRecord(input.attribs) ?? optionalRecord(current.attribs) ?? {},
      preconfirm_subscriptions: optionalBoolean(input.preconfirmSubscriptions) ?? false,
    };
    const payload = await requestListmonkData({
      context,
      method: "PUT",
      path: idPath("subscribers", subscriberId),
      body,
    });
    return { subscriber: recordOrEmpty(payload) };
  },

  async delete_subscriber(input, context) {
    const subscriberId = positiveInteger(input.subscriberId, "subscriberId", providerInputError);
    await requestListmonkData({ context, method: "DELETE", path: idPath("subscribers", subscriberId) });
    return { deleted: true };
  },

  async manage_subscriber_lists(input, context) {
    const action = requiredInputString(input.action, "action");
    const status = optionalString(input.status);
    if (action === "add" && !status) {
      throw providerInputError("status is required when action is add");
    }
    await requestListmonkData({
      context,
      method: "PUT",
      path: "subscribers/lists",
      body: {
        ids: requiredIdArray(input.subscriberIds, "subscriberIds"),
        action,
        target_list_ids: requiredIdArray(input.targetListIds, "targetListIds"),
        status,
      },
    });
    return { updated: true };
  },

  async blocklist_subscribers(input, context) {
    await requestListmonkData({
      context,
      method: "PUT",
      path: "subscribers/blocklist",
      body: { ids: requiredIdArray(input.subscriberIds, "subscriberIds") },
    });
    return { blocklisted: true };
  },

  async list_lists(input, context) {
    const payload = await requestListmonkData({
      context,
      method: "GET",
      path: "lists",
      query: {
        query: optionalString(input.query),
        status: optionalString(input.status),
        tag: optionalStringArray(input.tags),
        order_by: optionalString(input.orderBy),
        order: optionalString(input.order),
        ...pagingQuery(input),
      },
    });
    return readPage("lists", payload);
  },

  async get_list(input, context) {
    const listId = positiveInteger(input.listId, "listId", providerInputError);
    const payload = await requestListmonkData({ context, method: "GET", path: idPath("lists", listId) });
    return { list: recordOrEmpty(payload) };
  },

  async create_list(input, context) {
    const body: Record<string, unknown> = {
      name: requiredInputString(input.name, "name"),
      type: requiredInputString(input.type, "type"),
      optin: requiredInputString(input.optin, "optin"),
      status: optionalString(input.status),
      tags: optionalStringArray(input.tags) ?? [],
      description: optionalString(input.description),
    };
    const payload = await requestListmonkData({ context, method: "POST", path: "lists", body });
    return { list: recordOrEmpty(payload) };
  },

  async update_list(input, context) {
    const listId = positiveInteger(input.listId, "listId", providerInputError);
    // The update query requires a name and always overwrites tags, so carry
    // the current values over when the caller does not change them.
    const current = recordOrEmpty(await requestListmonkData({ context, method: "GET", path: idPath("lists", listId) }));
    const body: Record<string, unknown> = {
      name: optionalString(input.name) ?? optionalString(current.name),
      type: optionalString(input.type),
      optin: optionalString(input.optin),
      status: optionalString(input.status),
      tags: optionalStringArray(input.tags) ?? optionalStringArray(current.tags) ?? [],
      description: optionalString(input.description),
    };
    const payload = await requestListmonkData({ context, method: "PUT", path: idPath("lists", listId), body });
    return { list: recordOrEmpty(payload) };
  },

  async list_templates(input, context) {
    const payload = await requestListmonkData({
      context,
      method: "GET",
      path: "templates",
      query: { no_body: optionalBoolean(input.noBody) ?? true },
    });
    return { templates: optionalObjectArray(payload, "Listmonk templates response") };
  },

  async get_template(input, context) {
    const templateId = positiveInteger(input.templateId, "templateId", providerInputError);
    const payload = await requestListmonkData({ context, method: "GET", path: idPath("templates", templateId) });
    return { template: recordOrEmpty(payload) };
  },

  async list_campaigns(input, context) {
    const payload = await requestListmonkData({
      context,
      method: "GET",
      path: "campaigns",
      query: {
        query: optionalString(input.query),
        status: optionalStringArray(input.statuses),
        // The handler reads the repeated `tag` parameter, not `tags`.
        tag: optionalStringArray(input.tags),
        order_by: optionalString(input.orderBy),
        order: optionalString(input.order),
        no_body: optionalBoolean(input.noBody) ?? true,
        ...pagingQuery(input),
      },
    });
    return readPage("campaigns", payload);
  },

  async get_campaign(input, context) {
    const campaignId = positiveInteger(input.campaignId, "campaignId", providerInputError);
    const payload = await requestListmonkData({
      context,
      method: "GET",
      path: idPath("campaigns", campaignId),
      query: { no_body: optionalBoolean(input.noBody) },
    });
    return { campaign: recordOrEmpty(payload) };
  },

  async create_campaign(input, context) {
    const body: Record<string, unknown> = {
      name: requiredInputString(input.name, "name"),
      subject: requiredInputString(input.subject, "subject"),
      lists: requiredIdArray(input.listIds, "listIds"),
      from_email: optionalString(input.fromEmail),
      type: "regular",
      content_type: optionalString(input.contentType) ?? "richtext",
      body: optionalRawString(input.body) ?? "",
      altbody: optionalRawString(input.altbody),
      template_id:
        input.templateId === undefined
          ? undefined
          : positiveInteger(input.templateId, "templateId", providerInputError),
      tags: optionalStringArray(input.tags) ?? [],
      send_at: input.sendAt === undefined ? undefined : readSendAt(input.sendAt),
      messenger: optionalString(input.messenger) ?? "email",
      headers: optionalObjectArray(input.headers, "headers", providerInputError),
    };
    const payload = await requestListmonkData({ context, method: "POST", path: "campaigns", body });
    return { campaign: recordOrEmpty(payload) };
  },

  async update_campaign(input, context) {
    const campaignId = positiveInteger(input.campaignId, "campaignId", providerInputError);
    const current = await getCampaign(context, campaignId);
    const changes: Record<string, unknown> = {};
    const name = optionalString(input.name);
    if (name !== undefined) changes.name = name;
    const subject = optionalString(input.subject);
    if (subject !== undefined) changes.subject = subject;
    const listIds = optionalIdArray(input.listIds, "listIds");
    if (listIds !== undefined) changes.lists = listIds;
    const fromEmail = optionalString(input.fromEmail);
    if (fromEmail !== undefined) changes.from_email = fromEmail;
    const contentType = optionalString(input.contentType);
    if (contentType !== undefined) changes.content_type = contentType;
    const body = optionalRawString(input.body);
    if (body !== undefined) changes.body = body;
    const altbody = optionalRawString(input.altbody);
    if (altbody !== undefined) changes.altbody = altbody;
    if (input.templateId !== undefined)
      changes.template_id = positiveInteger(input.templateId, "templateId", providerInputError);
    const tags = optionalStringArray(input.tags);
    if (tags !== undefined) changes.tags = tags;
    if (input.sendAt === null) {
      changes.send_at = null;
    } else if (input.sendAt !== undefined) {
      changes.send_at = readSendAt(input.sendAt);
    }
    return { campaign: await updateCampaign(context, campaignId, current, changes) };
  },

  async delete_campaign(input, context) {
    const campaignId = positiveInteger(input.campaignId, "campaignId", providerInputError);
    await requestListmonkData({ context, method: "DELETE", path: idPath("campaigns", campaignId) });
    return { deleted: true };
  },

  async get_campaign_preview(input, context) {
    const campaignId = positiveInteger(input.campaignId, "campaignId", providerInputError);
    const html = await requestListmonkText({
      context,
      method: "GET",
      path: idPath("campaigns", campaignId, "/preview"),
    });
    return { html };
  },

  async send_campaign_test(input, context) {
    const campaignId = positiveInteger(input.campaignId, "campaignId", providerInputError);
    const emails = looseArray(input.emails).map((email) => requiredInputString(email, "emails"));
    if (emails.length === 0) {
      throw providerInputError("emails must contain at least one address");
    }
    // The test endpoint validates a full campaign payload rather than reading
    // the stored one, so send the saved campaign back with the recipients.
    const current = await getCampaign(context, campaignId);
    await requestListmonkData({
      context,
      method: "POST",
      path: idPath("campaigns", campaignId, "/test"),
      body: {
        name: current.name,
        subject: current.subject,
        lists: readNestedIds(current.lists, "campaign lists"),
        from_email: current.from_email,
        content_type: current.content_type,
        body: current.body,
        altbody: current.altbody,
        messenger: current.messenger,
        headers: current.headers,
        template_id: current.template_id,
        media: readCampaignMediaIds(current),
        subscribers: emails,
      },
    });
    return { sent: true };
  },

  async schedule_campaign(input, context) {
    const campaignId = positiveInteger(input.campaignId, "campaignId", providerInputError);
    const sendAt = readSendAt(input.sendAt);
    const current = await getCampaign(context, campaignId);
    const status = optionalString(current.status);
    if (status !== "draft" && status !== "paused" && status !== "scheduled") {
      throw providerInputError(
        `Only draft, paused, or scheduled campaigns can be scheduled; campaign ${campaignId} is ${status ?? "unknown"}`,
      );
    }
    // listmonk refuses to schedule a campaign without a stored send_at, so the
    // time is saved first and the status flips second.
    const updated = await updateCampaign(context, campaignId, current, { send_at: sendAt });
    if (status === "scheduled") {
      return { campaign: updated };
    }
    return { campaign: await setCampaignStatus(context, campaignId, "scheduled") };
  },

  unschedule_campaign: campaignStatusHandler("draft"),
  start_campaign: campaignStatusHandler("running"),
  pause_campaign: campaignStatusHandler("paused"),
  cancel_campaign: campaignStatusHandler("cancelled"),

  async get_running_campaign_stats(input, context) {
    const campaignIds = optionalIdArray(input.campaignIds, "campaignIds");
    const payload = await requestListmonkData({
      context,
      method: "GET",
      path: "campaigns/running/stats",
      // Older releases require campaign_id; newer ones return every running campaign.
      query: { campaign_id: campaignIds },
    });
    const stats = optionalObjectArray(payload, "Listmonk running stats response");
    return {
      stats:
        campaignIds === undefined
          ? stats
          : stats.filter((entry) => campaignIds.includes(optionalInteger(entry.id) ?? 0)),
    };
  },

  async get_campaign_analytics(input, context) {
    const type = requiredInputString(input.type, "type");
    const payload = await requestListmonkData({
      context,
      method: "GET",
      path: `campaigns/analytics/${encodeURIComponent(type)}`,
      query: {
        id: requiredIdArray(input.campaignIds, "campaignIds"),
        from: requiredInputString(input.from, "from"),
        to: requiredInputString(input.to, "to"),
      },
    });
    return { type, results: optionalObjectArray(payload, "Listmonk analytics response") };
  },

  async get_profile(_input, context) {
    const payload = await requestListmonkData({ context, method: "GET", path: "profile" });
    return { user: recordOrEmpty(payload) };
  },
};

/**
 * Validate a listmonk API user by reading its own profile. The validator
 * fetcher must already be re-guarded with the private-network opt-in.
 */
export async function validateListmonkCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredInputString(input.apiKey, "apiKey");
  const apiUser = resolveListmonkApiUser({ values: input.values });
  const baseUrl = normalizeListmonkBaseUrl(input.values.baseUrl);

  const profile = recordOrEmpty(
    await requestListmonkData({
      context: { apiUser, apiKey, baseUrl, fetcher, signal },
      method: "GET",
      path: "profile",
    }),
  );
  const username = optionalString(profile.username) ?? apiUser;

  return {
    profile: {
      accountId: `listmonk:${baseUrl}:${username}`,
      displayName: `Listmonk (${username} @ ${new URL(baseUrl).host})`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      baseUrl,
      credentialHelpUrl: listmonkCredentialHelpUrl,
    },
  };
}
