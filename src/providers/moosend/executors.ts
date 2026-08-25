import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "moosend";
const moosendApiBaseUrl = "https://api.moosend.com/v3";
const moosendValidationPath = "/lists.json";

type MoosendRequestPhase = "validate" | "execute";
type MoosendMethod = "GET" | "POST";
type MoosendActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MoosendRequestOptions {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: MoosendRequestPhase;
  method?: MoosendMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const moosendActionHandlers: ProviderActionHandlers<"moosend", MoosendActionHandler> = {
  list_mailing_lists(input, context) {
    return requestMoosendJson({
      context,
      path: "/lists.json",
      query: compactObject({
        WithStatistics: optionalBoolean(input.WithStatistics),
        SortBy: optionalString(input.SortBy),
        SortMethod: optionalString(input.SortMethod),
      }),
      phase: "execute",
    });
  },
  list_subscribers(input, context) {
    const mailingListId = requireString(input.MailingListID, "MailingListID");
    const status = requireString(input.Status, "Status");

    return requestMoosendJson({
      context,
      path: `/lists/${encodeURIComponent(mailingListId)}/subscribers/${encodeURIComponent(status)}.json`,
      query: compactObject({
        Page: optionalNumber(input.Page),
        PageSize: optionalNumber(input.PageSize),
      }),
      phase: "execute",
    });
  },
  get_subscriber_by_email(input, context) {
    const mailingListId = requireString(input.MailingListID, "MailingListID");

    return requestMoosendJson({
      context,
      path: `/subscribers/${encodeURIComponent(mailingListId)}/view.json`,
      query: {
        Email: requireString(input.Email, "Email"),
      },
      phase: "execute",
    });
  },
  add_subscriber(input, context) {
    const mailingListId = requireString(input.MailingListID, "MailingListID");

    return requestMoosendJson({
      context,
      path: `/subscribers/${encodeURIComponent(mailingListId)}/subscribe.json`,
      method: "POST",
      body: compactObject({
        Name: optionalString(input.Name),
        Email: requireString(input.Email, "Email"),
        HasExternalDoubleOptIn: optionalBoolean(input.HasExternalDoubleOptIn),
        CustomFields: optionalStringArray(input.CustomFields),
        Tags: optionalStringArray(input.Tags),
        Preferences: optionalStringArray(input.Preferences),
      }),
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, moosendActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestMoosendJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: moosendValidationPath,
      query: {
        WithStatistics: false,
        SortBy: "CreatedOn",
        SortMethod: "DESC",
      },
      phase: "validate",
    });

    const context = optionalRecord(payload);
    const responseContext = optionalRecord(context?.Context);
    const paging = optionalRecord(responseContext?.Paging);
    const mailingLists = Array.isArray(responseContext?.MailingLists) ? responseContext.MailingLists : [];
    const firstMailingList = optionalRecord(mailingLists[0]);

    return {
      profile: {
        accountId: "moosend",
        displayName: "Moosend API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: moosendApiBaseUrl,
        validationEndpoint: moosendValidationPath,
        mailingListCount: optionalNumber(paging?.TotalResults) ?? mailingLists.length,
        firstMailingListId: optionalString(firstMailingList?.ID),
        firstMailingListName: optionalString(firstMailingList?.Name),
      }),
    };
  },
};

async function requestMoosendJson(input: MoosendRequestOptions): Promise<Record<string, unknown>> {
  const url = new URL(`${moosendApiBaseUrl}${input.path}`);
  url.searchParams.set("apikey", input.context.apiKey);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  let rawBody = "";
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    rawBody = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Moosend request failed: ${error.message}` : "Moosend request failed",
    );
  }

  const payload = parseMoosendPayload(rawBody, response.status);
  const payloadError = readMoosendPayloadError(payload);
  if (payloadError) {
    throw mapMoosendError(payloadError, response.status, input.phase);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status < 500 ? 400 : 502,
      buildMoosendHttpErrorMessage(response.status, rawBody),
      payload,
    );
  }

  return payload;
}

function parseMoosendPayload(rawBody: string, status: number): Record<string, unknown> {
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      buildMoosendHttpErrorMessage(status, rawBody, error instanceof Error ? error.message : undefined),
    );
  }
}

function readMoosendPayloadError(payload: Record<string, unknown>): { code?: number; message: string } | null {
  const code = typeof payload.Code === "number" ? payload.Code : undefined;
  const error = optionalString(payload.Error);
  if ((code === undefined || code === 0) && !error) {
    return null;
  }

  return {
    code,
    message: error || `Moosend request failed with code ${code ?? "unknown"}`,
  };
}

function mapMoosendError(
  error: { code?: number; message: string },
  status: number,
  phase: MoosendRequestPhase,
): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, error.message);
  }

  const isAuthError = phase === "validate" || status === 401 || status === 403 || mentionsApiKey(error.message);
  if (isAuthError) {
    return new ProviderRequestError(status >= 400 && status < 500 ? status : 400, error.message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, error.message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : 500, error.message);
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function requireString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array is required");
  }
  return value.map((item) => requireString(item, "string array item"));
}

function mentionsApiKey(message: string): boolean {
  return message.toLowerCase().includes("api key") || message.toLowerCase().includes("apikey");
}

function buildMoosendHttpErrorMessage(status: number, rawBody: string, parseErrorMessage?: string): string {
  const parts = [`Moosend request failed with HTTP ${status}`];
  if (parseErrorMessage) {
    parts.push(`invalid JSON response: ${parseErrorMessage}`);
  }

  const snippet = rawBody.trim().slice(0, 200);
  if (snippet) {
    parts.push(`body: ${snippet}`);
  }

  return parts.join("; ");
}
