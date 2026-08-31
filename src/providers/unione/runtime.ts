import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const unioneApiBaseUrl = "https://api.unione.io/en/transactional/api/v1";

const unioneValidationPath = "/system/info.json";

type UnionePhase = "validate" | "execute";
type UnioneJsonObject = Record<string, unknown>;
type UnioneActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ValidateUnioneCredentialInput {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface UnioneRequestOptions {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: UnionePhase;
  body?: Record<string, unknown>;
}

export const unioneActionHandlers: ProviderActionHandlers<"unione", UnioneActionHandler> = {
  get_account_info(_input, context) {
    return requestUnioneJson({
      context,
      path: unioneValidationPath,
      phase: "execute",
    });
  },
  send_email(input, context) {
    return requestUnioneJson({
      context,
      path: "/email/send.json",
      body: {
        message: compactObject(input),
      },
      phase: "execute",
    });
  },
  list_templates(input, context) {
    return requestUnioneJson({
      context,
      path: "/template/list.json",
      body: compactObject({
        limit: input.limit,
        offset: input.offset,
      }),
      phase: "execute",
    });
  },
  list_tags(_input, context) {
    return requestUnioneJson({
      context,
      path: "/tag/list.json",
      phase: "execute",
    });
  },
  list_suppressions(input, context) {
    return requestUnioneJson({
      context,
      path: "/suppression/list.json",
      body: compactObject({
        cause: input.cause,
        source: input.source,
        start_time: input.start_time,
        cursor: input.cursor,
        limit: input.limit,
      }),
      phase: "execute",
    });
  },
};

export async function validateUnioneCredential(
  input: ValidateUnioneCredentialInput,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestUnioneJson({
    context: {
      apiKey,
      fetcher: input.fetcher,
      signal: input.signal,
    },
    path: unioneValidationPath,
    phase: "validate",
  });
  const userId = optionalInteger(payload.user_id);
  const email = optionalString(payload.email);
  const projectId = optionalString(payload.project_id);
  const projectName = optionalString(payload.project_name);

  return {
    profile: {
      accountId: projectId ? `unione:project:${projectId}` : userId !== undefined ? `unione:user:${userId}` : "unione",
      displayName: projectName ?? email ?? "UniOne API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: unioneValidationPath,
      userId,
      email,
      projectId,
      projectName,
    },
  };
}

async function requestUnioneJson(options: UnioneRequestOptions): Promise<UnioneJsonObject> {
  const url = new URL(options.path, unioneApiBaseUrl);
  const timeout = createProviderTimeout(options.context.signal);
  let response: Response;
  try {
    response = await options.context.fetcher(url, {
      method: "POST",
      headers: unioneHeaders(options.context.apiKey),
      body: JSON.stringify(options.body ?? {}),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "UniOne request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `UniOne request failed for POST ${url}: ${error.message}`
        : `UniOne request failed for POST ${url}`,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await parseUnioneJson(response);
  if (!response.ok || payload.status === "error") {
    throw toUnioneError(response, payload, options.phase);
  }

  return payload;
}

function unioneHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "X-API-KEY": apiKey,
  };
}

async function parseUnioneJson(response: Response): Promise<UnioneJsonObject> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "UniOne returned an empty response body");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "UniOne returned invalid JSON");
  }

  const parsedPayload = optionalRecord(payload);
  if (!parsedPayload) {
    throw new ProviderRequestError(502, "UniOne returned a non-object JSON payload");
  }

  return parsedPayload;
}

function toUnioneError(response: Response, payload: UnioneJsonObject, phase: UnionePhase): ProviderRequestError {
  const message = optionalString(payload.message) ?? `UniOne request failed with ${response.status}`;
  const code = optionalInteger(payload.code);
  const details = {
    providerStatus: response.status,
    providerCode: code,
    payload,
  };

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : 403, message, details);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, details);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, details);
  }

  if (response.status === 404) {
    return new ProviderRequestError(502, message, details);
  }

  return new ProviderRequestError(502, message, details);
}
