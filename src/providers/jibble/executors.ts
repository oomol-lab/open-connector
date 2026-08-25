import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "jibble";
const baseUrl = "https://workspace.prod.jibble.io/v1";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: Record<string, Handler> = {
  async get_organizations(input, context) {
    return readCollection(await request("/Organizations", "GET", input, undefined, context));
  },
  async list_members(input, context) {
    return readCollection(await request("/People", "GET", input, undefined, context));
  },
  async list_locations(input, context) {
    return readCollection(await request("/Locations", "GET", input, undefined, context));
  },
  async create_location(input, context) {
    return {
      location: requireRecord(
        await request("/Locations", "POST", {}, compactObject(input), context),
        "Jibble location response",
      ),
    };
  },
  async update_location(input, context) {
    const id = requiredString(input.locationId, "locationId");
    const body = { ...input };
    delete body.locationId;
    await request(`/Locations(${encodeURIComponent(id)})`, "PATCH", {}, compactObject(body), context);
    return { ok: true };
  },
  async delete_location(input, context) {
    const id = requiredString(input.locationId, "locationId");
    await request(`/Locations(${encodeURIComponent(id)})`, "DELETE", {}, undefined, context);
    return { ok: true };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const organizations = readCollection(await request("/Organizations", "GET", {}, undefined, context, "validate"));
    const organization = optionalRecord(organizations.items[0]);
    return {
      profile: {
        accountId: `jibble:${optionalString(organization?.id) || "account"}`,
        displayName: optionalString(organization?.name) || "Jibble Personal Access Token",
      },
      metadata: compactObject({
        apiBaseUrl: baseUrl,
        organizationId: optionalString(organization?.id),
        validationEndpoint: "/Organizations",
      }),
    };
  },
};

async function request(
  path: string,
  method: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  const url = new URL(`${baseUrl}${path}`);
  const names: Record<string, string> = {
    select: "$select",
    expand: "$expand",
    filter: "$filter",
    count: "$count",
    skip: "$skip",
    top: "$top",
    orderBy: "$orderby",
  };
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && key !== "nextLink")
      url.searchParams.set(names[key] ?? key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const target = optionalString(query.nextLink) || url.toString();
  const response = await context.fetcher(target, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "Jibble returned invalid JSON");
    }
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ||
      optionalString(record?.error) ||
      `Jibble request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (phase === "validate") throw new ProviderRequestError(400, message);
    throw new ProviderRequestError(response.status, message);
  }
  return payload;
}
function readCollection(payload: unknown): { items: unknown[]; count: number | null; nextLink: string | null } {
  const record = requireRecord(payload, "Jibble collection response");
  if (!Array.isArray(record.value))
    throw new ProviderRequestError(502, "Jibble collection response has no value array");
  return {
    items: record.value,
    count: optionalInteger(record["@odata.count"]) ?? null,
    nextLink: optionalString(record["@odata.nextLink"]) ?? null,
  };
}
function requireRecord(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${context} is not an object`);
  return record;
}
