import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

export const zigpollApiBaseUrl = "https://v1.zigpoll.com";

type ZigpollPhase = "validate" | "execute";
type ZigpollMethod = "GET" | "POST";
type ZigpollQueryValue = string | number | undefined;
type ZigpollActionContext = ApiKeyProviderContext;
type ZigpollActionHandler = (input: Record<string, unknown>, context: ZigpollActionContext) => Promise<unknown>;

interface ZigpollRequestInput {
  path: string;
  method?: ZigpollMethod;
  query?: Record<string, ZigpollQueryValue>;
  body?: Record<string, unknown>;
}

export const zigpollActionHandlers: ProviderActionHandlers<"zigpoll", ZigpollActionHandler> = {
  get_current_user(_input, context) {
    return requestZigpollJson({ path: "/me" }, context, "execute");
  },
  list_accounts(_input, context) {
    return requestZigpollJson({ path: "/accounts" }, context, "execute");
  },
  list_polls(input, context) {
    return requestZigpollJson(
      {
        path: "/polls",
        query: {
          accountId: requiredInputString(input.accountId, "accountId"),
        },
      },
      context,
      "execute",
    );
  },
  get_poll(input, context) {
    return requestZigpollJson(
      {
        path: "/poll",
        query: {
          pollId: requiredInputString(input.pollId, "pollId"),
        },
      },
      context,
      "execute",
    );
  },
  list_slides(input, context) {
    return requestZigpollJson(
      {
        path: "/slides",
        query: {
          pollId: requiredInputString(input.pollId, "pollId"),
        },
      },
      context,
      "execute",
    );
  },
  list_participants(input, context) {
    return requestZigpollJson(
      {
        path: "/participants",
        query: buildObjectFilterQuery(input, false),
      },
      context,
      "execute",
    );
  },
  list_responses(input, context) {
    return requestZigpollJson(
      {
        path: "/responses",
        query: buildObjectFilterQuery(input, true),
      },
      context,
      "execute",
    );
  },
  generate_survey_link(input, context) {
    return requestZigpollJson(
      {
        path: "/generate-survey-link",
        method: "POST",
        body: compactObject({
          pollId: requiredInputString(input.pollId, "pollId"),
          metadata: optionalRecord(input.metadata),
          expiresAt: optionalString(input.expiresAt),
        }),
      },
      context,
      "execute",
    );
  },
};

export async function validateZigpollCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    apiKey: requiredInputString(input.apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const payload = await requestZigpollJson({ path: "/me" }, context, "validate");
  const user = optionalRecord(payload) ?? {};
  const userId = optionalString(user._id);
  const email = optionalString(user.email);
  const name = optionalString(user.name);

  return {
    profile: {
      accountId: userId ?? email ?? "zigpoll",
      displayName: name ?? email ?? "Zigpoll API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: zigpollApiBaseUrl,
      validationEndpoint: "/me",
      userId,
      email,
    }),
  };
}

async function requestZigpollJson(
  input: ZigpollRequestInput,
  context: Pick<ZigpollActionContext, "apiKey" | "fetcher" | "signal">,
  phase: ZigpollPhase,
): Promise<unknown> {
  const url = buildZigpollUrl(input.path, input.query ?? {});
  const hasBody = input.body !== undefined;

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "user-agent": providerUserAgent,
        ...(hasBody ? { "content-type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(input.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw createZigpollTransportError(error);
  }

  const payload = await readZigpollPayload(response);
  if (!response.ok) {
    throw createZigpollError(response.status, payload, phase);
  }
  return payload;
}

function buildObjectFilterQuery(input: Record<string, unknown>, includeResponseDates: boolean) {
  const filter = readExactlyOneObjectFilter(input);
  return compactObject({
    [filter.key]: filter.value,
    startCursor: optionalString(input.startCursor),
    limit: optionalInteger(input.limit),
    createdAfter: includeResponseDates ? optionalString(input.createdAfter) : undefined,
    createdBefore: includeResponseDates ? optionalString(input.createdBefore) : undefined,
  });
}

function readExactlyOneObjectFilter(input: Record<string, unknown>): {
  key: "accountId" | "pollId" | "slideId";
  value: string;
} {
  const filters = [
    ["accountId", optionalString(input.accountId)],
    ["pollId", optionalString(input.pollId)],
    ["slideId", optionalString(input.slideId)],
  ] as const;
  const provided = filters.filter(
    (entry): entry is ["accountId" | "pollId" | "slideId", string] => entry[1] !== undefined,
  );
  if (provided.length !== 1) {
    throw new ProviderRequestError(400, "provide exactly one of accountId, pollId, or slideId");
  }

  return {
    key: provided[0][0],
    value: provided[0][1],
  };
}

function buildZigpollUrl(path: string, query: Record<string, ZigpollQueryValue>): URL {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, zigpollApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readZigpollPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zigpoll returned invalid JSON");
  }
}

function createZigpollError(status: number, payload: unknown, phase: ZigpollPhase): ProviderRequestError {
  const message = readZigpollErrorMessage(payload) ?? `Zigpoll request failed with status ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function createZigpollTransportError(error: unknown): ProviderRequestError {
  return new ProviderRequestError(
    error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") ? 504 : 502,
    error instanceof Error ? `Zigpoll request failed: ${error.message}` : "Zigpoll request failed",
  );
}

function readZigpollErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errors);
}
