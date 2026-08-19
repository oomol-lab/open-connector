import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "classmarker";
const classmarkerApiBaseUrl = "https://api.classmarker.com";
const classmarkerValidationPath = "/v1.json";

interface ClassmarkerContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ClassmarkerActionHandler = (input: Record<string, unknown>, context: ClassmarkerContext) => Promise<unknown>;

export const classmarkerActionHandlers: ProviderActionHandlers<"classmarker", ClassmarkerActionHandler> = {
  list_groups_links_and_tests(_input, context) {
    return requestClassmarkerAction({
      context,
      path: classmarkerValidationPath,
      normalize: normalizeGroupLinkCatalogResponse,
    });
  },
  list_recent_group_results(input, context) {
    return requestClassmarkerAction({
      context,
      path: "/v1/groups/recent_results.json",
      query: buildRecentResultsQuery(input),
      normalize: normalizeRecentResultsResponse,
    });
  },
  list_recent_link_results(input, context) {
    return requestClassmarkerAction({
      context,
      path: "/v1/links/recent_results.json",
      query: buildRecentResultsQuery(input),
      normalize: normalizeRecentResultsResponse,
    });
  },
  list_recent_results_for_group_test(input, context) {
    const groupId = requirePositiveInteger(input.groupId, "groupId", 400);
    const testId = requirePositiveInteger(input.testId, "testId", 400);
    return requestClassmarkerAction({
      context,
      path: `/v1/groups/${groupId}/tests/${testId}/recent_results.json`,
      query: buildRecentResultsQuery(input),
      normalize: normalizeRecentResultsResponse,
    });
  },
  list_recent_results_for_link_test(input, context) {
    const linkId = requirePositiveInteger(input.linkId, "linkId", 400);
    const testId = requirePositiveInteger(input.testId, "testId", 400);
    return requestClassmarkerAction({
      context,
      path: `/v1/links/${linkId}/tests/${testId}/recent_results.json`,
      query: buildRecentResultsQuery(input),
      normalize: normalizeRecentResultsResponse,
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ClassmarkerContext>({
  service,
  handlers: classmarkerActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ClassmarkerContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: readStoredApiSecret(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateClassmarkerCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateClassmarkerCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestClassmarkerJson({
    apiKey,
    apiSecret: requireClassmarkerApiSecret(values),
    path: classmarkerValidationPath,
    fetcher,
    signal,
  });

  return {
    profile: {
      accountId: "classmarker-api-key",
      displayName: "ClassMarker API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: classmarkerApiBaseUrl,
      validationPath: classmarkerValidationPath,
    },
  };
}

async function requestClassmarkerAction(input: {
  context: ClassmarkerContext;
  path: string;
  query?: Record<string, string>;
  normalize: (payload: Record<string, unknown>) => unknown;
}): Promise<unknown> {
  const payload = await requestClassmarkerJson({
    apiKey: input.context.apiKey,
    apiSecret: input.context.apiSecret,
    path: input.path,
    query: input.query,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
  });
  return input.normalize(payload);
}

async function requestClassmarkerJson(input: {
  apiKey: string;
  apiSecret: string;
  path: string;
  query?: Record<string, string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const url = buildSignedUrl({
    apiBaseUrl: classmarkerApiBaseUrl,
    path: input.path,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
    timestamp,
    query: input.query,
  });
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ClassMarker request failed: ${error.message}` : "ClassMarker request failed",
    );
  }
  const payload = await readClassmarkerPayload(response);
  if (!response.ok || payload.status === "error") {
    throw createClassmarkerError(response.status, payload);
  }
  return payload;
}

function buildSignedUrl(input: {
  apiBaseUrl: string;
  path: string;
  apiKey: string;
  apiSecret: string;
  timestamp: number;
  query?: Record<string, string>;
}): URL {
  const url = new URL(input.path, input.apiBaseUrl);
  url.searchParams.set("api_key", input.apiKey);
  url.searchParams.set("signature", createClassmarkerSignature(input.apiKey, input.apiSecret, input.timestamp));
  url.searchParams.set("timestamp", String(input.timestamp));
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function createClassmarkerSignature(apiKey: string, apiSecret: string, timestamp: number): string {
  return createHash("sha256").update(`${apiKey}${apiSecret}${timestamp}`).digest("hex");
}

async function readClassmarkerPayload(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ProviderRequestError(502, "ClassMarker returned a non-JSON response");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new ProviderRequestError(502, `ClassMarker returned invalid JSON${detail}`);
  }
  return requireObject(payload, "ClassMarker response", 502);
}

function createClassmarkerError(statusCode: number, payload: Record<string, unknown>): ProviderRequestError {
  const code = findClassmarkerErrorCode(payload);
  const message = findClassmarkerErrorMessage(payload, code);
  if (
    code === "apiKeyAuthFail" ||
    code === "apiKeyInactive" ||
    code === "noApiKeyExists" ||
    code === "accountNotUpgraded"
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  if (code === "rateLimitExceeded") {
    return new ProviderRequestError(429, message, payload);
  }
  if (code === "timeStampOutOfRange") {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(statusCode >= 400 ? statusCode : 502, message, payload);
}

function findClassmarkerErrorCode(payload: Record<string, unknown>): string {
  const error = optionalRecord(payload.error);
  const directCode = optionalString(error?.code);
  if (directCode) {
    return directCode;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && value.trim()) {
      return key;
    }
  }
  return "classmarker_error";
}

function findClassmarkerErrorMessage(payload: Record<string, unknown>, code: string): string {
  const error = optionalRecord(payload.error);
  return (
    optionalString(error?.message) ??
    optionalString(payload.message) ??
    optionalString(payload[code]) ??
    "ClassMarker request failed"
  );
}

function buildRecentResultsQuery(input: Record<string, unknown>): Record<string, string> {
  return compactObject({
    finishedAfterTimestamp: String(requirePositiveInteger(input.finishedAfterTimestamp, "finishedAfterTimestamp", 400)),
    limit: String(requirePositiveInteger(input.limit, "limit", 400)),
  }) as Record<string, string>;
}

function normalizeGroupLinkCatalogResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    requestPath: requireString(payload.request_path, "request_path"),
    serverTimestamp: requirePositiveInteger(payload.server_timestamp, "server_timestamp", 502),
    groups: readRecordArray(payload.groups, "groups").map((item) =>
      normalizeGroup(requireObject(item.group, "group", 502)),
    ),
    links: readRecordArray(payload.links, "links").map((item) => normalizeLink(requireObject(item.link, "link", 502))),
  };
}

function normalizeRecentResultsResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    requestPath: requireString(payload.request_path, "request_path"),
    serverTimestamp: requirePositiveInteger(payload.server_timestamp, "server_timestamp", 502),
    finishedAfterTimestampUsed: optionalInteger(payload.finished_after_timestamp_used) ?? null,
    groups: readRecordArray(payload.groups, "groups").map((item) =>
      normalizeRecentGroup(requireObject(item.group, "group", 502)),
    ),
    tests: readRecordArray(payload.tests, "tests").map((item) =>
      normalizeRecentTest(requireObject(item.test, "test", 502)),
    ),
    results: readRecordArray(payload.results, "results").map((item) =>
      normalizeRecentResult(requireObject(item.result, "result", 502)),
    ),
    numResultsAvailable: optionalInteger(payload.num_results_available) ?? null,
    numResultsReturned: optionalInteger(payload.num_results_returned) ?? null,
    moreResultsExist: typeof payload.more_results_exist === "boolean" ? payload.more_results_exist : null,
    nextFinishedAfterTimestamp: optionalInteger(payload.next_finished_after_timestamp) ?? null,
  };
}

function normalizeGroup(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    groupId: requirePositiveInteger(raw.group_id, "group_id", 502),
    groupName: requireString(raw.group_name, "group_name"),
    assignedTests: readAssignedTests(raw.assigned_tests),
    raw,
  };
}

function normalizeLink(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    linkId: requirePositiveInteger(raw.link_id, "link_id", 502),
    linkName: nullableTrimmedString(raw.link_name),
    linkUrlId: nullableTrimmedString(raw.link_url_id),
    quizId: nullableTrimmedString(raw.quiz_id),
    accessListId: optionalInteger(raw.access_list_id) ?? null,
    assignedTests: readAssignedTests(raw.assigned_tests),
    raw,
  };
}

function readAssignedTests(value: unknown): Array<Record<string, unknown>> {
  return readRecordArray(value, "assigned_tests").map((item) => {
    const raw = requireObject(item.test, "test", 502);
    return {
      testId: requirePositiveInteger(raw.test_id, "test_id", 502),
      testName: requireString(raw.test_name, "test_name"),
      raw,
    };
  });
}

function normalizeRecentGroup(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    groupId: requirePositiveInteger(raw.group_id, "group_id", 502),
    groupName: requireString(raw.group_name, "group_name"),
    raw,
  };
}

function normalizeRecentTest(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    testId: requirePositiveInteger(raw.test_id, "test_id", 502),
    testName: requireString(raw.test_name, "test_name"),
    raw,
  };
}

function normalizeRecentResult(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    userId: optionalInteger(raw.user_id) ?? null,
    firstName: nullableTrimmedString(raw.first),
    lastName: nullableTrimmedString(raw.last),
    email: nullableTrimmedString(raw.email),
    testId: requirePositiveInteger(raw.test_id, "test_id", 502),
    groupId: optionalInteger(raw.group_id) ?? null,
    linkId: optionalInteger(raw.link_id) ?? null,
    percentage: optionalNumber(raw.percentage) ?? null,
    pointsScored: optionalNumber(raw.points_scored) ?? null,
    pointsAvailable: optionalNumber(raw.points_available) ?? null,
    timeStarted: optionalInteger(raw.time_started) ?? null,
    timeFinished: optionalInteger(raw.time_finished) ?? null,
    status: nullableTrimmedString(raw.status),
    duration: nullableTrimmedString(raw.duration),
    percentagePassmark: optionalNumber(raw.percentage_passmark) ?? null,
    passed: typeof raw.passed === "boolean" ? raw.passed : null,
    requiresGrading: nullableTrimmedString(raw.requires_grading),
    giveCertificateOnlyWhenPassed:
      typeof raw.give_certificate_only_when_passed === "boolean" ? raw.give_certificate_only_when_passed : null,
    certificateUrl: nullableTrimmedString(raw.certificate_url),
    certificateSerial: nullableTrimmedString(raw.certificate_serial),
    viewResultsUrl: nullableTrimmedString(raw.view_results_url),
    testType: nullableTrimmedString(raw.test_type),
    accessCode: nullableTrimmedString(raw.access_code),
    cmUserId: nullableTrimmedString(raw.cm_user_id),
    ipAddress: nullableTrimmedString(raw.ip_address),
    extraInfo: nullableTrimmedString(raw.extra_info),
    extraInfo2: nullableTrimmedString(raw.extra_info2),
    extraInfo3: nullableTrimmedString(raw.extra_info3),
    extraInfo4: nullableTrimmedString(raw.extra_info4),
    extraInfo5: nullableTrimmedString(raw.extra_info5),
    monitorEvents: normalizeMonitorEvents(raw.monitor_events),
    raw,
  };
}

function normalizeMonitorEvents(value: unknown): Record<string, unknown> | null {
  const raw = optionalRecord(value);
  if (!raw) {
    return null;
  }
  return {
    browserMonitoring: nullableTrimmedString(raw.browser_monitoring),
    cameraMonitoring: nullableTrimmedString(raw.camera_monitoring),
    totalEventCount: optionalInteger(raw.total_event_count) ?? null,
    totalSecondsAway: optionalInteger(raw.total_seconds_away) ?? null,
    events: readRecordArray(raw.events, "monitor_events.events").map((event) => ({
      timestamp: requirePositiveInteger(event.timestamp, "timestamp", 502),
      event: requireString(event.event, "event"),
      secondsAway: requireNonNegativeInteger(event.seconds_away, "seconds_away"),
    })),
    raw,
  };
}

function readRecordArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `ClassMarker ${fieldName} is not an array`, value);
  }
  return value.map((item) => requireObject(item, fieldName, 502));
}

function requireObject(value: unknown, fieldName: string, status: number): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(status, `${fieldName} must be an object`, value);
  }
  return record;
}

function requireString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `ClassMarker ${fieldName} is missing`, value);
  }
  return text;
}

function requirePositiveInteger(value: unknown, fieldName: string, status: number): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(status, `${fieldName} must be a positive integer`, value);
  }
  return parsed;
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed < 0) {
    throw new ProviderRequestError(502, `ClassMarker ${fieldName} must be a non-negative integer`, value);
  }
  return parsed;
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isInteger(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function nullableTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function requireClassmarkerApiSecret(values: Record<string, string>): string {
  const secret = optionalString(values.apiSecret);
  if (!secret) {
    throw new ProviderRequestError(400, "apiSecret is required");
  }
  return secret;
}

function readStoredApiSecret(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const secret = optionalString(values.apiSecret) ?? optionalString(metadata.apiSecret);
  if (!secret) {
    throw new ProviderRequestError(400, "apiSecret is required");
  }
  return secret;
}
