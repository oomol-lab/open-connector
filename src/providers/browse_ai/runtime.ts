import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const browseAiApiBaseUrl = "https://api.browse.ai/v2/";
const browseAiDefaultRequestTimeoutMs = 30_000;

type BrowseAiQueryValue = string | number | boolean | undefined;
type BrowseAiRequestPhase = "validate" | "execute";
type BrowseAiActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BrowseAiActionHandler = (input: Record<string, unknown>, context: BrowseAiActionContext) => Promise<unknown>;
type BrowseAiInputParameterValue = string | number | string[];

interface BrowseAiRobotInputParameterOption {
  label: string;
  value: string;
}

interface BrowseAiRobotInputParameter {
  type: string;
  name: string;
  label: string;
  required: boolean;
  encrypted?: boolean;
  defaultValue?: BrowseAiInputParameterValue;
  value?: BrowseAiInputParameterValue;
  min?: number;
  max?: number;
  options?: BrowseAiRobotInputParameterOption[];
}

interface BrowseAiCapturedScreenshot {
  id: string;
  name?: string | null;
  src: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  deviceScaleFactor?: number;
  full?: string | null;
  comparedToScreenshotId?: string | null;
  diffImageSrc?: string | null;
  changePercentage?: number;
  diffThreshold?: number;
  fileRemovedAt?: number | null;
}

interface BrowseAiRobot {
  id: string;
  name?: string;
  createdAt: number;
  inputParameters: BrowseAiRobotInputParameter[];
}

interface BrowseAiTask {
  id: string;
  inputParameters: Record<string, BrowseAiInputParameterValue>;
  robotId: string;
  status: string;
  createdAt: number;
  runByUserId?: string | null;
  robotBulkRunId?: string | null;
  runByTaskMonitorId?: string | null;
  runByAPI?: boolean;
  startedAt?: number | null;
  finishedAt?: number | null;
  userFriendlyError?: string | null;
  triedRecordingVideo?: boolean;
  videoUrl?: string | null;
  videoRemovedAt?: number | null;
  retriedOriginalTaskId?: string | null;
  retriedByTaskId?: string | null;
  capturedDataTemporaryUrl?: string | null;
  capturedTexts: Record<string, string | null>;
  capturedScreenshots: Record<string, BrowseAiCapturedScreenshot>;
  capturedLists: Record<string, Array<Record<string, string | null>>>;
}

interface BrowseAiRequestInput {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: BrowseAiRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, BrowseAiQueryValue>;
  method?: "GET" | "POST" | "PATCH";
  body?: Record<string, unknown> | Array<Record<string, unknown>>;
  notFoundAsInvalidInput?: boolean;
}

