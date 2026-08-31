import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const worksnapsApiBaseUrl = "https://api.worksnaps.com/api";
const service = "worksnaps";
const worksnapsValidationPath = "/me.xml";

interface XmlNode {
  name: string;
  children: XmlNode[];
  text: string;
}

type WorksnapsActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const worksnapsActionHandlers: ProviderActionHandlers<"worksnaps", WorksnapsActionHandler> = {
  async get_current_user(_input, context) {
    const root = await requestWorksnapsXml({
      path: worksnapsValidationPath,
      context,
      phase: "execute",
    });
    return {
      user: normalizeCurrentUser(root),
    };
  },
  async list_projects(input, context) {
    const root = await requestWorksnapsXml({
      path: "/projects.xml",
      context,
      phase: "execute",
      query: compactObject({
        include_user_assignment: readOptionalBooleanFlag(input.includeUserAssignment),
      }),
    });
    return {
      projects: getChildren(root, "project").map((project) => normalizeProject(project)),
    };
  },
  async get_project(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}.xml`,
      context,
      phase: "execute",
      query: compactObject({
        include_user_assignment: readOptionalBooleanFlag(input.includeUserAssignment),
      }),
    });
    return {
      project: normalizeProject(root),
    };
  },
  async list_project_tasks(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}/tasks.xml`,
      context,
      phase: "execute",
      query: compactObject({
        include_task_assignment: readOptionalBooleanFlag(input.includeTaskAssignment),
      }),
    });
    return {
      tasks: getChildren(root, "task").map((task) => normalizeTask(task)),
    };
  },
  async get_task(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const taskId = readRequiredPositiveInteger(input.taskId, "taskId");
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}/tasks/${taskId}.xml`,
      context,
      phase: "execute",
    });
    return {
      task: normalizeTask(root),
    };
  },
  async list_project_user_assignments(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}/user_assignments.xml`,
      context,
      phase: "execute",
    });
    return {
      userAssignments: getChildren(root, "user_assignment").map((item) => normalizeUserAssignment(item)),
    };
  },
  async list_project_task_assignments(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}/task_assignments.xml`,
      context,
      phase: "execute",
    });
    return {
      taskAssignments: getChildren(root, "task_assignment").map((item) => normalizeTaskAssignment(item)),
    };
  },
  async list_project_time_entries(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const timeRange = readRequiredTimestampRange(input);
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}/time_entries.xml`,
      context,
      phase: "execute",
      query: compactObject({
        user_ids: joinIdList(input.userIds, "userIds"),
        from_timestamp: timeRange.fromTimestamp,
        to_timestamp: timeRange.toTimestamp,
        task_ids: joinOptionalIdList(input.taskIds, "taskIds"),
        time_entry_type: readOptionalTimeEntryType(input.timeEntryType),
      }),
    });
    return {
      timeEntries: getChildren(root, "time_entry").map((item) => normalizeTimeEntry(item)),
    };
  },
  async get_project_time_entry(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const timeEntryId = readRequiredPositiveInteger(input.timeEntryId, "timeEntryId");
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}/time_entries/${timeEntryId}.xml`,
      context,
      phase: "execute",
    });
    return {
      timeEntry: normalizeTimeEntry(root),
    };
  },
  async get_project_time_report(input, context) {
    const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
    const reportType = readRequiredReportType(input.reportType);
    const timeRange = readRequiredTimestampRange(input);
    const root = await requestWorksnapsXml({
      path: `/projects/${projectId}/reports`,
      context,
      phase: "execute",
      query: compactObject({
        name: reportType,
        from_timestamp: timeRange.fromTimestamp,
        to_timestamp: timeRange.toTimestamp,
        user_ids: joinIdList(input.userIds, "userIds"),
        task_ids: joinOptionalIdList(input.taskIds, "taskIds"),
        time_entry_type: readOptionalTimeEntryType(input.timeEntryType),
      }),
    });
    return {
      reportType,
      reportLines: getReportLines(root).map((item) => normalizeReportLine(item)),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, worksnapsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const root = await requestWorksnapsXml({
      path: worksnapsValidationPath,
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const user = normalizeCurrentUser(root);
    return {
      profile: {
        accountId: user.id === undefined ? "worksnaps-api-token" : String(user.id),
        displayName: buildUserLabel(user) ?? "Worksnaps API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: worksnapsApiBaseUrl,
        validationEndpoint: worksnapsValidationPath,
        userId: user.id,
        login: user.login,
        email: user.email,
        timezoneId: user.timezoneId,
        timezoneName: user.timezoneName,
      }),
    };
  },
};

async function requestWorksnapsXml(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
  query?: Record<string, string | undefined>;
}): Promise<XmlNode> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildWorksnapsUrl(input.path, input.query), {
      method: "GET",
      headers: buildWorksnapsHeaders(input.context.apiKey),
      signal: timeout.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw createWorksnapsError(response.status, text, input.phase);
    }
    if (text.trim() === "") {
      throw new ProviderRequestError(502, "Worksnaps returned an empty response");
    }
    return parseXmlDocument(text);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Worksnaps request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Worksnaps request failed: ${error.message}` : "Worksnaps request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildWorksnapsUrl(path: string, query?: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${worksnapsApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildWorksnapsHeaders(apiKey: string): Headers {
  return new Headers({
    accept: "application/xml",
    authorization: `Basic ${Buffer.from(`${apiKey}:ignored`).toString("base64")}`,
    "user-agent": providerUserAgent,
  });
}

