import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { sonarCloudAllowedApiBaseUrls, sonarCloudDefaultApiBaseUrl } from "./constants.ts";

const requestTimeoutMs = 30_000;
const maxResponseBytes = 10 * 1024 * 1024;

type SonarCloudPhase = "validate" | "execute";
type SonarCloudQueryValue = string | number | boolean | undefined;

interface SonarCloudRequest {
  context: SonarCloudActionContext;
  path: string;
  query?: Record<string, SonarCloudQueryValue>;
  phase: SonarCloudPhase;
}

interface SonarCloudPaging {
  pageIndex: number;
  pageSize: number;
  total: number;
}

export interface SonarCloudActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const sonarCloudActionHandlers: ProviderActionHandlers<
  "sonarcloud",
  ProviderRuntimeHandler<SonarCloudActionContext>
> = {
  async list_projects(input, context) {
    const payload = await requestSonarCloudJson({
      context,
      path: "/projects/search",
      query: {
        organization: readInputString(input.organization, "organization"),
        q: readOptionalInputString(input.query, "query"),
        projects: joinOptionalStringList(input.projectKeys, "projectKeys"),
        analyzedBefore: readOptionalInputString(input.analyzedBefore, "analyzedBefore"),
        onProvisionedOnly: stringifyOptionalBoolean(input.provisionedOnly),
        p: optionalInteger(input.page),
        ps: optionalInteger(input.pageSize),
      },
      phase: "execute",
    });
    return normalizeProjectSearch(payload);
  },
  async search_issues(input, context) {
    assertBranchAndPullRequestAreExclusive(input);
    const payload = await requestSonarCloudJson({
      context,
      path: "/issues/search",
      query: {
        componentKeys: joinRequiredStringList(input.projectKeys, "projectKeys"),
        branch: readOptionalInputString(input.branch, "branch"),
        pullRequest: readOptionalInputString(input.pullRequest, "pullRequest"),
        issueStatuses: joinOptionalStringList(input.issueStatuses, "issueStatuses"),
        impactSeverities: joinOptionalStringList(input.impactSeverities, "impactSeverities"),
        impactSoftwareQualities: joinOptionalStringList(input.softwareQualities, "softwareQualities"),
        assigned: stringifyOptionalBoolean(input.assigned),
        assignees: joinOptionalStringList(input.assignees, "assignees"),
        createdAfter: readOptionalInputString(input.createdAfter, "createdAfter"),
        createdBefore: readOptionalInputString(input.createdBefore, "createdBefore"),
        languages: joinOptionalStringList(input.languages, "languages"),
        tags: joinOptionalStringList(input.tags, "tags"),
        resolved: stringifyOptionalBoolean(input.resolved),
        p: optionalInteger(input.page),
        ps: optionalInteger(input.pageSize),
      },
      phase: "execute",
    });
    return normalizeIssueSearch(payload);
  },
  async get_component_measures(input, context) {
    assertBranchAndPullRequestAreExclusive(input);
    const payload = await requestSonarCloudJson({
      context,
      path: "/measures/component",
      query: {
        component: readInputString(input.componentKey, "componentKey"),
        metricKeys: joinRequiredStringList(input.metricKeys, "metricKeys"),
        branch: readOptionalInputString(input.branch, "branch"),
        pullRequest: readOptionalInputString(input.pullRequest, "pullRequest"),
        additionalFields: optionalBoolean(input.includeMetricDetails) ? "metrics,periods" : undefined,
      },
      phase: "execute",
    });
    return normalizeComponentMeasures(payload);
  },
};

export function resolveSonarCloudApiBaseUrl(value: unknown): string {
  const rawApiBaseUrl = optionalString(value);
  if (!rawApiBaseUrl) return sonarCloudDefaultApiBaseUrl;

  let url: URL;
  try {
    url = new URL(rawApiBaseUrl);
  } catch {
    throw new ProviderRequestError(400, "SonarQube Cloud API Base URL must be a valid URL");
  }

  const pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  const normalizedApiBaseUrl = `${url.origin}${pathname}`;
  if (
    url.protocol === "https:" &&
    sonarCloudAllowedApiBaseUrls.includes(normalizedApiBaseUrl) &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  ) {
    return normalizedApiBaseUrl;
  }

  throw new ProviderRequestError(400, `Unsupported SonarQube Cloud API Base URL: ${rawApiBaseUrl}`);
}