export const browseAiActionHandlers: ProviderActionHandlers<"browse_ai", BrowseAiActionHandler> = {
  async list_robots(_input, context) {
    const payload = await requestBrowseAiJson({
      apiKey: context.apiKey,
      path: "robots",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      robots: normalizeRobotsEnvelope(payload),
    };
  },
  async get_robot(input, context) {
    const robotId = readRequiredInputString(input.robotId, "robotId");
    const payload = await requestBrowseAiJson({
      apiKey: context.apiKey,
      path: `robots/${encodeURIComponent(robotId)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      robot: normalizeRobot(readRequiredObjectField(payload, "robot", "robot")),
    };
  },
  async run_robot_task(input, context) {
    const robotId = readRequiredInputString(input.robotId, "robotId");
    const payload = await requestBrowseAiJson({
      apiKey: context.apiKey,
      path: `robots/${encodeURIComponent(robotId)}/tasks`,
      method: "POST",
      body: compactObject({
        recordVideo: optionalBoolean(input.recordVideo),
        inputParameters: readOptionalInputParameters(input.inputParameters),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      task: normalizeTask(readRequiredObjectField(payload, "result", "result")),
    };
  },
  async get_robot_task(input, context) {
    const robotId = readRequiredInputString(input.robotId, "robotId");
    const taskId = readRequiredInputString(input.taskId, "taskId");
    const payload = await requestBrowseAiJson({
      apiKey: context.apiKey,
      path: `robots/${encodeURIComponent(robotId)}/tasks/${encodeURIComponent(taskId)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      task: normalizeTask(readRequiredObjectField(payload, "result", "result")),
    };
  },
  async list_robot_tasks(input, context) {
    const robotId = readRequiredInputString(input.robotId, "robotId");
    const payload = await requestBrowseAiJson({
      apiKey: context.apiKey,
      path: `robots/${encodeURIComponent(robotId)}/tasks`,
      query: compactObject({
        page: readOptionalInteger(input.page),
        pageSize: readOptionalInteger(input.pageSize),
        status: optionalString(input.status),
        robotBulkRunId: optionalString(input.robotBulkRunId),
        sort: optionalString(input.sort),
        includeRetried: optionalBoolean(input.includeRetried),
        fromDate: readOptionalInteger(input.fromDate),
        toDate: readOptionalInteger(input.toDate),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    const result = readRequiredObjectField(payload, "result", "result");
    const robotTasks = readRequiredObjectField(result, "robotTasks", "result.robotTasks");
    const items = readArrayOfObjects(robotTasks.items, "result.robotTasks.items");

    return {
      tasks: {
        totalCount: readRequiredInteger(robotTasks.totalCount, "result.robotTasks.totalCount"),
        pageNumber: readRequiredInteger(robotTasks.pageNumber, "result.robotTasks.pageNumber"),
        hasMore: readRequiredBoolean(robotTasks.hasMore, "result.robotTasks.hasMore"),
        items: items.map((item) => normalizeTask(item)),
      },
    };
  },
  async update_robot_cookies(input, context) {
    const robotId = readRequiredInputString(input.robotId, "robotId");
    const cookies = readCookiesInput(input.cookies);
    const payload = await requestBrowseAiJson({
      apiKey: context.apiKey,
      path: `robots/${encodeURIComponent(robotId)}/cookies`,
      method: "PATCH",
      body: cookies,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      cookies: readArrayOfObjects(readRequiredObject(payload).cookies, "cookies").map((cookie) =>
        normalizeCookie(cookie),
      ),
    };
  },
};

export async function validateBrowseAiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const payload = await requestBrowseAiJson({
    apiKey: trimmedApiKey,
    path: "robots",
    fetcher,
    signal,
    phase: "validate",
  });
  const robots = normalizeRobotsEnvelope(payload);
  const firstRobot = robots.items[0];

  return {
    profile: {
      accountId: firstRobot?.id ? `browse_ai:first_robot:${firstRobot.id}` : "browse_ai:api_key",
      displayName: "Browse AI API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: browseAiApiBaseUrl.slice(0, -1),
      validationEndpoint: "/robots",
      robotCount: robots.totalCount,
      firstRobotId: firstRobot?.id,
      firstRobotName: firstRobot?.name,
    }),
  };
}

async function requestBrowseAiJson(input: BrowseAiRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, browseAiDefaultRequestTimeoutMs);
  const url = new URL(input.path, browseAiApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (input.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readBrowseAiPayload(response);
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `browse_ai ${url.pathname} request timed out after ${Math.max(1, Math.ceil(browseAiDefaultRequestTimeoutMs / 1000))} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Browse AI request failed: ${error.message}` : "Browse AI request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createBrowseAiError(response.status, payload, input.phase, input.notFoundAsInvalidInput ?? false);
  }

  return payload;
}

async function readBrowseAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Browse AI returned invalid JSON");
  }
}

function createBrowseAiError(
  status: number,
  payload: unknown,
  phase: BrowseAiRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const messageCode = readBrowseAiMessageCode(payload);
  const detail = readBrowseAiErrorMessage(payload);

  if (status === 400) {
    return new ProviderRequestError(400, detail ?? "Browse AI rejected the request", payload);
  }

  if (status === 401) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      detail ?? (phase === "validate" ? "Browse AI API key is invalid" : "Browse AI API key is invalid or expired"),
      payload,
    );
  }

  if (status === 403) {
    if (messageCode === "credits_limit_reached") {
      return new ProviderRequestError(429, detail ?? "Browse AI credits limit reached", payload);
    }
    return new ProviderRequestError(403, detail ?? "Browse AI rejected the request", payload);
  }

  if (status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, detail ?? "Browse AI resource not found", payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, detail ?? "Browse AI rate limit reached", payload);
  }

  if (status === 503 && messageCode === "robot_under_maintenance") {
    return new ProviderRequestError(503, detail ?? "Browse AI robot is under maintenance", payload);
  }

  return new ProviderRequestError(
    status >= 500 ? 502 : status,
    detail ?? `Browse AI request failed with status ${status}`,
    payload,
  );
}

function normalizeRobotsEnvelope(payload: unknown): { totalCount: number; items: BrowseAiRobot[] } {
  const root = readRequiredObject(payload);
  const robots = readRequiredObjectField(root, "robots", "robots");
  const items = readArrayOfObjects(robots.items, "robots.items");

  return {
    totalCount: readRequiredInteger(robots.totalCount, "robots.totalCount"),
    items: items.map((item) => normalizeRobot(item)),
  };
}

function normalizeRobot(payload: Record<string, unknown>): BrowseAiRobot {
  const inputParameters: BrowseAiRobotInputParameter[] = [];
  if (Array.isArray(payload.inputParameters)) {
    for (const parameter of payload.inputParameters) {
      try {
        inputParameters.push(normalizeRobotInputParameter(readRequiredObject(parameter)));
      } catch {
        continue;
      }
    }
  }

  const robot: BrowseAiRobot = {
    id: readRequiredResponseString(payload.id, "robot.id"),
    createdAt: readRequiredInteger(payload.createdAt, "robot.createdAt"),
    inputParameters,
  };
  assignIfDefined(robot, "name", optionalString(payload.name));
  return robot;
}

function normalizeRobotInputParameter(payload: Record<string, unknown>): BrowseAiRobotInputParameter {
  const options: BrowseAiRobotInputParameterOption[] = [];
  if (Array.isArray(payload.options)) {
    for (const option of payload.options) {
      try {
        const record = readRequiredObject(option);
        options.push({
          label: readRequiredResponseString(record.label, "robot.inputParameters.options.label"),
          value: readRequiredResponseString(record.value, "robot.inputParameters.options.value"),
        });
      } catch {
        continue;
      }
    }
  }

  const parameter: BrowseAiRobotInputParameter = {
    type: readRequiredResponseString(payload.type, "robot.inputParameters.type"),
    name: readRequiredResponseString(payload.name, "robot.inputParameters.name"),
    label: readRequiredResponseString(payload.label, "robot.inputParameters.label"),
    required: optionalBoolean(payload.required) ?? false,
  };
  assignIfDefined(parameter, "encrypted", optionalBoolean(payload.encrypted));
  assignIfDefined(parameter, "defaultValue", normalizeInputParameterValue(payload.defaultValue));
  assignIfDefined(parameter, "value", normalizeInputParameterValue(payload.value));
  assignIfDefined(parameter, "min", readOptionalNumber(payload.min));
  assignIfDefined(parameter, "max", readOptionalNumber(payload.max));
  if (options.length > 0) {
    parameter.options = options;
  }
  return parameter;
}

function normalizeTask(payload: Record<string, unknown>): BrowseAiTask {
  const task: BrowseAiTask = {
    id: readRequiredResponseString(payload.id, "task.id"),
    inputParameters: normalizeInputParametersObject(payload.inputParameters),
    robotId: readRequiredResponseString(payload.robotId, "task.robotId"),
    status: normalizeTaskStatus(payload.status),
    createdAt: readRequiredInteger(payload.createdAt, "task.createdAt"),
    capturedTexts: normalizeCapturedTexts(payload.capturedTexts),
    capturedScreenshots: normalizeCapturedScreenshots(payload.capturedScreenshots),
    capturedLists: normalizeCapturedLists(payload.capturedLists),
  };
  assignIfDefined(task, "runByUserId", readNullableString(payload.runByUserId));
  assignIfDefined(task, "robotBulkRunId", readNullableString(payload.robotBulkRunId));
  assignIfDefined(task, "runByTaskMonitorId", readNullableString(payload.runByTaskMonitorId));
  assignIfDefined(task, "runByAPI", optionalBoolean(payload.runByAPI));
  assignIfDefined(task, "startedAt", readNullableInteger(payload.startedAt));
  assignIfDefined(task, "finishedAt", readNullableInteger(payload.finishedAt));
  assignIfDefined(task, "userFriendlyError", readNullableString(payload.userFriendlyError));
  assignIfDefined(task, "triedRecordingVideo", optionalBoolean(payload.triedRecordingVideo));
  assignIfDefined(task, "videoUrl", readNullableString(payload.videoUrl));
  assignIfDefined(task, "videoRemovedAt", readNullableInteger(payload.videoRemovedAt));
  assignIfDefined(task, "retriedOriginalTaskId", readNullableString(payload.retriedOriginalTaskId));
  assignIfDefined(task, "retriedByTaskId", readNullableString(payload.retriedByTaskId));
  assignIfDefined(task, "capturedDataTemporaryUrl", readNullableString(payload.capturedDataTemporaryUrl));
  return task;
}

function normalizeCapturedTexts(value: unknown): Record<string, string | null> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  const normalized: Record<string, string | null> = {};
  for (const [key, child] of Object.entries(record)) {
    normalized[key] = normalizeCapturedTextValue(child);
  }
  return normalized;
}

