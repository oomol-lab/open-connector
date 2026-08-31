import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined;

interface SnykResponse {
  data?: unknown;
  links?: unknown;
  meta?: unknown;
}

interface RequestInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, QueryValue>;
  commaArrays?: readonly string[];
  phase: "validate" | "execute";
}

export const snykApiBaseUrl = "https://api.snyk.io/rest";
const apiVersion = "2024-10-15";

export const snykActionHandlers: ProviderActionHandlers<"snyk", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_self(_input, context) {
    const response = await requestJson({ context, path: "/self", phase: "execute" });
    return { principal: requireResource(response.data, "Snyk principal"), raw: response };
  },
  async list_orgs(input, context) {
    return normalizeCollection(
      await requestJson({
        context,
        path: "/orgs",
        query: {
          ...cursorQuery(input),
          group_id: trimmed(input.groupId),
          is_personal: optionalBoolean(input.isPersonal),
          slug: trimmed(input.slug),
          name: trimmed(input.name),
          expand: input.includeMemberRole === true ? ["member_role"] : undefined,
        },
        phase: "execute",
      }),
      "organizations",
    );
  },
  async get_org(input, context) {
    const orgId = requiredTrimmed(input.orgId, "orgId");
    const response = await requestJson({ context, path: `/orgs/${encodeURIComponent(orgId)}`, phase: "execute" });
    return { orgId, organization: requireResource(response.data, "Snyk organization"), raw: response };
  },
  async list_projects(input, context) {
    const orgId = requiredTrimmed(input.orgId, "orgId");
    return {
      orgId,
      ...normalizeCollection(
        await requestJson({
          context,
          path: `/orgs/${encodeURIComponent(orgId)}/projects`,
          query: {
            ...cursorQuery(input),
            target_id: stringArray(input.targetIds),
            target_reference: trimmed(input.targetReference),
            target_file: trimmed(input.targetFile),
            target_runtime: trimmed(input.targetRuntime),
            ids: stringArray(input.projectIds),
            names: stringArray(input.names),
            names_start_with: stringArray(input.namesStartWith),
            origins: stringArray(input.origins),
            types: stringArray(input.types),
            tags: stringArray(input.tags),
            business_criticality: stringArray(input.businessCriticality),
            environment: stringArray(input.environment),
            lifecycle: stringArray(input.lifecycle),
            expand: input.includeTarget === true ? ["target"] : undefined,
            "meta.latest_issue_counts": optionalBoolean(input.includeLatestIssueCounts),
            "meta.latest_dependency_total": optionalBoolean(input.includeLatestDependencyTotal),
            cli_monitored_before: trimmed(input.cliMonitoredBefore),
            cli_monitored_after: trimmed(input.cliMonitoredAfter),
          },
          commaArrays: [
            "ids",
            "names",
            "names_start_with",
            "origins",
            "types",
            "expand",
            "tags",
            "business_criticality",
            "environment",
            "lifecycle",
          ],
          phase: "execute",
        }),
        "projects",
      ),
    };
  },
  async get_project(input, context) {
    const orgId = requiredTrimmed(input.orgId, "orgId");
    const projectId = requiredTrimmed(input.projectId, "projectId");
    const response = await requestJson({
      context,
      path: `/orgs/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}`,
      query: {
        expand: input.includeTarget === true ? ["target"] : undefined,
        "meta.latest_issue_counts": optionalBoolean(input.includeLatestIssueCounts),
        "meta.latest_dependency_total": optionalBoolean(input.includeLatestDependencyTotal),
      },
      commaArrays: ["expand"],
      phase: "execute",
    });
    return { orgId, projectId, project: requireResource(response.data, "Snyk project"), raw: response };
  },
  async list_org_issues(input, context) {
    const orgId = requiredTrimmed(input.orgId, "orgId");
    return {
      orgId,
      ...normalizeCollection(
        await requestJson({
          context,
          path: `/orgs/${encodeURIComponent(orgId)}/issues`,
          query: {
            ...cursorQuery(input),
            "scan_item.id": trimmed(input.scanItemId),
            "scan_item.type": trimmed(input.scanItemType),
            type: trimmed(input.type),
            updated_before: trimmed(input.updatedBefore),
            updated_after: trimmed(input.updatedAfter),
            created_before: trimmed(input.createdBefore),
            created_after: trimmed(input.createdAfter),
            effective_severity_level: stringArray(input.effectiveSeverityLevel),
            status: stringArray(input.status),
            ignored: optionalBoolean(input.ignored),
          },
          commaArrays: ["effective_severity_level", "status"],
          phase: "execute",
        }),
        "issues",
      ),
    };
  },
};

