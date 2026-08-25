import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const eventzillaApiBaseUrl = "https://www.eventzillaapi.net/api/v2";
const eventzillaValidationPath = "/users";
const eventzillaDefaultTimeoutMs = 30_000;

type EventzillaPhase = "validate" | "execute";
type EventzillaContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type EventzillaActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface EventzillaRequestInput {
  path: string;
  query: Record<string, string | number | undefined>;
  phase: EventzillaPhase;
}

export const eventzillaActionHandlers: ProviderActionHandlers<"eventzilla", EventzillaActionHandler> = {
  async list_events(input, context) {
    const payload = await requestEventzillaJson(
      {
        path: "/events",
        query: compactObject({
          offset: readOptionalNonNegativeInteger(input.offset, "offset"),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
          status: readOptionalTrimmedString(input.status),
          category: readOptionalTrimmedString(input.category),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      pagination: normalizePagination(payload),
      events: normalizeEventList(readArrayEnvelope(payload, "events")),
    };
  },
  async get_event(input, context) {
    const eventId = requirePositiveInteger(input.eventid, "eventid");
    const payload = await requestEventzillaJson({ path: `/events/${eventId}`, query: {}, phase: "execute" }, context);

    return {
      event: normalizeFirstRecord(readArrayEnvelope(payload, "events"), normalizeEventRecord),
    };
  },
  async list_event_tickets(input, context) {
    const eventId = requirePositiveInteger(input.eventid, "eventid");
    const payload = await requestEventzillaJson(
      { path: `/events/${eventId}/tickets`, query: {}, phase: "execute" },
      context,
    );

    return {
      tickets: normalizeTicketList(readArrayEnvelope(payload, "tickets")),
      donation: normalizeDonationList(readArrayEnvelope(payload, "donation", { allowMissing: true })),
    };
  },
  async list_event_transactions(input, context) {
    const eventId = requirePositiveInteger(input.eventid, "eventid");
    const payload = await requestEventzillaJson(
      {
        path: `/events/${eventId}/transactions`,
        query: compactObject({
          offset: readOptionalNonNegativeInteger(input.offset, "offset"),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      pagination: normalizePagination(payload),
      transactions: normalizeTransactionList(readArrayEnvelope(payload, "transactions")),
    };
  },
  async list_event_attendees(input, context) {
    const eventId = requirePositiveInteger(input.eventid, "eventid");
    const payload = await requestEventzillaJson(
      {
        path: `/events/${eventId}/attendees`,
        query: compactObject({
          offset: readOptionalNonNegativeInteger(input.offset, "offset"),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      attendees: normalizeAttendeeList(readArrayEnvelope(payload, "attendees")),
    };
  },
  async list_users(input, context) {
    const payload = await requestEventzillaJson(
      {
        path: "/users/",
        query: compactObject({
          offset: readOptionalNonNegativeInteger(input.offset, "offset"),
          limit: readOptionalPositiveInteger(input.limit, "limit"),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      pagination: normalizePagination(payload),
      users: normalizeUserList(readArrayEnvelope(payload, "users")),
    };
  },
  async get_user(input, context) {
    const userId = requirePositiveInteger(input.userid, "userid");
    const payload = await requestEventzillaJson({ path: `/users/${userId}`, query: {}, phase: "execute" }, context);

    return {
      user: normalizeFirstRecord(readArrayEnvelope(payload, "users"), normalizeUserRecord),
    };
  },
  async get_transaction(input, context) {
    const checkoutId = optionalInteger(input.checkout_id);
    const refno = readOptionalTrimmedString(input.refno);
    if ((checkoutId === undefined) === (refno === undefined)) {
      throw new ProviderRequestError(400, "Provide exactly one of checkout_id or refno.");
    }
    if (checkoutId !== undefined && checkoutId <= 0) {
      throw new ProviderRequestError(400, "checkout_id must be a positive integer");
    }
    const identifier = checkoutId ?? refno!;
    const payload = await requestEventzillaJson(
      {
        path: `/transactions/${encodeURIComponent(String(identifier))}`,
        query: {},
        phase: "execute",
      },
      context,
    );

    return {
      transaction: normalizeFirstRecord(readArrayEnvelope(payload, "transaction"), normalizeTransactionRecord),
    };
  },
  async get_attendee(input, context) {
    const attendeeId = requirePositiveInteger(input.attendeeid, "attendeeid");
    const payload = await requestEventzillaJson(
      { path: `/attendees/${attendeeId}`, query: {}, phase: "execute" },
      context,
    );

    return {
      attendee: normalizeFirstRecord(readArrayEnvelope(payload, "attendees"), normalizeAttendeeRecord),
    };
  },
};

export async function validateEventzillaCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestEventzillaJson(
    {
      path: eventzillaValidationPath,
      query: { offset: 0, limit: 1 },
      phase: "validate",
    },
    { apiKey, fetcher, signal },
  );
  const users = readArrayEnvelope(payload, "users");
  const firstUserRecord = users[0] ? optionalRecord(users[0]) : undefined;
  const firstUserId = optionalInteger(firstUserRecord?.id);
  const firstUserEmail = optionalString(firstUserRecord?.email);
  const firstUserName = buildDisplayName(firstUserRecord?.first_name, firstUserRecord?.last_name);
  const totalUsers = readPaginationEntry(payload)?.total;

  return {
    profile: {
      accountId: firstUserId ? String(firstUserId) : "api_key",
      displayName: firstUserName || firstUserEmail || "Eventzilla API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: eventzillaApiBaseUrl,
      validationEndpoint: `${eventzillaValidationPath}?offset=0&limit=1`,
      userCount: totalUsers ?? users.length,
      firstUserId,
      firstUserEmail,
    }),
  };
}

async function requestEventzillaJson(
  input: EventzillaRequestInput,
  context: EventzillaContext,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, eventzillaDefaultTimeoutMs);
  try {
    const response = await context.fetcher(buildEventzillaUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readEventzillaPayload(response);

    if (!response.ok) {
      throw createEventzillaError(response.status, payload, input.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Eventzilla returned an invalid payload", payload);
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Eventzilla request timed out after ${Math.ceil(eventzillaDefaultTimeoutMs / 1000)} seconds`,
        error,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Eventzilla request failed: ${error.message}` : "Eventzilla request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildEventzillaUrl(path: string, query: Record<string, string | number | undefined>): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${eventzillaApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readEventzillaPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Eventzilla returned invalid JSON", text);
  }
}

function createEventzillaError(status: number, payload: unknown, phase: EventzillaPhase): ProviderRequestError {
  const message = extractEventzillaErrorMessage(payload) ?? `Eventzilla request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractEventzillaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["error", "message", "detail", "title"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readArrayEnvelope(
  payload: Record<string, unknown>,
  key: string,
  options: { allowMissing?: boolean } = {},
): unknown[] {
  const value = payload[key];
  if (Array.isArray(value)) {
    return value;
  }
  if (options.allowMissing && value === undefined) {
    return [];
  }
  throw new ProviderRequestError(502, `Eventzilla response is missing ${key}`, payload);
}

function readPaginationEntry(payload: Record<string, unknown>): { total?: number } | undefined {
  const entries = Array.isArray(payload.pagination) ? payload.pagination : [];
  const first = entries[0] ? optionalRecord(entries[0]) : undefined;
  if (!first) {
    return undefined;
  }
  return { total: optionalInteger(first.total) };
}

function normalizePagination(payload: Record<string, unknown>): Record<string, unknown> {
  const raw = Array.isArray(payload.pagination) ? payload.pagination.map((entry) => optionalRecord(entry) ?? {}) : [];
  const first = raw[0];
  return {
    offset: optionalInteger(first?.offset) ?? null,
    limit: optionalInteger(first?.limit) ?? null,
    total: optionalInteger(first?.total) ?? null,
    raw,
  };
}

function normalizeEventList(items: unknown[]): Array<Record<string, unknown>> {
  return items.map((item) => normalizeEventRecord(requireResponseObject(item, "event")));
}

function normalizeTicketList(items: unknown[]): Array<Record<string, unknown>> {
  return items.map((item) => normalizeTicketRecord(requireResponseObject(item, "ticket")));
}

function normalizeDonationList(items: unknown[]): Array<Record<string, unknown>> {
  return items.map((item) => normalizeDonationRecord(requireResponseObject(item, "donation")));
}

function normalizeTransactionList(items: unknown[]): Array<Record<string, unknown>> {
  return items.map((item) => normalizeTransactionRecord(requireResponseObject(item, "transaction")));
}

function normalizeAttendeeList(items: unknown[]): Array<Record<string, unknown>> {
  return items.map((item) => normalizeAttendeeRecord(requireResponseObject(item, "attendee")));
}

function normalizeUserList(items: unknown[]): Array<Record<string, unknown>> {
  return items.map((item) => normalizeUserRecord(requireResponseObject(item, "user")));
}

function normalizeFirstRecord(
  items: unknown[],
  normalizer: (record: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | null {
  return items[0] ? normalizer(requireResponseObject(items[0], "record")) : null;
}

function normalizeEventRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requirePositiveInteger(record.id, "event id"),
    title: requireResponseString(record.title, "event title"),
    description: readNullableString(record.description),
    currency: readNullableString(record.currency),
    start_date: readNullableString(record.start_date),
    start_time: readNullableString(record.start_time),
    end_date: readNullableString(record.end_date),
    end_time: readNullableString(record.end_time),
    dateid: optionalInteger(record.dateid) ?? null,
    time_zone: readNullableString(record.time_zone),
    tickets_sold: optionalInteger(record.tickets_sold) ?? null,
    tickets_total: optionalInteger(record.tickets_total) ?? null,
    status: readNullableString(record.status),
    show_remaining: readNullableBoolean(record.show_remaining),
    twitter_hashtag: readNullableString(record.twitter_hashtag),
    utc_offset: readNullableString(record.utc_offset),
    invite_code: readNullableString(record.invite_code),
    url: readNullableString(record.url),
    logo_url: readNullableString(record.logo_url),
    bgimage_url: readNullableString(record.bgimage_url),
    venue: readNullableString(record.venue),
    categories: readNullableString(record.categories),
    language: readNullableString(record.language),
    description_html: readNullableString(record.description_html),
    timezone_code: readNullableString(record.timezone_code),
    raw: record,
  };
}

function normalizeTicketRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requirePositiveInteger(record.id, "ticket id"),
    title: requireResponseString(record.title, "ticket title"),
    quantity_total: readNullableInteger(record.quantity_total),
    price: readNullableNumber(record.price),
    description: readNullableString(record.description),
    sales_start_date: readNullableString(record.sales_start_date),
    sales_start_time: readNullableString(record.sales_start_time),
    sales_end_date: readNullableString(record.sales_end_date),
    sales_end_time: readNullableString(record.sales_end_time),
    group_discount: readNullableNumber(record.group_discount),
    group_percentage: readNullableNumber(record.group_percentage),
    group_price: readNullableNumber(record.group_price),
    additional_instructions: readNullableString(record.additional_instructions),
    unlock_code: readNullableString(record.unlock_code),
    ticket_type: readNullableString(record.ticket_type ?? record.tickets),
    boxoffice_only: readNullableBoolean(record.boxoffice_only),
    is_visible: readNullableBoolean(record.is_visible ?? record.isvisible),
    limit_minimum: readNullableInteger(record.limit_minimum),
    limit_maximum: readNullableInteger(record.limit_maximum),
    allow_partial_payment: readNullableBoolean(record.allow_partial_payment),
    partial_payment_installments: readNullableInteger(record.partial_payment_installments),
    partial_payment_frequency: readNullableString(record.partial_payment_frequency),
    partial_payment_amount: readNullableNumber(record.partial_payment_amount),
    raw: record,
  };
}

function normalizeDonationRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    donationid: requirePositiveInteger(record.donationid, "donation id"),
    title: requireResponseString(record.title, "donation title"),
    description: readNullableString(record.description),
    quantity_total: readNullableInteger(record.quantity_total),
    donation_minimum: readNullableString(record.donation_minimum),
    donation_start_date: readNullableString(record.donation_start_date),
    donation_end_date: readNullableString(record.donation_end_date),
    raw: record,
  };
}

function normalizeTransactionRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    checkout_id: requirePositiveInteger(record.checkout_id, "transaction checkout_id"),
    transaction_ref: readNullableString(record.transaction_ref),
    refno: readNullableString(record.refno),
    transaction_date: readNullableString(record.transaction_date),
    transaction_amount: readNullableNumber(record.transaction_amount),
    tickets_in_transaction: readNullableInteger(record.tickets_in_transaction),
    event_date: readNullableString(record.event_date),
    transaction_status: readNullableString(record.transaction_status),
    user_id: readNullableInteger(record.user_id),
    buyer_id: readNullableInteger(record.buyer_id),
    event_id: readNullableInteger(record.event_id),
    title: readNullableString(record.title),
    email: readNullableString(record.email),
    buyer_first_name: readNullableString(record.buyer_first_name),
    buyer_last_name: readNullableString(record.buyer_last_name),
    promo_code: readNullableString(record.promo_code),
    payment_type: readNullableString(record.payment_type),
    comments: readNullableString(record.comments),
    transaction_tax: readNullableNumber(record.transaction_tax),
    transaction_discount: readNullableNumber(record.transaction_discount),
    eventzilla_fee: readNullableNumber(record.eventzilla_fee),
    raw: record,
  };
}

function normalizeAttendeeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const questionsRaw = Array.isArray(record.questions) ? record.questions : [];
  return {
    id: requirePositiveInteger(record.id, "attendee id"),
    first_name: readNullableString(record.first_name),
    last_name: readNullableString(record.last_name),
    ticket_type: readNullableString(record.ticket_type),
    bar_code: readNullableString(record.bar_code),
    is_attended: readNullableString(record.is_attended),
    transaction_ref: readNullableString(record.transaction_ref),
    refno: readNullableString(record.refno),
    transaction_date: readNullableString(record.transaction_date),
    transaction_amount: readNullableNumber(record.transaction_amount),
    event_date: readNullableString(record.event_date),
    transaction_status: readNullableString(record.transaction_status),
    user_id: readNullableInteger(record.user_id),
    event_id: readNullableInteger(record.event_id),
    title: readNullableString(record.title),
    email: readNullableString(record.email),
    buyer_first_name: readNullableString(record.buyer_first_name),
    buyer_last_name: readNullableString(record.buyer_last_name),
    payment_type: readNullableString(record.payment_type),
    promo_code: readNullableString(record.promo_code),
    questions: questionsRaw.map((question) => normalizeAttendeeQuestion(requireResponseObject(question, "question"))),
    raw: record,
  };
}

function normalizeAttendeeQuestion(record: Record<string, unknown>): Record<string, unknown> {
  return {
    questions: readNullableString(record.questions),
    answer: readNullableString(record.answer),
    questionid: readNullableString(record.questionid),
    raw: record,
  };
}

function normalizeUserRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requirePositiveInteger(record.id, "user id"),
    username: readNullableString(record.username),
    first_name: readNullableString(record.first_name),
    last_name: readNullableString(record.last_name),
    company: readNullableString(record.company),
    address_line1: readNullableString(record.address_line1),
    address_line2: readNullableString(record.address_line2),
    address_locality: readNullableString(record.address_locality),
    address_region: readNullableString(record.address_region),
    address_country: readNullableString(record.address_country),
    zip_code: readNullableString(record.zip_code),
    email: readNullableString(record.email),
    timezone: readNullableString(record.timezone),
    website: readNullableString(record.website),
    phone_primary: readNullableString(record.phone_primary),
    avatar_url: readNullableString(record.avatar_url),
    facebook_id: readNullableString(record.facebook_id),
    twitter_id: readNullableString(record.twitter_id),
    last_seen: readNullableString(record.last_seen),
    user_type: readNullableString(record.user_type),
    raw: record,
  };
}

function buildDisplayName(firstName: unknown, lastName: unknown): string | undefined {
  const parts = [optionalString(firstName), optionalString(lastName)].filter((value): value is string =>
    Boolean(value),
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Eventzilla response is missing ${fieldName}`, value);
  }
  return record;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const result = optionalInteger(value);
  if (result === undefined || result <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return result;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requirePositiveInteger(value, fieldName);
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = optionalInteger(value);
  if (result === undefined || result < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return result;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const result = readOptionalTrimmedString(value);
  if (!result) {
    throw new ProviderRequestError(502, `${fieldName} is missing from the response`, value);
  }
  return result;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  const trimmed = readOptionalTrimmedString(value);
  if (trimmed !== undefined) {
    return trimmed;
  }
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function readNullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function readNullableNumber(value: unknown): number | null {
  const number = optionalNumber(value);
  if (number !== undefined) {
    return number;
  }
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "no") {
      return false;
    }
  }
  return null;
}