export async function validateSonarCloudCredential(
  input: { apiKey: string; values: Record<string, string> },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const apiBaseUrl = resolveSonarCloudApiBaseUrl(input.values.apiBaseUrl);
  const payload = await requestSonarCloudJson({
    context: { apiKey: input.apiKey, apiBaseUrl, fetcher, signal },
    path: "/authentication/validate",
    phase: "validate",
  });
  const validation = readProviderRecord(payload, "SonarQube Cloud returned an invalid credential validation response");
  if (validation.valid !== true) {
    throw new ProviderRequestError(400, "SonarQube Cloud token is invalid");
  }

  const region = new URL(apiBaseUrl).host === "sonarqube.us" ? "US" : "EU";
  return {
    profile: {
      accountId: `sonarcloud:${region.toLowerCase()}`,
      displayName: `SonarQube Cloud ${region}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      validationEndpoint: "/authentication/validate",
    },
  };
}

async function requestSonarCloudJson(input: SonarCloudRequest): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildSonarCloudUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readSonarCloudPayload(response);
    if (!response.ok) throw createSonarCloudError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "SonarQube Cloud request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SonarQube Cloud request failed: ${error.message}` : "SonarQube Cloud request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSonarCloudUrl(input: SonarCloudRequest): string {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${input.context.apiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readSonarCloudPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "SonarQube Cloud response", maxResponseBytes);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SonarQube Cloud returned invalid JSON");
  }
}