export async function validateSnykCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await requestJson({ context: { apiKey, fetcher, signal }, path: "/self", phase: "validate" });
  const principal = requireResource(response.data, "Snyk principal");
  const attributes = optionalRecord(principal.attributes);
  const label =
    trimmed(attributes?.name) ??
    trimmed(attributes?.displayName) ??
    trimmed(attributes?.display_name) ??
    trimmed(attributes?.email) ??
    "Snyk API Key";
  return {
    profile: { accountId: optionalString(principal.id) ?? "snyk:api-key", displayName: label },
    grantedScopes: [],
    metadata: { apiBaseUrl: snykApiBaseUrl, validationEndpoint: "/self", apiVersion },
  };
}

async function requestJson(input: RequestInput): Promise<SnykResponse> {
  return runProviderRequest({ signal: input.context.signal, label: "Snyk" }, async (signal) => {
    const url = buildUrl(input.path, input.query, input.commaArrays);
    const response = await input.context.fetcher(url, {
      headers: {
        accept: "application/vnd.api+json",
        authorization: `token ${input.context.apiKey}`,
        "content-type": "application/vnd.api+json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Snyk returned invalid JSON",
    });
    if (!response.ok) {
      const error = optionalRecord(payload);
      const errors = Array.isArray(error?.errors) ? optionalRecord(error.errors[0]) : undefined;
      const message =
        optionalString(errors?.detail) ??
        optionalString(errors?.title) ??
        optionalString(error?.message) ??
        `Snyk request failed with HTTP ${response.status}`;
      const status =
        input.phase === "validate" && (response.status === 401 || response.status === 403) ? 400 : response.status;
      throw new ProviderRequestError(status, message, payload);
    }
    const object = optionalRecord(payload);
    if (!object) throw new ProviderRequestError(502, "Snyk returned a non-object response");
    return object;
  });
}

function buildUrl(path: string, query: Record<string, QueryValue> = {}, commaArrays: readonly string[] = []): URL {
  const url = new URL(path.replace(/^\//u, ""), `${snykApiBaseUrl}/`);
  url.searchParams.set("version", apiVersion);
  const commaNames = new Set(commaArrays);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (commaNames.has(key)) url.searchParams.set(key, value.join(","));
      else for (const item of value) url.searchParams.append(key, String(item));
    } else url.searchParams.set(key, String(value));
  }
  return url;
}

function normalizeCollection(response: SnykResponse, field: string): Record<string, unknown> {
  if (!Array.isArray(response.data))
    throw new ProviderRequestError(502, `Snyk ${field} response data must be an array`);
  return {
    [field]: response.data,
    links: optionalRecord(response.links) ?? {},
    meta: optionalRecord(response.meta) ?? null,
    raw: response,
  };
}

function cursorQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  const limit = typeof input.limit === "number" ? input.limit : undefined;
  if (limit !== undefined && limit % 10 !== 0) throw new ProviderRequestError(400, "limit must be a multiple of 10");
  return { limit, starting_after: trimmed(input.startingAfter), ending_before: trimmed(input.endingBefore) };
}

function requireResource(value: unknown, label: string): Record<string, unknown> {
  const resource = optionalRecord(value);
  if (!resource) throw new ProviderRequestError(502, `${label} response was missing data`);
  return resource;
}

function requiredTrimmed(value: unknown, field: string): string {
  return requiredString(value, field, (message) => new ProviderRequestError(400, message)).trim();
}
function trimmed(value: unknown): string | undefined {
  return optionalString(value)?.trim() || undefined;
}
function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, "filter must be an array");
  return value.map((item) => requiredTrimmed(item, "filter item"));
}