function normalizeCapturedScreenshots(value: unknown): Record<string, BrowseAiCapturedScreenshot> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  const normalized: Record<string, BrowseAiCapturedScreenshot> = {};
  for (const [key, child] of Object.entries(record)) {
    const screenshot = optionalRecord(child);
    if (!screenshot) {
      continue;
    }

    const id = optionalString(screenshot.id);
    const src = optionalString(screenshot.src);
    if (!id || !src) {
      continue;
    }

    const normalizedScreenshot: BrowseAiCapturedScreenshot = { id, src };
    assignIfDefined(normalizedScreenshot, "name", readNullableString(screenshot.name));
    assignIfDefined(normalizedScreenshot, "width", readOptionalNumber(screenshot.width));
    assignIfDefined(normalizedScreenshot, "height", readOptionalNumber(screenshot.height));
    assignIfDefined(normalizedScreenshot, "x", readOptionalNumber(screenshot.x));
    assignIfDefined(normalizedScreenshot, "y", readOptionalNumber(screenshot.y));
    assignIfDefined(normalizedScreenshot, "deviceScaleFactor", readOptionalNumber(screenshot.deviceScaleFactor));
    assignIfDefined(normalizedScreenshot, "full", readNullableString(screenshot.full));
    assignIfDefined(
      normalizedScreenshot,
      "comparedToScreenshotId",
      readNullableString(screenshot.comparedToScreenshotId),
    );
    assignIfDefined(normalizedScreenshot, "diffImageSrc", readNullableString(screenshot.diffImageSrc));
    assignIfDefined(normalizedScreenshot, "changePercentage", readOptionalNumber(screenshot.changePercentage));
    assignIfDefined(normalizedScreenshot, "diffThreshold", readOptionalNumber(screenshot.diffThreshold));
    assignIfDefined(normalizedScreenshot, "fileRemovedAt", readNullableInteger(screenshot.fileRemovedAt));
    normalized[key] = normalizedScreenshot;
  }
  return normalized;
}

