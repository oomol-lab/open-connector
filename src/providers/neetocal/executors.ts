import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "neetocal";
const suffix = ".neetocal.com";
const apiPath = "/api/external/v2";
interface Context {
  apiKey: string;
  subdomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
function subdomain(value: unknown): string {
  const text = optionalString(value)?.toLowerCase();
  if (
    !text ||
    text.length > 63 ||
    text.startsWith("-") ||
    text.endsWith("-") ||
    [...text].some((char) => {
      const code = char.charCodeAt(0);
      return !((97 <= code && code <= 122) || (48 <= code && code <= 57) || char === "-");
    })
  )
    throw providerInputError("subdomain must be a single NeetoCal workspace subdomain");
  return text;
}
function baseUrl(value: unknown): string {
  return `https://${subdomain(value)}${suffix}${apiPath}`;
}
async function request(
  context: Context,
  path: string,
  query: Record<string, unknown> = {},
  append?: (url: URL) => void,
): Promise<unknown> {
  const url = new URL(`${baseUrl(context.subdomain)}${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  append?.(url);
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "x-api-key": context.apiKey, "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "NeetoCal returned invalid JSON");
    payload = text;
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    throw new ProviderRequestError(
      response.status,
      (typeof payload === "string" && payload) ||
        optionalString(record?.error) ||
        optionalString(record?.message) ||
        `NeetoCal API request failed with status ${response.status}`,
      payload,
    );
  }
  return payload;
}
function record(value: unknown, label: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `NeetoCal ${label} must be an object`, value);
  return result;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `NeetoCal ${field} must be an array`, value);
  return value;
}
const handlers = {
  async list_scheduling_links(input: Record<string, unknown>, context: Context) {
    const payload = record(
      await request(
        context,
        "/meetings",
        compactObject({
          page_number: optionalInteger(input.pageNumber),
          page_size: optionalInteger(input.pageSize),
          search: optionalString(input.search),
        }),
        (url) => {
          if (Array.isArray(input.hostEmails))
            for (const email of input.hostEmails) {
              const value = optionalString(email);
              if (value) url.searchParams.append("host_email[]", value);
            }
        },
      ),
      "scheduling-link list response",
    );
    return { meetings: array(payload.meetings, "meetings"), pagination: optionalRecord(payload.pagination) ?? null };
  },
  async get_scheduling_link(input: Record<string, unknown>, context: Context) {
    return record(
      await request(
        context,
        `/meetings/${encodeURIComponent(requiredString(input.schedulingLinkSid, "schedulingLinkSid", providerInputError))}`,
      ),
      "scheduling-link response",
    );
  },
  async list_bookings(input: Record<string, unknown>, context: Context) {
    const payload = record(
      await request(
        context,
        "/bookings",
        compactObject({
          type: optionalString(input.type),
          page_number: optionalInteger(input.pageNumber),
          page_size: optionalInteger(input.pageSize),
          host_email: optionalString(input.hostEmail),
          client_email: optionalString(input.clientEmail),
          parent_booking_id: optionalString(input.parentBookingId),
          sorting_order: optionalString(input.sortingOrder),
        }),
      ),
      "booking list response",
    );
    return { bookings: array(payload.bookings, "bookings"), pagination: optionalRecord(payload.pagination) ?? null };
  },
  async get_booking(input: Record<string, unknown>, context: Context) {
    return record(
      await request(
        context,
        `/bookings/${encodeURIComponent(requiredString(input.bookingSid, "bookingSid", providerInputError))}`,
      ),
      "booking response",
    );
  },
  async list_available_slots(input: Record<string, unknown>, context: Context) {
    const sid = requiredString(input.schedulingLinkSid, "schedulingLinkSid", providerInputError);
    const payload = record(
      await request(
        context,
        `/meetings/${encodeURIComponent(sid)}/slots`,
        compactObject({
          time_zone: requiredString(input.timeZone, "timeZone", providerInputError),
          year: optionalInteger(input.year),
          month: optionalInteger(input.month),
          day: optionalInteger(input.day),
        }),
      ),
      "slot response",
    );
    return { slots: array(payload.slots, "slots") };
  },
};
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      subdomain: subdomain(credential.metadata.subdomain ?? credential.values.subdomain),
      fetcher,
      signal: context.signal,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return baseUrl(credential.metadata.subdomain ?? credential.values.subdomain);
  },
  auth: { type: "api_key_header", name: "X-Api-Key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const workspace = subdomain(input.values.subdomain);
    await request({ apiKey: input.apiKey, subdomain: workspace, fetcher, signal }, "/meetings", {
      page_number: 1,
      page_size: 1,
    });
    return {
      profile: { accountId: `neetocal:${workspace}`, displayName: `${workspace}.neetocal.com` },
      grantedScopes: [],
      metadata: { subdomain: workspace, apiBaseUrl: baseUrl(workspace), validationEndpoint: "/meetings" },
    };
  },
};
