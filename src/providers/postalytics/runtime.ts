import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const postalyticsApiBaseUrl = "https://api.postalytics.com/api/v1";

const postalyticsValidationPath = "/account/me";
const postalyticsRequestTimeoutMs = 30_000;

type PostalyticsRequestPhase = "validate" | "execute";

interface PostalyticsRequestInput {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: PostalyticsRequestPhase;
  query?: Record<string, number | undefined>;
}

export const postalyticsActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_campaigns(_input, context): Promise<unknown> {
    return requireArrayPayload(
      await requestPostalyticsJson({
        path: "/campaigns",
        context,
        phase: "execute",
      }),
      "campaign list",
    );
  },
  async get_campaign(input, context): Promise<unknown> {
    const campaignId = requirePositiveInteger(input.campaignId, "campaignId");
    return requireObjectPayload(
      await requestPostalyticsJson({
        path: `/campaigns/${campaignId}/details`,
        context,
        phase: "execute",
      }),
      "campaign details",
    );
  },
  async get_campaign_stats(input, context): Promise<unknown> {
    const dropId = requirePositiveInteger(input.dropId, "dropId");
    return requireArrayPayload(
      await requestPostalyticsJson({
        path: `/campaigns/${dropId}`,
        context,
        phase: "execute",
      }),
      "campaign statistics",
    );
  },
  async list_contact_lists(_input, context): Promise<unknown> {
    return requireArrayPayload(
      await requestPostalyticsJson({
        path: "/contacts",
        context,
        phase: "execute",
      }),
      "contact list",
    );
  },
  async list_contacts(input, context): Promise<unknown> {
    const contactListId = requirePositiveInteger(input.contactListId, "contactListId");
    return requireArrayPayload(
      await requestPostalyticsJson({
        path: `/contacts/${contactListId}`,
        context,
        phase: "execute",
        query: {
          limit: optionalInteger(input.limit),
          start: optionalInteger(input.start),
        },
      }),
      "contact page",
    );
  },
  async get_contact(input, context): Promise<unknown> {
    const contactId = requirePositiveInteger(input.contactId, "contactId");
    return requireObjectPayload(
      await requestPostalyticsJson({
        path: `/contacts/details/${contactId}`,
        context,
        phase: "execute",
      }),
      "contact details",
    );
  },
  async list_templates(_input, context): Promise<unknown> {
    return requireArrayPayload(
      await requestPostalyticsJson({
        path: "/templates",
        context,
        phase: "execute",
      }),
      "template list",
    );
  },
  async get_template(input, context): Promise<unknown> {
    const templateId = requirePositiveInteger(input.templateId, "templateId");
    return requireArrayPayload(
      await requestPostalyticsJson({
        path: `/templates/${templateId}`,
        context,
        phase: "execute",
      }),
      "template details",
    );
  },
};

export async function validatePostalyticsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestPostalyticsJson({
    path: postalyticsValidationPath,
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const accounts = requireArrayPayload(payload, "account");
  const account = optionalRecord(accounts[0]);
  if (!account) {
    throw new ProviderRequestError(502, "Postalytics returned an invalid account");
  }

  const accountId = optionalInteger(account.account_id);
  const company = optionalString(account.company);
  const emailAddress = optionalString(account.email_address);
  const username = optionalString(account.username);

  return {
    profile: {
      accountId:
        accountId === undefined
          ? `postalytics:api_key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`
          : `postalytics:account:${accountId}`,
      displayName: company ?? emailAddress ?? username ?? "Postalytics API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: postalyticsApiBaseUrl,
      validationEndpoint: postalyticsValidationPath,
      accountId,
      company,
      emailAddress,
      username,
    }),
  };
}

async function requestPostalyticsJson(input: PostalyticsRequestInput): Promise<unknown> {
  const url = new URL(`${postalyticsApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.context.signal, postalyticsRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: buildPostalyticsAuthorizationHeader(input.context.apiKey),
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Postalytics returned invalid JSON",
      invalidJsonFallback: (text) => text,
    });
    if (!response.ok) {
      throw mapPostalyticsError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Postalytics request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Postalytics request failed: ${error.message}` : "Postalytics request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildPostalyticsAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

function mapPostalyticsError(status: number, payload: unknown, phase: PostalyticsRequestPhase): ProviderRequestError {
  const message = extractPostalyticsErrorMessage(payload) ?? `Postalytics API request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 400 || status === 404 || status === 422 || status === 429) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractPostalyticsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const body = optionalRecord(payload);
  const error = optionalRecord(body?.error);
  return optionalString(error?.message) ?? optionalString(body?.message) ?? optionalString(body?.error);
}

function requireArrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `Postalytics returned an invalid ${label} payload`);
  }
  return payload;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `Postalytics returned an invalid ${label} payload`);
  }
  return object;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}
