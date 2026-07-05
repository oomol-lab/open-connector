import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FlyActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment, jsonObject } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const flyApiBaseUrl = "https://api.machines.dev/v1/";
const flyValidationPath = "tokens/current";

type FlyRequestPhase = "validate" | "execute";
type FlyQueryValue = string | number | boolean | undefined;

export const flyActionHandlers: Record<FlyActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_apps(input, context) {
    return requestFlyJson({
      ...requestContext(context),
      method: "GET",
      path: "apps",
      query: [
        ["org_slug", requiredActionString(input.org_slug, "org_slug")],
        ["app_role", optionalString(input.app_role)],
      ],
    });
  },
  get_app(input, context) {
    return requestFlyJson({
      ...requestContext(context),
      method: "GET",
      path: `apps/${encodePathSegment(requiredActionString(input.app_name, "app_name"))}`,
    });
  },
  list_machines(input, context) {
    return requestFlyJson({
      ...requestContext(context),
      method: "GET",
      path: `apps/${encodePathSegment(requiredActionString(input.app_name, "app_name"))}/machines`,
      query: [
        ["include_deleted", input.include_deleted === true ? true : undefined],
        ["region", optionalString(input.region)],
        ["state", optionalString(input.state)],
        ["summary", input.summary === true ? true : undefined],
      ],
    });
  },
  create_machine(input, context) {
    const appName = requiredActionString(input.app_name, "app_name");
    return requestFlyJson({
      ...requestContext(context),
      body: jsonObject({
        config: input.config,
        lease_ttl: input.lease_ttl,
        lsvd: input.lsvd,
        min_secrets_version: input.min_secrets_version,
        name: optionalString(input.name),
        region: optionalString(input.region),
        skip_launch: input.skip_launch,
        skip_secrets: input.skip_secrets,
        skip_service_registration: input.skip_service_registration,
      }),
      method: "POST",
      path: `apps/${encodePathSegment(appName)}/machines`,
    });
  },
  get_machine(input, context) {
    return requestFlyJson({
      ...requestContext(context),
      method: "GET",
      path: buildMachinePath(input),
    });
  },
  async start_machine(input, context) {
    await requestFlyJson({
      ...requestContext(context),
      expectJson: false,
      method: "POST",
      path: `${buildMachinePath(input)}/start`,
    });
    return { ok: true };
  },
  async stop_machine(input, context) {
    await requestFlyJson({
      ...requestContext(context),
      body: buildOptionalBody({
        signal: optionalString(input.signal),
        timeout: optionalString(input.timeout),
      }),
      expectJson: false,
      method: "POST",
      path: `${buildMachinePath(input)}/stop`,
    });
    return { ok: true };
  },
  async restart_machine(input, context) {
    await requestFlyJson({
      ...requestContext(context),
      expectJson: false,
      method: "POST",
      path: `${buildMachinePath(input)}/restart`,
      query: [
        ["signal", optionalString(input.signal)],
        ["timeout", optionalString(input.timeout)],
      ],
    });
    return { ok: true };
  },
  wait_for_machine(input, context) {
    return requestFlyJson({
      ...requestContext(context),
      method: "GET",
      path: `${buildMachinePath(input)}/wait`,
      query: [
        ["from_event_id", optionalString(input.from_event_id)],
        ["state", optionalString(input.state)],
        ["timeout", typeof input.timeout === "number" ? input.timeout : undefined],
        ["version", optionalString(input.version)],
      ],
    });
  },
};

export async function validateFlyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestFlyJson({
    apiKey,
    fetcher,
    signal,
    method: "GET",
    path: flyValidationPath,
    phase: "validate",
  });
  const tokenInfo = readFirstTokenInfo(payload);
  const accountLabel = buildAccountLabel(tokenInfo);

  return {
    profile: {
      accountId: optionalString(tokenInfo?.token_id) ?? optionalString(tokenInfo?.user) ?? "fly:api-token",
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: flyApiBaseUrl,
      validationEndpoint: `/${flyValidationPath}`,
      tokenId: optionalString(tokenInfo?.token_id),
      user: optionalString(tokenInfo?.user),
      orgSlug: optionalString(tokenInfo?.org_slug),
      organization: optionalString(tokenInfo?.organization),
      restrictedToMachine: optionalString(tokenInfo?.restricted_to_machine),
      sourceMachineId: optionalString(tokenInfo?.source_machine_id),
      apps: Array.isArray(tokenInfo?.apps) ? tokenInfo.apps : undefined,
    }),
  };
}

function requestContext(context: ApiKeyProviderContext): Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  return {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
  };
}

async function requestFlyJson(input: {
  apiKey: string;
  body?: Record<string, unknown>;
  expectJson?: boolean;
  fetcher: typeof fetch;
  method: string;
  path: string;
  phase?: FlyRequestPhase;
  query?: Array<[string, FlyQueryValue]>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = buildFlyUrl(input.path, input.query ?? []);
  const headers = buildFlyHeaders(input.apiKey, input.body !== undefined);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: input.signal,
    });
    payload = await readFlyPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? error.message : "Fly.io request failed",
      error,
    );
  }

  if (!response.ok) {
    throw mapFlyError(response.status, payload, input.phase ?? "execute");
  }

  if (input.expectJson === false) {
    return payload;
  }

  if (payload === undefined) {
    throw new ProviderRequestError(502, "Fly.io returned an empty response");
  }

  return payload;
}

function buildFlyUrl(path: string, query: Array<[string, FlyQueryValue]>): URL {
  const url = new URL(path, flyApiBaseUrl);
  for (const [key, value] of query) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildFlyHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    ...(hasJsonBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readFlyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json") || looksLikeJson(text)) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function mapFlyError(status: number, payload: unknown, phase: FlyRequestPhase): ProviderRequestError {
  const message = extractFlyErrorMessage(payload, status);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractFlyErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "details"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return `Fly.io request failed with status ${status}`;
}

function buildMachinePath(input: Record<string, unknown>): string {
  return `apps/${encodePathSegment(requiredActionString(input.app_name, "app_name"))}/machines/${encodePathSegment(
    requiredActionString(input.machine_id, "machine_id"),
  )}`;
}

function buildOptionalBody(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const body = jsonObject(input);
  return Object.keys(body).length === 0 ? undefined : body;
}

function readFirstTokenInfo(payload: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(payload);
  const tokens = record?.tokens;
  if (!Array.isArray(tokens)) {
    return undefined;
  }
  const [firstToken] = tokens;
  return optionalRecord(firstToken);
}

function buildAccountLabel(tokenInfo: Record<string, unknown> | undefined): string {
  const orgSlug = optionalString(tokenInfo?.org_slug);
  if (orgSlug) {
    return `Fly.io ${orgSlug}`;
  }
  const organization = optionalString(tokenInfo?.organization);
  if (organization) {
    return `Fly.io ${organization}`;
  }
  const user = optionalString(tokenInfo?.user);
  if (user) {
    return `Fly.io user ${user}`;
  }
  const apps = tokenInfo?.apps;
  if (Array.isArray(apps) && typeof apps[0] === "string" && apps[0]) {
    return `Fly.io app ${apps[0]}`;
  }
  return "Fly.io API Token";
}

function requiredActionString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
