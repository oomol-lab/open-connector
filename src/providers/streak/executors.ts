import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { StreakActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "streak";
const streakApiBaseUrl = "https://api.streak.com/api/v1";

type StreakRequestPhase = "validate" | "execute";
type StreakActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const streakActionHandlers: Record<StreakActionName, StreakActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestStreakJson("/users/me", context, "execute");
    return {
      user: requireObject(payload, "Streak user response"),
      raw: payload,
    };
  },
  async list_pipelines(input, context) {
    const payload = await requestStreakJson("/pipelines", context, "execute", {
      sortBy: optionalString(input.sortBy),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Streak pipelines response must be an array");
    }

    return {
      pipelines: payload.map((item) => requireObject(item, "Streak pipeline response")),
      raw: payload,
    };
  },
  async get_pipeline(input, context) {
    const pipelineKey = requiredString(input.pipelineKey, "pipelineKey", invalidInputError);
    const payload = await requestStreakJson(`/pipelines/${encodeURIComponent(pipelineKey)}`, context, "execute");

    return {
      pipeline: requireObject(payload, "Streak pipeline response"),
      raw: payload,
    };
  },
  async get_box(input, context) {
    const boxKey = requiredString(input.boxKey, "boxKey", invalidInputError);
    const payload = await requestStreakJson(`/boxes/${encodeURIComponent(boxKey)}`, context, "execute");

    return {
      box: requireObject(payload, "Streak box response"),
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, streakActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: streakApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestStreakJson(
      "/users/me",
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const user = requireObject(payload, "Streak user response");
    const email = optionalString(user.email);
    const userKey = optionalString(user.userKey) ?? optionalString(user.key);

    return {
      profile: {
        accountId: userKey ?? email ?? "streak:api-key",
        displayName: optionalString(user.displayName) ?? email ?? "Streak API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: streakApiBaseUrl,
        email,
        userKey,
        isOauthComplete: optionalBoolean(user.isOauthComplete),
      }),
    };
  },
};

async function requestStreakJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: StreakRequestPhase,
  query: Record<string, string | undefined> = {},
): Promise<unknown> {
  const url = new URL(`${streakApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await context.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: buildStreakAuthorizationHeader(context.apiKey),
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const payload = await readJsonResponse(response);
  if (response.ok) {
    return payload;
  }

  throw mapStreakError(response.status, payload, phase);
}

function buildStreakAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapStreakError(status: number, payload: unknown, phase: StreakRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Streak request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.errorMessage);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return object;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
