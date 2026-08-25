import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "feedier";
const feedierApiBaseUrl = "https://api.bx.feedier.com";

type RequestPhase = "validate" | "execute";
type BodyEncoding = "form" | "json";
type FeedierHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface FeedierRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: RequestPhase;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  bodyEncoding?: BodyEncoding;
}

export const feedierActionHandlers: Record<string, FeedierHandler> = {
  async list_reports(input, context) {
    const payload = await requestFeedierJson({
      ...requestContext(context),
      path: "/v3/reports",
      query: {
        page: optionalNumber(input.page),
        "filter[name]": optionalString(input.name),
        "filter[user_id]": optionalNumber(input.user_id),
        "filter[team_id]": optionalNumber(input.team_id),
        sort: optionalString(input.sort),
      },
      phase: "execute",
    });
    const record = requireProviderObject(payload, "Feedier report list");
    return {
      reports: requireProviderArray(record.data, "Feedier report list data"),
      links: requireProviderObject(record.links, "Feedier report list links"),
      meta: requireProviderObject(record.meta, "Feedier report list metadata"),
    };
  },
  async create_report(input, context) {
    return {
      report: requireProviderObject(
        await requestFeedierJson({
          ...requestContext(context),
          path: "/v3/reports",
          method: "POST",
          body: reportMutationBody(input, ["team_id", "master_id", "format"]),
          bodyEncoding: "form",
          phase: "execute",
        }),
        "created Feedier report",
      ),
    };
  },
  async get_report(input, context) {
    const reportId = requireReportId(input);
    return {
      report: requireProviderObject(
        await requestFeedierJson({
          ...requestContext(context),
          path: `/v3/reports/${reportId}`,
          phase: "execute",
        }),
        "Feedier report",
      ),
    };
  },
  async update_report(input, context) {
    const reportId = requireReportId(input);
    return {
      report: requireProviderObject(
        await requestFeedierJson({
          ...requestContext(context),
          path: `/v3/reports/${reportId}`,
          method: "PUT",
          body: reportMutationBody(input),
          bodyEncoding: "form",
          phase: "execute",
        }),
        "updated Feedier report",
      ),
    };
  },
  async delete_report(input, context) {
    await requestFeedierJson({
      ...requestContext(context),
      path: `/v3/reports/${requireReportId(input)}`,
      method: "DELETE",
      phase: "execute",
    });
    return { deleted: true };
  },
  async create_report_share_link(input, context) {
    const payload = await requestFeedierJson({
      ...requestContext(context),
      path: `/v3/reports/${requireReportId(input)}/share`,
      method: "POST",
      body: { expiration: optionalString(input.expiration) },
      bodyEncoding: "json",
      phase: "execute",
    });
    return { share_link: requireProviderObject(payload, "Feedier report share link") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, feedierActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: feedierApiBaseUrl,
  auth: { type: "bearer" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    await requestFeedierJson({
      apiKey: input.apiKey,
      path: "/v3/reports",
      query: { page: 1 },
      fetcher,
      signal,
      phase: "validate",
    });
    return {
      profile: { accountId: "feedier-api-key", displayName: "Feedier API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: feedierApiBaseUrl, validationEndpoint: "/v3/reports" },
    };
  },
};

function requestContext(context: ApiKeyProviderContext): Pick<FeedierRequestInput, "apiKey" | "fetcher" | "signal"> {
  return { apiKey: context.apiKey, fetcher: context.fetcher, signal: context.signal };
}

async function requestFeedierJson(input: FeedierRequestInput): Promise<unknown> {
  const url = new URL(input.path, feedierApiBaseUrl);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  let response: Response;
  try {
    const requestBody = encodeRequestBody(input.body, input.bodyEncoding);
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (requestBody) headers.set("content-type", requestBody.contentType);
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: requestBody?.body,
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Feedier request failed: ${error.message}` : "Feedier request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) throw createFeedierError(response, payload, input.phase);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return null;
    throw new ProviderRequestError(502, "Feedier returned invalid JSON");
  }
}

function createFeedierError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Feedier request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      phase === "validate" ? "Invalid Feedier private API key." : message,
      payload,
    );
  }
  return new ProviderRequestError(response.status >= 400 ? response.status : 502, message, payload);
}

function reportMutationBody(input: Record<string, unknown>, extraFields: string[] = []): Record<string, unknown> {
  const body: Record<string, unknown> = {
    user_id: input.user_id,
    name: input.name,
    fql: input.fql,
    type: input.type,
  };
  for (const field of extraFields) body[field] = input[field];
  return body;
}

function encodeRequestBody(
  body: Record<string, unknown> | undefined,
  encoding: BodyEncoding | undefined,
): { body: BodyInit; contentType: string } | undefined {
  if (body === undefined) return undefined;
  const compactBody = compactObject(body);
  if (encoding === "form") {
    const form = new URLSearchParams();
    for (const [name, value] of Object.entries(compactBody)) {
      form.set(name, typeof value === "string" ? value : JSON.stringify(value));
    }
    return { body: form, contentType: "application/x-www-form-urlencoded" };
  }
  return { body: JSON.stringify(compactBody), contentType: "application/json" };
}

function requireReportId(input: Record<string, unknown>): number {
  if (typeof input.report_id !== "number") throw new ProviderRequestError(400, "report_id is required");
  return input.report_id;
}

function requireProviderObject(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, () => new ProviderRequestError(502, `${label} is not an object`));
}

function requireProviderArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} is not an array`);
  return value;
}
