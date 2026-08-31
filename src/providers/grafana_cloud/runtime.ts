import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const grafanaCloudApiBaseUrl = "https://grafana.com/api";

type GrafanaCloudRequestPhase = "validate" | "execute";
type GrafanaCloudActionHandler = (input: Record<string, unknown>, context: GrafanaCloudContext) => Promise<unknown>;

export interface GrafanaCloudContext {
  apiKey: string;
  orgSlug: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const grafanaCloudActionHandlers: ProviderActionHandlers<"grafana_cloud", GrafanaCloudActionHandler> = {
  async list_regions(_input, context) {
    const payload = await requestGrafanaCloud(context, buildGrafanaCloudUrl("/stack-regions"), "execute");
    const record = requireRecord(payload, "Grafana Cloud regions response");
    return {
      regions: recordArray(record.items).map(normalizeRegion),
      raw: record,
    };
  },
  async list_stacks(input, context) {
    const payload = await requestGrafanaCloud(
      context,
      buildGrafanaCloudUrl(
        `/orgs/${encodePathSegment(context.orgSlug)}/instances`,
        compactObject({
          pageSize: optionalNumber(input.pageSize),
          pageCursor: optionalString(input.pageCursor),
        }),
      ),
      "execute",
    );
    const record = requireRecord(payload, "Grafana Cloud stacks response");
    const metadata = optionalRecord(record.metadata);
    const pagination = optionalRecord(metadata?.pagination);
    const nextPage = optionalString(pagination?.nextPage) ?? null;
    return {
      stacks: recordArray(record.items).map(normalizeStack),
      nextPageCursor: extractPageCursor(nextPage),
      nextPage,
      raw: record,
    };
  },
  async get_stack_connectivity(input, context) {
    const payload = await requestGrafanaCloud(
      context,
      buildGrafanaCloudUrl(
        `/instances/${encodePathSegment(requireTrimmedString(input.stackSlug, "stackSlug"))}/connections`,
      ),
      "execute",
    );
    return {
      connectivity: requireRecord(payload, "Grafana Cloud stack connectivity response"),
    };
  },
  async get_billed_usage(input, context) {
    const payload = await requestGrafanaCloud(
      context,
      buildGrafanaCloudUrl(`/orgs/${encodePathSegment(context.orgSlug)}/billed-usage`, {
        month: optionalNumber(input.month),
        year: optionalNumber(input.year),
      }),
      "execute",
    );
    const record = requireRecord(payload, "Grafana Cloud billed usage response");
    return {
      usage: recordArray(record.items).map(normalizeBilledUsage),
      raw: record,
    };
  },
};

export async function validateGrafanaCloudCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const orgSlug = requireGrafanaCloudOrgSlug(values.orgSlug);
  const context = { apiKey, orgSlug, fetcher, signal };
  const payload = await requestGrafanaCloud(
    context,
    buildGrafanaCloudUrl(`/orgs/${encodePathSegment(orgSlug)}/instances`, { pageSize: 1 }),
    "validate",
  );
  const record = requireRecord(payload, "Grafana Cloud stacks response");
  const stacks = recordArray(record.items);
  const firstStack = optionalRecord(stacks[0]);
  const firstStackSlug = optionalString(firstStack?.slug);
  const stackCount = optionalNumber(record.total) ?? stacks.length;
  const orgName = optionalString(firstStack?.orgName) ?? optionalString(firstStack?.orgSlug) ?? orgSlug;

  return {
    profile: {
      accountId: `grafana_cloud:${orgSlug}`,
      displayName: orgName,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: grafanaCloudApiBaseUrl,
      orgSlug,
      validationEndpoint: `/orgs/${orgSlug}/instances`,
      stackCount,
      firstStackSlug,
    }),
  };
}

export function requireGrafanaCloudOrgSlug(value: unknown): string {
  return requireTrimmedString(value, "orgSlug");
}

function buildGrafanaCloudUrl(path: string, query: Record<string, unknown> = {}): URL {
  const url = new URL(`${grafanaCloudApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestGrafanaCloud(
  context: Pick<GrafanaCloudContext, "apiKey" | "fetcher" | "signal">,
  url: URL,
  phase: GrafanaCloudRequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw mapGrafanaCloudError(response.status, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Grafana Cloud API request timed out");
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Grafana Cloud API request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Grafana Cloud returned invalid JSON");
  }
}

function mapGrafanaCloudError(status: number, payload: unknown, phase: GrafanaCloudRequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Grafana Cloud API request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(phase === "validate" ? 400 : 404, message, payload);
  }
  if (status === 409) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(400, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.errorMessage);
}

function normalizeRegion(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalNumber(input.id) ?? null,
    slug: optionalString(input.slug) ?? null,
    name: optionalString(input.name) ?? null,
    status: optionalString(input.status) ?? null,
    provider: optionalString(input.provider) ?? null,
    description: optionalString(input.description) ?? null,
    raw: input,
  };
}

function normalizeStack(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalNumber(input.id) ?? null,
    slug: optionalString(input.slug) ?? null,
    name: optionalString(input.name) ?? null,
    url: optionalString(input.url) ?? null,
    status: optionalString(input.status) ?? null,
    orgSlug: optionalString(input.orgSlug) ?? null,
    orgName: optionalString(input.orgName) ?? null,
    regionSlug: optionalString(input.regionSlug) ?? null,
    planName: optionalString(input.planName) ?? null,
    raw: input,
  };
}

function normalizeBilledUsage(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalNumber(input.id) ?? null,
    dimensionId: optionalString(input.dimensionId) ?? null,
    dimensionName: optionalString(input.dimensionName) ?? null,
    unit: optionalString(input.unit) ?? null,
    includedUsage: optionalNumber(input.includedUsage) ?? null,
    totalUsage: optionalNumber(input.totalUsage) ?? null,
    overage: optionalNumber(input.overage) ?? null,
    amountDue: optionalNumber(input.amountDue) ?? null,
    raw: input,
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = optionalRecord(item);
        return record ? [record] : [];
      })
    : [];
}

function extractPageCursor(nextPage: string | null): string | null {
  if (!nextPage) {
    return null;
  }
  try {
    const url = new URL(nextPage, grafanaCloudApiBaseUrl);
    return optionalString(url.searchParams.get("pageCursor")) ?? null;
  } catch {
    return null;
  }
}

function requireTrimmedString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}
