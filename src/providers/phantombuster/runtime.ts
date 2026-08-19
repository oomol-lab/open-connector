import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const phantombusterApiBaseUrl = "https://api.phantombuster.com/api/v2";
const apiKeyHeader = "X-Phantombuster-Key";

type Context = ApiKeyProviderContext;

export const phantombusterActionHandlers: ProviderActionHandlers<
  "phantombuster",
  (input: Record<string, unknown>, context: Context) => Promise<unknown>
> = {
  async get_current_organization(_input, context) {
    return { organization: await requestJson("GET", "/orgs/fetch", context) };
  },
  async list_agents(_input, context) {
    return { agents: await requestJson("GET", "/agents/fetch-all", context) };
  },
  async get_agent(input, context) {
    return {
      agent: await requestJson("GET", queryPath("/agents/fetch", { id: requiredString(input.id, "id") }), context),
    };
  },
  async launch_agent(input, context) {
    return { launch: await requestJson("POST", "/agents/launch", context, launchBody(input)) };
  },
  async stop_agent(input, context) {
    return {
      stop: await requestJson(
        "POST",
        "/agents/stop",
        context,
        compactObject({
          id: requiredString(input.id, "id"),
          softAbort: optionalBoolean(input.softAbort),
          cascadeToAllSlaves: optionalBoolean(input.cascadeToAllSlaves),
          dontLaunchSoon: optionalBoolean(input.dontLaunchSoon),
          switchToManualLaunch: optionalBoolean(input.switchToManualLaunch),
        }),
      ),
    };
  },
  async list_containers(input, context) {
    const payload = await requestJson(
      "GET",
      queryPath("/containers/fetch-all", { agentId: requiredString(input.agentId, "agentId") }),
      context,
    );
    if (Array.isArray(payload)) return { containers: payload };
    const object = optionalRecord(payload);
    if (object && Array.isArray(object.containers)) {
      return {
        containers: object.containers,
        ...(typeof object.maxLimitReached === "boolean" ? { maxLimitReached: object.maxLimitReached } : {}),
      };
    }
    throw new ProviderRequestError(502, "invalid phantombuster list_containers response", payload);
  },
  async get_container(input, context) {
    return {
      container: await requestJson(
        "GET",
        queryPath("/containers/fetch", { id: requiredString(input.id, "id") }),
        context,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("phantombuster", phantombusterActionHandlers);

export async function validatePhantombusterCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const organization = optionalRecord(await requestJson("GET", "/orgs/fetch", { apiKey, fetcher })) ?? {};
  const name = optionalString(organization.name);
  const id = optionalString(organization.id);
  return {
    profile: {
      accountId: id ?? "phantombuster_api_key",
      displayName: name ?? "PhantomBuster API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: phantombusterApiBaseUrl,
      validationEndpoint: "/orgs/fetch",
      organizationId: id,
      organizationName: name,
    }),
  };
}

async function requestJson(
  method: "GET" | "POST",
  path: string,
  context: Pick<Context, "apiKey" | "fetcher" | "signal">,
  body?: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, phantombusterApiBaseUrl), {
      method,
      headers: compactObject({
        [apiKeyHeader]: context.apiKey,
        accept: "application/json",
        "user-agent": providerUserAgent,
        "content-type": body ? "application/json" : undefined,
      }) as Record<string, string>,
      body: body ? JSON.stringify(body) : undefined,
      signal: context.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `phantombuster request failed: ${error.message}` : "phantombuster request failed",
    );
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      extractMessage(payload) ?? `phantombuster request failed with ${response.status}`,
      payload,
    );
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function queryPath(path: string, query: Record<string, string>): string {
  const url = new URL(path, phantombusterApiBaseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function launchBody(input: Record<string, unknown>): Record<string, unknown> {
  const argument = input.argument ?? input.arguments;
  const saveArgument = input.saveArgument ?? input.saveArguments;
  return compactObject({
    id: requiredString(input.id, "id"),
    argument,
    bonusArgument: input.bonusArgument,
    saveArgument: typeof saveArgument === "boolean" ? saveArgument : undefined,
    manualLaunch: optionalBoolean(input.manualLaunch),
    maxInstanceCount: input.maxInstanceCount,
    internalMetadata: optionalRecord(input.internalMetadata),
    userCustomMetadata: optionalRecord(input.userCustomMetadata),
    persistedVolumeKey: input.persistedVolumeKey === null ? null : optionalString(input.persistedVolumeKey),
  });
}

function extractMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const object = optionalRecord(payload);
  return object ? (optionalString(object.error) ?? optionalString(object.message)) : undefined;
}
