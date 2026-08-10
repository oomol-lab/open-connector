import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "stormboard";
const stormboardApiBaseUrl = "https://api.stormboard.com";

type StormboardRequestMode = "validate" | "execute";
type StormboardActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const stormboardActionHandlers: Record<string, StormboardActionHandler> = {
  async get_profile(_input, context) {
    return { profile: await requestStormboardObject("/users/profile", context, "execute") };
  },
  async list_storms(input, context) {
    const payload = await requestStormboardObject(
      buildStormboardPath(
        "/storms/list",
        compactObject({
          team: input.team,
          folder: input.folder,
          needle: input.needle,
          status: input.status,
          start: input.start,
          order: input.order,
          results: input.results,
        }),
      ),
      context,
      "execute",
    );
    return {
      hasMore: Boolean(payload.hasmore),
      storms: objectArray(payload.storms, "Stormboard storms", providerError),
    };
  },
  async get_storm(input, context) {
    const payload = await requestStormboardObject(
      `/storms/${encodeURIComponent(requireStormId(input))}`,
      context,
      "execute",
    );
    return { storm: readRequiredObject(payload.storm, "storm") };
  },
  async get_storm_access(input, context) {
    const payload = await requestStormboardObject(
      `/storms/${encodeURIComponent(requireStormId(input))}/access`,
      context,
      "execute",
    );
    return {
      access: {
        administrator: Boolean(payload.administrator),
        type: readRequiredString(payload.type, "type"),
      },
    };
  },
  async list_storm_ideas(input, context) {
    const payload = await requestStormboardObject(
      buildStormboardPath(
        `/storms/${encodeURIComponent(requireStormId(input))}/ideas`,
        compactObject({ lastModifiedMin: input.lastModifiedMin }),
      ),
      context,
      "execute",
    );
    return { ideas: objectArray(payload.ideas, "Stormboard ideas", providerError) };
  },
  async list_storm_users(input, context) {
    const payload = await requestStormboardObject(
      `/storms/${encodeURIComponent(requireStormId(input))}/users`,
      context,
      "execute",
    );
    return { users: objectArray(payload.users, "Stormboard users", providerError) };
  },
  async list_storm_connectors(input, context) {
    const payload = await requestStormboardObject(
      `/storms/${encodeURIComponent(requireStormId(input))}/connectors`,
      context,
      "execute",
    );
    return { connectors: objectArray(payload.connectors, "Stormboard connectors", providerError) };
  },
  async list_storm_tags(input, context) {
    const payload = await requestStormboardObject(
      `/storms/${encodeURIComponent(requireStormId(input))}/tags`,
      context,
      "execute",
    );
    return { tags: objectArray(payload.tags, "Stormboard tags", providerError) };
  },
  async list_template_categories(_input, context) {
    const payload = await requestStormboardObject("/templates/categories", context, "execute");
    return { categories: objectArray(payload.categories, "Stormboard template categories", providerError) };
  },
  async list_templates(input, context) {
    const category = optionalString(input.category);
    const path = category ? `/templates/${encodeURIComponent(category)}` : "/templates";
    const payload = await requestStormboardObject(path, context, "execute");
    return { templates: readRequiredObject(payload.templates, "templates") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, stormboardActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestStormboardObject(
      "/users/profile",
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const profile = readRequiredObject(payload.profile, "profile");
    const userId = optionalInteger(profile.id);
    const firstName = optionalString(profile.firstname);
    const lastName = optionalString(profile.lastname);
    const username = optionalString(profile.username);
    const email = optionalString(profile.email);
    const team = optionalRecord(profile.team);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    return {
      profile: {
        accountId: userId ? `stormboard:${userId}` : undefined,
        displayName: fullName || email || username || "Stormboard API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: stormboardApiBaseUrl,
        validationEndpoint: "/users/profile",
        userId,
        username,
        email,
        teamId: team?.id == null ? undefined : String(team.id),
        teamName: optionalString(team?.name),
      }),
    };
  },
};

function requireStormId(input: Record<string, unknown>): string {
  const id = optionalInteger(input.stormId);
  if (!id) {
    throw new ProviderRequestError(400, "stormId must be a positive integer");
  }
  return String(id);
}

function buildStormboardPath(path: string, query: Record<string, unknown>): string {
  const url = new URL(`${stormboardApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function requestStormboardObject(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  mode: StormboardRequestMode,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(`${stormboardApiBaseUrl}${path}`, {
      method: "GET",
      headers: stormboardHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Stormboard request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  }
  const payload = await readStormboardPayload(response);
  if (!response.ok) {
    throw createStormboardError(response, payload, mode);
  }
  return readRequiredObject(payload, "response");
}

function stormboardHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "x-api-key": apiKey,
    "user-agent": providerUserAgent,
  };
}

async function readStormboardPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Stormboard returned invalid JSON");
  }
}

function createStormboardError(
  response: Response,
  payload: unknown,
  mode: StormboardRequestMode,
): ProviderRequestError {
  const message = readStormboardErrorMessage(payload) ?? `Stormboard request failed with HTTP ${response.status}`;
  const status = mode === "validate" && (response.status === 401 || response.status === 403) ? 400 : response.status;
  return new ProviderRequestError(status, message, payload);
}

function readStormboardErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  const message = optionalString(object?.message) ?? optionalString(object?.error);
  return message?.trim() || undefined;
}

function readRequiredObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Stormboard response is missing ${label}`, value);
  }
  return object;
}

function readRequiredString(value: unknown, label: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Stormboard response is missing ${label}`);
  }
  return text;
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.stormboard.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
