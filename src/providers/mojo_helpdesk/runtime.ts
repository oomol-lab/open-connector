import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const mojoHelpdeskApiBaseUrl = "https://app.mojohelpdesk.com/api/v2";
const validationPath = "/ticket_queues";

interface MojoRequest extends ApiKeyProviderContext {
  path: string;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, boolean | number | string | undefined>;
  body?: unknown;
}

type MojoHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mojoHelpdeskActionHandlers: ProviderActionHandlers<"mojo_helpdesk", MojoHandler> = {
  async list_tickets(input, context) {
    return {
      tickets: requireArray(
        await requestMojo({
          ...context,
          path: "/tickets",
          query: {
            sort_by: optionalString(input.sortBy),
            sort_order: optionalString(input.sortOrder),
            page: optionalNumber(input.page),
            per_page: optionalNumber(input.perPage),
          },
        }),
        "ticket list",
      ),
    };
  },
  async search_tickets(input, context) {
    return {
      tickets: requireArray(
        await requestMojo({
          ...context,
          path: "/tickets/search",
          query: {
            query: optionalString(input.query),
            sf: optionalString(input.sortField),
            r: input.reverse === undefined ? undefined : input.reverse ? 1 : 0,
            page: optionalNumber(input.page),
            per_page: optionalNumber(input.perPage),
          },
        }),
        "ticket search",
      ),
    };
  },
  async get_ticket(input, context) {
    return {
      ticket: requiredResponseRecord(
        await requestMojo({ ...context, path: `/tickets/${requireId(input.ticketId, "ticketId")}` }),
        "Mojo Helpdesk ticket response",
      ),
    };
  },
  async create_ticket(input, context) {
    return {
      ticket: requiredResponseRecord(
        await requestMojo({ ...context, path: "/tickets", method: "POST", body: buildTicketBody(input) }),
        "Mojo Helpdesk ticket response",
      ),
    };
  },
  async update_ticket(input, context) {
    return {
      ticket: requiredResponseRecord(
        await requestMojo({
          ...context,
          path: `/tickets/${requireId(input.ticketId, "ticketId")}`,
          method: "PUT",
          body: buildTicketBody(input),
        }),
        "Mojo Helpdesk ticket response",
      ),
    };
  },
  async list_comments(input, context) {
    return {
      comments: requireArray(
        await requestMojo({
          ...context,
          path: `/tickets/${requireId(input.ticketId, "ticketId")}/comments`,
          query: { page: optionalNumber(input.page), per_page: optionalNumber(input.perPage) },
        }),
        "comment list",
      ),
    };
  },
  async create_comment(input, context) {
    return {
      comment: requiredResponseRecord(
        await requestMojo({
          ...context,
          path: `/tickets/${requireId(input.ticketId, "ticketId")}/comments`,
          method: "POST",
          body: compactObject({
            body: optionalString(input.body),
            time_spent: optionalNumber(input.timeSpent),
            cc: optionalString(input.cc),
            user_id: optionalNumber(input.userId),
          }),
        }),
        "Mojo Helpdesk comment response",
      ),
    };
  },
  async list_ticket_queues(input, context) {
    return {
      ticketQueues: requireArray(
        await requestMojo({
          ...context,
          path: validationPath,
          query: { page: optionalNumber(input.page), per_page: optionalNumber(input.perPage) },
        }),
        "ticket queue list",
      ),
    };
  },
  async list_tags(input, context) {
    return {
      tags: requireArray(
        await requestMojo({
          ...context,
          path: "/tags",
          query: { sort_by: optionalString(input.sortBy), sort_order: optionalString(input.sortOrder) },
        }),
        "tag list",
      ),
    };
  },
};

export async function validateMojoHelpdeskCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  requireArray(
    await requestMojo({ apiKey, fetcher, signal, path: validationPath, query: { page: 1, per_page: 1 } }),
    "ticket queue list",
  );
  return {
    profile: { accountId: "mojo_helpdesk", displayName: "Mojo Helpdesk API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: mojoHelpdeskApiBaseUrl, validationEndpoint: validationPath },
  };
}

function buildTicketBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = compactObject({
    title: optionalString(input.title),
    description: optionalString(input.description),
    ticket_queue_id: optionalNumber(input.ticketQueueId),
    priority_id: optionalNumber(input.priorityId),
    status_id: optionalNumber(input.statusId),
    ticket_type_id: optionalNumber(input.ticketTypeId),
    assigned_to_id: optionalNumber(input.assignedToId),
    ticket_form_id: optionalNumber(input.ticketFormId),
    user_id: optionalNumber(input.userId),
    user: input.userEmail ? { email: input.userEmail } : undefined,
    cc: optionalString(input.cc),
    asset_tag: optionalString(input.assetTag),
    asset_id: optionalNumber(input.assetId),
    due_on: optionalString(input.dueOn),
    scheduled_on: optionalString(input.scheduledOn),
    resolution_id: optionalNumber(input.resolutionId),
  });
  for (const [key, value] of Object.entries(optionalRecord(input.customFields) ?? {})) {
    body[`custom_field_${key}`] = value;
  }
  return body;
}

async function requestMojo(options: MojoRequest): Promise<unknown> {
  return runProviderRequest({ label: "Mojo Helpdesk", signal: options.signal }, async (signal) => {
    const url = new URL(`${mojoHelpdeskApiBaseUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": options.apiKey,
    });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    const response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Mojo Helpdesk returned invalid JSON",
    });
    if (!response.ok) {
      const body = optionalRecord(payload);
      throw new ProviderRequestError(
        response.status || 502,
        optionalString(body?.message) ??
          optionalString(body?.error) ??
          `Mojo Helpdesk API request failed with status ${response.status}`,
      );
    }
    return payload;
  });
}

function requireId(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw providerInputError(`${fieldName} must be a positive integer`);
  }
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw providerResponseError(`Mojo Helpdesk ${label} must be an array`);
  return looseArray(value);
}
