import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "ngrok";
const ngrokApiBaseUrl = "https://api.ngrok.com";
const ngrokApiVersion = "2";
const ngrokValidationPath = "/endpoints";

type NgrokRequestPhase = "validate" | "execute";
type NgrokActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const ngrokActionHandlers: ProviderActionHandlers<"ngrok", NgrokActionHandler> = {
  list_endpoints(input, context) {
    return requestNgrokJson({
      context,
      phase: "execute",
      path: "/endpoints",
      query: buildListQuery(input, true),
    });
  },
  get_endpoint(input, context) {
    return requestNgrokJson({
      context,
      phase: "execute",
      path: `/endpoints/${encodeURIComponent(requiredInputString(input.endpoint_id, "endpoint_id"))}`,
    });
  },
  list_tunnels(input, context) {
    return requestNgrokJson({
      context,
      phase: "execute",
      path: "/tunnels",
      query: buildListQuery(input, false),
    });
  },
  list_tunnel_sessions(input, context) {
    return requestNgrokJson({
      context,
      phase: "execute",
      path: "/tunnel_sessions",
      query: buildListQuery(input, true),
    });
  },
  list_reserved_domains(input, context) {
    return requestNgrokJson({
      context,
      phase: "execute",
      path: "/reserved_domains",
      query: buildListQuery(input, true),
    });
  },
  get_reserved_domain(input, context) {
    return requestNgrokJson({
      context,
      phase: "execute",
      path: `/reserved_domains/${encodeURIComponent(requiredInputString(input.reserved_domain_id, "reserved_domain_id"))}`,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ngrokActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestNgrokJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
      path: ngrokValidationPath,
      query: {
        limit: "1",
      },
    });
    const body = requireNgrokObject(payload, ngrokValidationPath);
    const endpoints = Array.isArray(body.endpoints) ? body.endpoints : [];
    const firstEndpoint = optionalRecord(endpoints[0]);
    const principal = optionalRecord(firstEndpoint?.principal);

    return {
      profile: {
        accountId: buildNgrokAccountId(input.apiKey),
        displayName: "ngrok API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: ngrokApiBaseUrl,
        validationEndpoint: ngrokValidationPath,
        firstEndpointId: optionalString(firstEndpoint?.id),
        firstEndpointPublicUrl: optionalString(firstEndpoint?.public_url),
        firstEndpointType: optionalString(firstEndpoint?.type),
        firstEndpointProto: optionalString(firstEndpoint?.proto),
        firstPrincipalId: optionalString(principal?.id),
        nextPageUri: optionalString(body.next_page_uri),
      }),
    };
  },
};

async function requestNgrokJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: NgrokRequestPhase;
  path: string;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const url = new URL(input.path, ngrokApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.context.apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
        "ngrok-version": ngrokApiVersion,
      },
      signal: timeout.signal,
    });
    const payload = await readNgrokPayload(response);

    if (!response.ok) {
      throw createNgrokError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `ngrok ${input.path} request timed out after 30 seconds`);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ngrok request failed: ${error.message}` : "ngrok request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readNgrokPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requireNgrokObject(payload: unknown, resource: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `ngrok ${resource} response was not a JSON object`, payload);
  }
  return record;
}

function createNgrokError(status: number, payload: unknown, phase: NgrokRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.msg) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `ngrok request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function buildListQuery(input: Record<string, unknown>, includeFilter: boolean): Record<string, string | undefined> {
  return compactObject({
    limit: typeof input.limit === "number" ? String(input.limit) : undefined,
    before_id: optionalString(input.before_id),
    filter: includeFilter ? optionalString(input.filter) : undefined,
  });
}

function buildNgrokAccountId(apiKey: string): string {
  return `ngrok:api_key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}
