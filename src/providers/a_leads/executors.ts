import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "a_leads";
const aLeadsApiBaseUrl = "https://api.a-leads.co/gateway/v1";
const aLeadsSearchBaseUrl = `${aLeadsApiBaseUrl}/search`;

interface ALeadsActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ALeadsActionHandler = (input: Record<string, unknown>, context: ALeadsActionContext) => Promise<unknown>;

export const aLeadsActionHandlers: ProviderActionHandlers<"a_leads", ALeadsActionHandler> = {
  async find_email(input, context): Promise<unknown> {
    const payload = await aLeadsRequest(context, "/find-email", buildDataBody(input));
    return {
      message: readMessage(payload),
      response: optionalRecord(optionalRecord(payload.data)?.response) ?? {},
      raw: payload,
    };
  },
  async find_personal_email(input, context): Promise<unknown> {
    const payload = await aLeadsRequest(context, "/find-email/personal", buildDataBody(input));
    return {
      message: readMessage(payload),
      personal_email: optionalString(optionalRecord(payload.data)?.personal_email) ?? null,
      raw: payload,
    };
  },
  async find_phone(input, context): Promise<unknown> {
    const payload = await aLeadsRequest(context, "/find-phone", buildDataBody(input));
    return {
      message: readMessage(payload),
      phone_number: optionalString(optionalRecord(optionalRecord(payload.data)?.response)?.phone_number) ?? null,
      raw: payload,
    };
  },
  async verify_email(input, context): Promise<unknown> {
    const payload = await aLeadsRequest(context, "/verify-email", buildDataBody(input));
    return {
      message: readMessage(payload),
      response: optionalRecord(optionalRecord(payload.data)?.response) ?? {},
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ALeadsActionContext>({
  service,
  handlers: aLeadsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ALeadsActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await aLeadsRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "/verify-email",
      {
        data: {
          email: "validation@example.com",
        },
      },
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "A-Leads API Key",
      },
      metadata: {
        apiBaseUrl: aLeadsApiBaseUrl,
        validationEndpoint: "/search/verify-email",
      },
    };
  },
};

function buildDataBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    data: compactObject(trimStringValues(input)),
  };
}

function trimStringValues(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = typeof value === "string" ? value.trim() : value;
  }
  return output;
}

async function aLeadsRequest(
  context: ALeadsActionContext,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await context.fetcher(`${aLeadsSearchBaseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": context.apiKey,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });

  const payload = await readJsonObject(response);
  if (!response.ok) {
    throw mapALeadsError(response, payload);
  }

  return payload;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "A-Leads returned invalid JSON");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "A-Leads returned a non-object response");
  }

  return payload as Record<string, unknown>;
}

function readMessage(payload: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(payload.message) ?? {};
}

function mapALeadsError(response: Response, payload: Record<string, unknown>): ProviderRequestError {
  const messageObject = optionalRecord(payload.message);
  const message =
    optionalString(messageObject?.description) ??
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    `A-Leads request failed with HTTP ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}
