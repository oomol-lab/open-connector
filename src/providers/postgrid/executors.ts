import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "postgrid";
const postgridApiBaseUrl = "https://api.postgrid.com/print-mail/v1";

type PostgridPhase = "validate" | "execute";
type PostgridActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const postgridActionHandlers: ProviderActionHandlers<"postgrid", PostgridActionHandler> = {
  create_contact(input, context) {
    return requestPostgridJson({
      path: "/contacts",
      method: "POST",
      body: compactObject({
        addressLine1: requiredInputString(input.addressLine1, "addressLine1"),
        addressLine2: optionalString(input.addressLine2),
        city: optionalString(input.city),
        provinceOrState: optionalString(input.provinceOrState),
        postalOrZip: optionalString(input.postalOrZip),
        countryCode: readCountryCode(input.countryCode),
        companyName: optionalString(input.companyName),
        firstName: optionalString(input.firstName),
        lastName: optionalString(input.lastName),
        email: optionalString(input.email),
        phoneNumber: optionalString(input.phoneNumber),
        jobTitle: optionalString(input.jobTitle),
        description: optionalString(input.description),
        metadata: optionalRecord(input.metadata),
        skipVerification: optionalBoolean(input.skipVerification),
        forceVerifiedStatus: optionalBoolean(input.forceVerifiedStatus),
      }),
      context,
      phase: "execute",
    });
  },
  list_contacts(input, context) {
    return requestPostgridJson({
      path: "/contacts",
      method: "GET",
      params: buildListParams(input),
      context,
      phase: "execute",
    });
  },
  get_contact(input, context) {
    return requestPostgridJson({
      path: `/contacts/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "GET",
      context,
      phase: "execute",
    });
  },
  delete_contact(input, context) {
    return requestPostgridJson({
      path: `/contacts/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "DELETE",
      context,
      phase: "execute",
    });
  },
  create_template(input, context) {
    return requestPostgridJson({
      path: "/templates",
      method: "POST",
      body: compactObject({
        html: optionalString(input.html),
        description: optionalString(input.description),
        metadata: optionalRecord(input.metadata),
      }),
      context,
      phase: "execute",
    });
  },
  list_templates(input, context) {
    return requestPostgridJson({
      path: "/templates",
      method: "GET",
      params: buildListParams(input),
      context,
      phase: "execute",
    });
  },
  get_template(input, context) {
    return requestPostgridJson({
      path: `/templates/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "GET",
      context,
      phase: "execute",
    });
  },
  update_template(input, context) {
    return requestPostgridJson({
      path: `/templates/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "POST",
      body: compactObject({
        html: optionalString(input.html),
        description: optionalString(input.description),
        metadata: optionalRecord(input.metadata),
      }),
      context,
      phase: "execute",
    });
  },
  delete_template(input, context) {
    return requestPostgridJson({
      path: `/templates/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "DELETE",
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, postgridActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await requestPostgridJson({
      path: "/templates",
      method: "GET",
      params: {
        limit: "1",
      },
      context,
      phase: "validate",
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "PostGrid API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: postgridApiBaseUrl,
        validationEndpoint: "/templates",
        totalCount: optionalNumber(payload.totalCount),
      }),
    };
  },
};

async function requestPostgridJson(input: {
  path: string;
  method: "GET" | "POST" | "DELETE";
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  context: ApiKeyProviderContext;
  phase: PostgridPhase;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.context.signal, label: "PostGrid" }, async (signal) => {
    const response = await input.context.fetcher(buildPostgridUrl(input.path, input.params ?? {}), {
      method: input.method,
      headers: postgridHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readPostgridPayload(response);

    if (!response.ok) {
      throw createPostgridError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "PostGrid returned an invalid payload", payload);
    }
    return payloadRecord;
  });
}

function buildPostgridUrl(path: string, params: Record<string, string | undefined>): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${postgridApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function postgridHeaders(apiKey: string, includeBodyHeaders: boolean): Record<string, string> {
  return {
    accept: "application/json",
    ...(includeBodyHeaders ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function readPostgridPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "PostGrid returned invalid JSON");
  }
}

function createPostgridError(status: number, payload: unknown, phase: PostgridPhase): ProviderRequestError {
  const message = extractPostgridErrorMessage(payload) ?? `PostGrid request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractPostgridErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const nestedError = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(nestedError?.message) ??
    optionalString(nestedError?.type) ??
    optionalString(record.object)
  );
}

function buildListParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    skip: readOptionalNumberString(input.skip),
    limit: readOptionalNumberString(input.limit),
    search: optionalString(input.search),
  });
}

function readCountryCode(value: unknown): string {
  return requiredInputString(value, "countryCode").toUpperCase();
}

function readOptionalNumberString(value: unknown): string | undefined {
  const parsed = optionalNumber(value);
  return parsed === undefined ? undefined : String(parsed);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.postgrid.com/print-mail/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
