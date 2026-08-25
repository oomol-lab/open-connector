import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "polar";
const polarApiBaseUrl = "https://api.polar.sh/v1";
const polarValidationPath = "/organizations/";

type PolarRequestPhase = "validate" | "execute";
type PolarActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const polarActionHandlers: ProviderActionHandlers<"polar", PolarActionHandler> = {
  list_organizations(input, context) {
    return polarGetJson(buildListPath("/organizations/", input), context, "execute");
  },
  get_organization(input, context) {
    return polarGetJson(buildResourcePath("/organizations", readRequiredString(input, "id")), context, "execute").then(
      wrapPayload,
    );
  },
  list_products(input, context) {
    return polarGetJson(buildListPath("/products/", input), context, "execute");
  },
  get_product(input, context) {
    return polarGetJson(buildResourcePath("/products", readRequiredString(input, "id")), context, "execute").then(
      wrapPayload,
    );
  },
  list_customers(input, context) {
    return polarGetJson(buildListPath("/customers/", input), context, "execute");
  },
  get_customer(input, context) {
    return polarGetJson(buildResourcePath("/customers", readRequiredString(input, "id")), context, "execute").then(
      wrapPayload,
    );
  },
  get_customer_by_external_id(input, context) {
    return polarGetJson(
      buildResourcePath("/customers/external", readRequiredString(input, "external_id")),
      context,
      "execute",
    ).then(wrapPayload);
  },
  get_customer_state(input, context) {
    return polarGetJson(
      `${buildResourcePath("/customers", readRequiredString(input, "id"))}/state`,
      context,
      "execute",
    ).then(wrapPayload);
  },
  get_customer_state_by_external_id(input, context) {
    return polarGetJson(
      `${buildResourcePath("/customers/external", readRequiredString(input, "external_id"))}/state`,
      context,
      "execute",
    ).then(wrapPayload);
  },
  list_orders(input, context) {
    return polarGetJson(buildListPath("/orders/", input), context, "execute");
  },
  get_order(input, context) {
    return polarGetJson(buildResourcePath("/orders", readRequiredString(input, "id")), context, "execute").then(
      wrapPayload,
    );
  },
  list_subscriptions(input, context) {
    return polarGetJson(buildListPath("/subscriptions/", input), context, "execute");
  },
  get_subscription(input, context) {
    return polarGetJson(buildResourcePath("/subscriptions", readRequiredString(input, "id")), context, "execute").then(
      wrapPayload,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, polarActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: polarApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await polarGetJson(
      `${polarValidationPath}?limit=1`,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const firstOrganization = readFirstListItem(payload);

    return {
      profile: {
        accountId: optionalString(firstOrganization?.id) ?? "polar-organization-access-token",
        displayName: buildAccountLabel(firstOrganization),
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: polarApiBaseUrl,
        validationEndpoint: polarValidationPath,
        organizationId: optionalString(firstOrganization?.id),
        organizationName: optionalString(firstOrganization?.name),
        organizationSlug: optionalString(firstOrganization?.slug),
      }),
    };
  },
};

async function polarGetJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: PolarRequestPhase,
): Promise<unknown> {
  let response: Response, payload: unknown;
  try {
    response = await context.fetcher(new URL(`${polarApiBaseUrl}${path}`), {
      method: "GET",
      headers: polarHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readPolarPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `polar request failed: ${error.message}` : "polar request failed",
    );
  }

  if (!response.ok) {
    throw createPolarError(response, payload, phase);
  }

  return payload;
}

function polarHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readPolarPayload(response: Response): Promise<unknown> {
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

function createPolarError(response: Response, payload: unknown, phase: PolarRequestPhase): ProviderRequestError {
  const message = extractPolarErrorMessage(payload) ?? response.statusText ?? "polar request failed";

  if (response.status == 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase == "validate" && (response.status == 401 || response.status == 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase == "execute" && (response.status == 401 || response.status == 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase == "execute" && (response.status == 400 || response.status == 404 || response.status == 422)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractPolarErrorMessage(payload: unknown): string | undefined {
  if (typeof payload == "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const detail = record.detail;
  if (typeof detail == "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const firstDetail = optionalRecord(detail[0]);
    const message = optionalString(firstDetail?.msg);
    if (message) {
      return message;
    }
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.title);
}

function buildListPath(path: string, input: Record<string, unknown>): string {
  const url = new URL(`${polarApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(input)) {
    if (key == "metadata") {
      appendMetadataQuery(url, value);
      continue;
    }
    appendQueryValue(url, key, value);
  }
  return `${url.pathname.slice("/v1".length)}${url.search}`;
}

function buildResourcePath(prefix: string, id: string): string {
  return `${prefix}/${encodeURIComponent(id)}`;
}

function appendMetadataQuery(url: URL, value: unknown): void {
  const metadata = optionalRecord(value);
  if (!metadata) {
    return;
  }

  for (const [key, child] of Object.entries(metadata)) {
    appendQueryValue(url, `metadata[${key}]`, child);
  }
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      appendQueryValue(url, key, child);
    }
    return;
  }

  if (typeof value == "boolean") {
    url.searchParams.append(key, value ? "true" : "false");
    return;
  }

  if (typeof value == "number") {
    url.searchParams.append(key, String(value));
    return;
  }

  const stringValue = optionalString(value);
  if (stringValue != null) {
    url.searchParams.append(key, stringValue);
  }
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function wrapPayload(payload: unknown): { payload: Record<string, unknown> } {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "polar response must be an object", payload);
  }
  return { payload: record };
}

function readFirstListItem(payload: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.items)) {
    return undefined;
  }
  return optionalRecord(record.items[0]);
}

function buildAccountLabel(firstOrganization: Record<string, unknown> | undefined): string {
  return (
    optionalString(firstOrganization?.name) ??
    optionalString(firstOrganization?.slug) ??
    "Polar Organization Access Token"
  );
}