function createWorksnapsError(status: number, body: string, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractWorksnapsErrorMessage(body) ?? `Worksnaps request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractWorksnapsErrorMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    const root = parseXmlDocument(trimmed);
    return (
      readElementText(root, "error_string") ??
      readElementText(root, "message") ??
      readElementText(root, "error") ??
      undefined
    );
  } catch {
    return trimmed;
  }
}

function normalizeCurrentUser(root: XmlNode): Record<string, unknown> {
  return compactObject({
    id: readRequiredInteger(root, "id"),
    login: readRequiredString(root, "login"),
    firstName: readOptionalStringElement(root, "first_name"),
    lastName: readOptionalStringElement(root, "last_name"),
    email: readOptionalStringElement(root, "email"),
    timezoneId: optionalInteger(readElementText(root, "timezone_id")),
    timezoneName: readOptionalStringElement(root, "timezone_name"),
    isInDaylightTime: readOptionalBooleanElement(root, "is_in_daylight_time"),
    raw: convertXmlNodeToValue(root),
  });
}

function normalizeProject(root: XmlNode): Record<string, unknown> {
  const userAssignmentsNode = getFirstChild(root, "user_assignments");
  return compactObject({
    id: readRequiredInteger(root, "id"),
    name: readRequiredString(root, "name"),
    description: readOptionalStringElement(root, "description"),
    status: readOptionalStringElement(root, "status"),
    userAssignments: userAssignmentsNode
      ? getChildren(userAssignmentsNode, "user_assignment").map((item) => normalizeUserAssignment(item))
      : undefined,
    raw: convertXmlNodeToRecord(root),
  });
}

function normalizeTask(root: XmlNode): Record<string, unknown> {
  const taskAssignmentsNode = getFirstChild(root, "task_assignments");
  return compactObject({
    id: readRequiredInteger(root, "id"),
    name: readRequiredString(root, "name"),
    description: readOptionalStringElement(root, "description"),
    taskAssignments: taskAssignmentsNode
      ? getChildren(taskAssignmentsNode, "task_assignment").map((item) => normalizeTaskAssignment(item))
      : undefined,
    raw: convertXmlNodeToRecord(root),
  });
}

function normalizeUserAssignment(root: XmlNode): Record<string, unknown> {
  return compactObject({
    id: readRequiredInteger(root, "id"),
    projectId: readRequiredInteger(root, "project_id"),
    userId: readRequiredInteger(root, "user_id"),
    userFirstName: readOptionalStringElement(root, "user_first_name"),
    userLastName: readOptionalStringElement(root, "user_last_name"),
    userEmail: readOptionalStringElement(root, "user_email"),
    role: readOptionalStringElement(root, "role"),
    raw: convertXmlNodeToRecord(root),
  });
}

function normalizeTaskAssignment(root: XmlNode): Record<string, unknown> {
  return {
    id: readRequiredInteger(root, "id"),
    projectId: readRequiredInteger(root, "project_id"),
    taskId: readRequiredInteger(root, "task_id"),
    userId: readRequiredInteger(root, "user_id"),
    raw: convertXmlNodeToRecord(root),
  };
}

function normalizeTimeEntry(root: XmlNode): Record<string, unknown> {
  return compactObject({
    id: readRequiredInteger(root, "id"),
    loggedTimestamp: readOptionalStringElement(root, "logged_timestamp"),
    fromTimestamp: readOptionalStringElement(root, "from_timestamp"),
    durationInMinutes: optionalInteger(readElementText(root, "duration_in_minutes")),
    type: readOptionalStringElement(root, "type"),
    projectId: optionalInteger(readElementText(root, "project_id")),
    userId: optionalInteger(readElementText(root, "user_id")),
    taskId: optionalInteger(readElementText(root, "task_id")),
    userComment: readOptionalStringElement(root, "user_comment"),
    thumbnailUrl: readOptionalStringElement(root, "thumbnail_url"),
    webcamUrl: readOptionalStringElement(root, "webcam_url"),
    activityLevel: optionalInteger(readElementText(root, "activity_level")),
    raw: convertXmlNodeToRecord(root),
  });
}

function normalizeReportLine(root: XmlNode): Record<string, unknown> {
  return compactObject({
    userId: readRequiredInteger(root, "user_id"),
    projectId: readRequiredInteger(root, "project_id"),
    durationInMinutes: readRequiredInteger(root, "duration_in_minutes"),
    taskId: optionalInteger(readElementText(root, "task_id")),
    taskName: readOptionalStringElement(root, "task_name"),
    userComment: readOptionalStringElement(root, "user_comment"),
    timeEntryType: readOptionalStringElement(root, "time_entry_type") ?? readOptionalStringElement(root, "type"),
    raw: convertXmlNodeToRecord(root),
  });
}

function getReportLines(root: XmlNode): XmlNode[] {
  const summaryLineItems = getChildren(root, "summary_line_item");
  if (summaryLineItems.length > 0) {
    return summaryLineItems;
  }
  const lineItems = getChildren(root, "line_item");
  return lineItems.length > 0 ? lineItems : [];
}

function buildUserLabel(user: Record<string, unknown>): string | undefined {
  const firstName = optionalString(user.firstName);
  const lastName = optionalString(user.lastName);
  const fullName = [firstName, lastName].filter((part) => part && part.trim() !== "").join(" ");
  return fullName || optionalString(user.login) || optionalString(user.email);
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function readRequiredTimestampString(value: unknown, fieldName: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const parsed = Number(trimmed);
  if (trimmed === "" || !Number.isSafeInteger(parsed) || parsed < 0 || parsed % 600 !== 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a Unix timestamp string on a 10-minute boundary`);
  }
  return trimmed;
}