function normalizeCapturedLists(value: unknown): Record<string, Array<Record<string, string | null>>> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      Array.isArray(child) ? child.map((item) => normalizeCapturedTexts(item)) : [],
    ]),
  );
}

function readCookiesInput(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "cookies must be an array");
  }

  return value.map((item, index) => {
    const cookie = readRequiredInputObject(item, `cookies[${index}]`);
    return compactObject({
      name: readRequiredInputString(cookie.name, `cookies[${index}].name`),
      value: String(cookie.value ?? ""),
      domain: optionalString(cookie.domain),
      expirationDate: readOptionalInteger(cookie.expirationDate),
      path: optionalString(cookie.path),
      secure: optionalBoolean(cookie.secure),
      httpOnly: optionalBoolean(cookie.httpOnly),
      hostOnly: optionalBoolean(cookie.hostOnly),
    });
  });
}

function normalizeCookie(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readRequiredResponseString(payload.name, "cookies.name"),
    value: String(payload.value ?? ""),
    domain: optionalString(payload.domain),
    expirationDate: readOptionalInteger(payload.expirationDate),
    path: optionalString(payload.path),
    secure: optionalBoolean(payload.secure),
    httpOnly: optionalBoolean(payload.httpOnly),
    hostOnly: optionalBoolean(payload.hostOnly),
  });
}

function readOptionalInputParameters(value: unknown): Record<string, BrowseAiInputParameterValue> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return normalizeInputParametersObject(record);
}

function normalizeInputParametersObject(value: unknown): Record<string, BrowseAiInputParameterValue> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  const normalized: Record<string, BrowseAiInputParameterValue> = {};
  for (const [key, child] of Object.entries(record)) {
    const parameterValue = normalizeInputParameterValue(child);
    if (parameterValue !== undefined) {
      normalized[key] = parameterValue;
    }
  }
  return normalized;
}

function normalizeInputParameterValue(value: unknown): BrowseAiInputParameterValue | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  return undefined;
}

function normalizeTaskStatus(value: unknown): string {
  const status = readRequiredResponseString(value, "task.status");
  if (status === "running") {
    return "in-progress";
  }
  if (status === "success") {
    return "successful";
  }
  if (status === "error") {
    return "failed";
  }
  return status;
}

function normalizeCapturedTextValue(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return String(value);
}

function readBrowseAiMessageCode(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record ? optionalString(record.messageCode) : undefined;
}

function readBrowseAiErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.errorMessage) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.userFriendlyError);
  if (directMessage) {
    return directMessage;
  }

  const messageCode = optionalString(record.messageCode);
  if (messageCode) {
    return `Browse AI returned ${messageCode.split("_").join(" ")}`;
  }

  return undefined;
}

function readRequiredObjectField(payload: unknown, field: string, path: string): Record<string, unknown> {
  const record = readRequiredObject(payload);
  return readRequiredObject(record[field], path);
}

function readRequiredObject(value: unknown, path = "payload"): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${path} must be an object`);
  }
  return record;
}

function readRequiredInputObject(value: unknown, path: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${path} must be an object`);
  }
  return record;
}

function readArrayOfObjects(value: unknown, path: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${path} must be an array`);
  }
  return value.map((item, index) => readRequiredObject(item, `${path}[${index}]`));
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return value;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value as number;
}

function readOptionalInteger(value: unknown): number | undefined {
  return Number.isInteger(value) ? (value as number) : undefined;
}

function readNullableInteger(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalInteger(value);
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} must be a boolean`);
  }
  return value;
}

function assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