function createSonarCloudError(status: number, payload: unknown, phase: SonarCloudPhase): ProviderRequestError {
  const message = extractSonarCloudErrorMessage(payload) ?? `SonarQube Cloud request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message);
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 502, message);
}

function extractSonarCloudErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return optionalString(payload);
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const directMessage = optionalString(record.message) ?? optionalString(record.msg) ?? optionalString(record.error);
  if (directMessage) return directMessage;
  if (!Array.isArray(record.errors)) return undefined;
  const firstError = record.errors[0];
  const firstRecord = optionalRecord(firstError);
  return (
    optionalString(firstRecord?.msg) ??
    optionalString(firstRecord?.message) ??
    (typeof firstError === "string" ? optionalString(firstError) : undefined)
  );
}

function normalizeProjectSearch(payload: unknown): unknown {
  const record = readProviderRecord(payload, "SonarQube Cloud returned an invalid project search");
  return {
    paging: normalizePaging(record.paging),
    projects: readProviderRecords(record.components, "SonarQube Cloud returned an invalid project list").map(
      (project) => ({
        organization: readProviderString(
          project.organization,
          "SonarQube Cloud returned a project without an organization",
        ),
        key: readProviderString(project.key, "SonarQube Cloud returned a project without a key"),
        name: readProviderString(project.name, "SonarQube Cloud returned a project without a name"),
        qualifier: readProviderString(project.qualifier, "SonarQube Cloud returned a project without a qualifier"),
        visibility: readProviderString(project.visibility, "SonarQube Cloud returned a project without visibility"),
        lastAnalysisDate: optionalString(project.lastAnalysisDate) ?? null,
        revision: optionalString(project.revision) ?? null,
      }),
    ),
  };
}

function normalizeIssueSearch(payload: unknown): unknown {
  const record = readProviderRecord(payload, "SonarQube Cloud returned an invalid issue search");
  return {
    paging: normalizePaging(record.paging),
    issues: readProviderRecords(record.issues, "SonarQube Cloud returned an invalid issue list").map((issue) => ({
      key: readProviderString(issue.key, "SonarQube Cloud returned an issue without a key"),
      project: readProviderString(issue.project, "SonarQube Cloud returned an issue without a project"),
      component: readProviderString(issue.component, "SonarQube Cloud returned an issue without a component"),
      rule: readProviderString(issue.rule, "SonarQube Cloud returned an issue without a rule"),
      status: readProviderString(
        issue.issueStatus ?? issue.status,
        "SonarQube Cloud returned an issue without a status",
      ),
      message: readProviderString(issue.message, "SonarQube Cloud returned an issue without a message"),
      line: optionalInteger(issue.line) ?? null,
      assignee: optionalString(issue.assignee) ?? null,
      author: optionalString(issue.author) ?? null,
      effort: optionalString(issue.effort) ?? null,
      creationDate: optionalString(issue.creationDate) ?? null,
      updateDate: optionalString(issue.updateDate) ?? null,
      cleanCodeAttribute: optionalString(issue.cleanCodeAttribute) ?? null,
      cleanCodeAttributeCategory: optionalString(issue.cleanCodeAttributeCategory) ?? null,
      tags: normalizeStringList(issue.tags),
      impacts: normalizeIssueImpacts(issue.impacts),
    })),
  };
}

function normalizeComponentMeasures(payload: unknown): unknown {
  const record = readProviderRecord(payload, "SonarQube Cloud returned an invalid component measures response");
  const component = readProviderRecord(
    record.component,
    "SonarQube Cloud returned component measures without a component",
  );
  return {
    component: {
      key: readProviderString(component.key, "SonarQube Cloud returned a measured component without a key"),
      name: readProviderString(component.name, "SonarQube Cloud returned a measured component without a name"),
      qualifier: readProviderString(
        component.qualifier,
        "SonarQube Cloud returned a measured component without a qualifier",
      ),
      language: optionalString(component.language) ?? null,
      path: optionalString(component.path) ?? null,
      measures: readProviderRecords(component.measures, "SonarQube Cloud returned an invalid measure list").map(
        (measure) => ({
          metric: readProviderString(measure.metric, "SonarQube Cloud returned a measure without a metric key"),
          value: optionalString(measure.value) ?? null,
          bestValue: optionalBoolean(measure.bestValue) ?? null,
          periods: normalizeMeasurePeriods(measure.periods),
        }),
      ),
    },
    metrics: normalizeMetricDefinitions(record.metrics),
    periods: normalizeAnalysisPeriods(record.periods),
  };
}

function normalizePaging(value: unknown): SonarCloudPaging {
  const paging = readProviderRecord(value, "SonarQube Cloud returned invalid pagination metadata");
  const pageIndex = optionalInteger(paging.pageIndex);
  const pageSize = optionalInteger(paging.pageSize);
  const total = optionalInteger(paging.total);
  if (pageIndex === undefined || pageSize === undefined || total === undefined) {
    throw new ProviderRequestError(502, "SonarQube Cloud returned incomplete pagination metadata");
  }
  return { pageIndex, pageSize, total };
}

function normalizeIssueImpacts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return objectArray(value, "issue impacts", providerError).map((impact) => ({
    softwareQuality: readProviderString(
      impact.softwareQuality,
      "SonarQube Cloud returned an issue impact without a software quality",
    ),
    severity: readProviderString(impact.severity, "SonarQube Cloud returned an issue impact without a severity"),
  }));
}

function normalizeMeasurePeriods(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return objectArray(value, "measure periods", providerError).map((period) => {
    const index = optionalInteger(period.index);
    if (index === undefined) {
      throw new ProviderRequestError(502, "SonarQube Cloud returned a measure period without an index");
    }
    return {
      index,
      value: readProviderString(period.value, "SonarQube Cloud returned a measure period without a value"),
      bestValue: optionalBoolean(period.bestValue) ?? null,
    };
  });
}

function normalizeMetricDefinitions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return objectArray(value, "metric definitions", providerError).map((metric) => ({
    key: readProviderString(metric.key, "SonarQube Cloud returned a metric definition without a key"),
    name: readProviderString(metric.name, "SonarQube Cloud returned a metric definition without a name"),
    description: optionalString(metric.description) ?? null,
    domain: optionalString(metric.domain) ?? null,
    type: readProviderString(metric.type, "SonarQube Cloud returned a metric definition without a type"),
    higherValuesAreBetter: optionalBoolean(metric.higherValuesAreBetter) ?? null,
    qualitative: optionalBoolean(metric.qualitative) ?? null,
    hidden: optionalBoolean(metric.hidden) ?? null,
  }));
}

function normalizeAnalysisPeriods(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return objectArray(value, "analysis periods", providerError).map((period) => {
    const index = optionalInteger(period.index);
    if (index === undefined) {
      throw new ProviderRequestError(502, "SonarQube Cloud returned an analysis period without an index");
    }
    return {
      index,
      mode: optionalString(period.mode) ?? null,
      date: optionalString(period.date) ?? null,
      parameter: optionalString(period.parameter) ?? null,
    };
  });
}

function assertBranchAndPullRequestAreExclusive(input: Record<string, unknown>): void {
  if (input.branch != null && input.pullRequest != null) {
    throw new ProviderRequestError(400, "branch and pullRequest cannot be used together");
  }
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, badRequest);
}

function readOptionalInputString(value: unknown, fieldName: string): string | undefined {
  if (value == null) return undefined;
  const stringValue = optionalString(value);
  if (!stringValue) throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  return stringValue;
}

function joinRequiredStringList(value: unknown, fieldName: string): string {
  const joined = joinOptionalStringList(value, fieldName);
  if (!joined) throw new ProviderRequestError(400, `${fieldName} is required`);
  return joined;
}

function joinOptionalStringList(value: unknown, fieldName: string): string | undefined {
  if (value == null) return undefined;
  const values = requiredStringArray(value, fieldName, badRequest).map((item) => readInputString(item, fieldName));
  if (values.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string array`);
  }
  return values.join(",");
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function stringifyOptionalBoolean(value: unknown): string | undefined {
  const booleanValue = optionalBoolean(value);
  return booleanValue === undefined ? undefined : String(booleanValue);
}

function readProviderRecord(value: unknown, message: string): Record<string, unknown> {
  return requiredRecord(value, "response", () => new ProviderRequestError(502, message));
}

function readProviderRecords(value: unknown, message: string): Array<Record<string, unknown>> {
  return objectArray(value, "response", () => new ProviderRequestError(502, message));
}

function readProviderString(value: unknown, message: string): string {
  const stringValue = optionalString(value);
  if (stringValue === undefined) throw new ProviderRequestError(502, message);
  return stringValue;
}

function badRequest(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `SonarQube Cloud returned invalid ${message}`);
}