function readRequiredTimestampRange(input: Record<string, unknown>): { fromTimestamp: string; toTimestamp: string } {
  const fromTimestamp = readRequiredTimestampString(input.fromTimestamp, "fromTimestamp");
  const toTimestamp = readRequiredTimestampString(input.toTimestamp, "toTimestamp");
  if (Number(fromTimestamp) > Number(toTimestamp)) {
    throw new ProviderRequestError(400, "fromTimestamp must be less than or equal to toTimestamp");
  }
  return { fromTimestamp, toTimestamp };
}

function joinIdList(value: unknown, fieldName: string): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }
  return value.map((item) => readRequiredPositiveInteger(item, fieldName)).join(";");
}

function joinOptionalIdList(value: unknown, fieldName: string): string | undefined {
  return value == null ? undefined : joinIdList(value, fieldName);
}

function readRequiredReportType(value: unknown): "time_entries" | "time_summary" {
  if (value === "time_entries" || value === "time_summary") {
    return value;
  }
  throw new ProviderRequestError(400, "reportType must be time_entries or time_summary");
}

function readOptionalTimeEntryType(value: unknown): "online" | "offline" | undefined {
  if (value == null) {
    return undefined;
  }
  if (value === "online" || value === "offline") {
    return value;
  }
  throw new ProviderRequestError(400, "timeEntryType must be online or offline");
}

function readOptionalBooleanFlag(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, "boolean flag must be true or false");
  }
  return value ? "1" : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readRequiredInteger(root: XmlNode, name: string): number {
  const value = optionalInteger(readElementText(root, name));
  if (value === undefined) {
    throw new ProviderRequestError(502, `invalid worksnaps ${name} response`);
  }
  return value;
}

function readRequiredString(root: XmlNode, name: string): string {
  const value = readElementText(root, name)?.trim();
  if (!value) {
    throw new ProviderRequestError(502, `invalid worksnaps ${name} response`);
  }
  return value;
}

function readOptionalStringElement(root: XmlNode, name: string): string | undefined {
  const value = readElementText(root, name)?.trim();
  return value === "" ? undefined : value;
}

function readOptionalBooleanElement(root: XmlNode, name: string): boolean | undefined {
  const value = readElementText(root, name)?.trim().toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function parseXmlDocument(xml: string): XmlNode {
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let cursor = 0;

  while (cursor < xml.length) {
    const tagStart = xml.indexOf("<", cursor);
    if (tagStart === -1) {
      appendXmlText(stack, xml.slice(cursor));
      break;
    }

    appendXmlText(stack, xml.slice(cursor, tagStart));
    const tagEnd = xml.indexOf(">", tagStart + 1);
    if (tagEnd === -1) {
      throw new ProviderRequestError(502, "failed to parse worksnaps xml response");
    }

    const rawTag = xml.slice(tagStart + 1, tagEnd).trim();
    cursor = tagEnd + 1;

    if (!rawTag || rawTag.startsWith("?") || rawTag.startsWith("!")) {
      continue;
    }

    if (rawTag.startsWith("/")) {
      const closingName = normalizeXmlTagName(rawTag.slice(1));
      const current = stack.pop();
      if (!current || current.name !== closingName) {
        throw new ProviderRequestError(502, "failed to parse worksnaps xml response");
      }
      if (stack.length === 0) {
        if (root) {
          throw new ProviderRequestError(502, "failed to parse worksnaps xml response");
        }
        root = current;
      } else {
        stack[stack.length - 1]!.children.push(current);
      }
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const tagContent = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const spaceIndex = tagContent.indexOf(" ");
    const tagName = normalizeXmlTagName(spaceIndex === -1 ? tagContent : tagContent.slice(0, spaceIndex));
    const node: XmlNode = {
      name: tagName,
      children: [],
      text: "",
    };

    if (selfClosing) {
      if (stack.length === 0) {
        if (root) {
          throw new ProviderRequestError(502, "failed to parse worksnaps xml response");
        }
        root = node;
      } else {
        stack[stack.length - 1]!.children.push(node);
      }
      continue;
    }

    stack.push(node);
  }

  if (stack.length !== 0 || !root) {
    throw new ProviderRequestError(502, "failed to parse worksnaps xml response");
  }
  return root;
}

function appendXmlText(stack: XmlNode[], value: string): void {
  const current = stack[stack.length - 1];
  if (current) {
    current.text += decodeXmlEntities(value);
  }
}

function normalizeXmlTagName(value: string): string {
  const trimmed = value.trim();
  const colonIndex = trimmed.indexOf(":");
  return colonIndex === -1 ? trimmed : trimmed.slice(colonIndex + 1);
}

function decodeXmlEntities(value: string): string {
  return decodeNumericXmlEntities(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function decodeNumericXmlEntities(value: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const marker = value.indexOf("&#", cursor);
    if (marker === -1) {
      output += value.slice(cursor);
      break;
    }

    const end = value.indexOf(";", marker + 2);
    if (end === -1) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, marker);
    const rawReference = value.slice(marker + 2, end);
    output += decodeNumericXmlEntity(rawReference) ?? value.slice(marker, end + 1);
    cursor = end + 1;
  }
  return output;
}

function decodeNumericXmlEntity(value: string): string | null {
  const lowerValue = value.toLowerCase();
  const isHex = lowerValue.startsWith("x");
  const digits = isHex ? value.slice(1) : value;
  if (digits === "" || !hasOnlyDigits(digits, { allowHex: isHex })) {
    return null;
  }
  const parsed = Number.parseInt(digits, isHex ? 16 : 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x10ffff) {
    return null;
  }
  try {
    return String.fromCodePoint(parsed);
  } catch {
    return null;
  }
}

function getChildren(parent: XmlNode | null | undefined, localName: string): XmlNode[] {
  return parent ? parent.children.filter((child) => child.name === localName) : [];
}

function getFirstChild(parent: XmlNode | null | undefined, localName: string): XmlNode | null {
  return getChildren(parent, localName)[0] ?? null;
}

function readElementText(parent: XmlNode | null | undefined, localName: string): string | null {
  const child = getFirstChild(parent, localName);
  return child?.text.trim() || null;
}

function convertXmlNodeToValue(node: XmlNode): unknown {
  if (node.children.length === 0) {
    return coerceXmlScalar(node.text.trim());
  }
  return convertXmlNodeToRecord(node);
}

function convertXmlNodeToRecord(node: XmlNode): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  const grouped = new Map<string, XmlNode[]>();
  for (const child of node.children) {
    const existing = grouped.get(child.name);
    if (existing) {
      existing.push(child);
    } else {
      grouped.set(child.name, [child]);
    }
  }
  for (const [name, children] of grouped.entries()) {
    if (children.length === 1) {
      record[name] = convertXmlNodeToValue(children[0]!);
    } else {
      record[name] = children.map((child) => convertXmlNodeToValue(child));
    }
  }
  return record;
}

function coerceXmlScalar(value: string): unknown {
  if (value === "") {
    return "";
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (isIntegerString(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  return value;
}

function isIntegerString(value: string): boolean {
  if (value === "") {
    return false;
  }
  const startIndex = value[0] === "-" ? 1 : 0;
  if (startIndex === value.length) {
    return false;
  }
  return hasOnlyDigits(value.slice(startIndex), { allowHex: false });
}

function hasOnlyDigits(value: string, options: { allowHex: boolean }): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isDecimalDigit = code >= 48 && code <= 57;
    const isLowerHexDigit = code >= 97 && code <= 102;
    const isUpperHexDigit = code >= 65 && code <= 70;
    if (!isDecimalDigit && (!options.allowHex || (!isLowerHexDigit && !isUpperHexDigit))) {
      return false;
    }
  }
  return true;
}
