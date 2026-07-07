import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { JotformActionName } from "./actions.ts";

import {
  compactObject,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "jotform";
const jotformApiBaseUrl = "https://api.jotform.com";
const jotformRequestTimeoutMs = 30_000;

type JotformRequestPhase = "validate" | "execute";
type JotformQueryValue = string | number | undefined;
type JotformActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type JotformActionHandler = (input: Record<string, unknown>, context: JotformActionContext) => Promise<unknown>;

interface JotformEnvelope {
  responseCode?: unknown;
  message?: unknown;
  content?: unknown;
  resultSet?: unknown;
  "limit-left"?: unknown;
}

interface JotformRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  phase: JotformRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  query?: Record<string, JotformQueryValue>;
  body?: URLSearchParams;
}

interface NormalizedJotformUser extends Record<string, unknown> {
  username: string;
  is_verified: boolean;
  webhooks: string[];
  doNotClone: boolean;
  name?: string;
  email?: string;
  website?: string;
  time_zone?: string;
  account_type?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  usage?: string;
  industry?: string;
  company?: string;
  language?: string;
  avatarUrl?: string;
}

type NormalizedJotformUserStringField =
  | "name"
  | "email"
  | "website"
  | "time_zone"
  | "account_type"
  | "status"
  | "created_at"
  | "updated_at"
  | "usage"
  | "industry"
  | "company"
  | "language"
  | "avatarUrl";

export const jotformActionHandlers: Record<JotformActionName, JotformActionHandler> = {
  async get_current_user(_input, context) {
    const envelope = await requestJotformEnvelope({
      ...context,
      path: "/user",
      phase: "execute",
    });

    return {
      user: normalizeJotformUser(requireEnvelopeContentObject(envelope, "/user")),
    };
  },
  async list_forms(input, context) {
    const envelope = await requestJotformEnvelope({
      ...context,
      path: "/user/forms",
      phase: "execute",
      query: compactObject({
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        offset: readOptionalNonNegativeInteger(input.offset, "offset"),
        search: optionalString(input.search),
        folder: optionalString(input.folder),
        orderby: optionalString(input.orderby),
        sorting: optionalString(input.sorting),
      }),
    });

    return compactObject({
      forms: requireEnvelopeContentArray(envelope, "/user/forms").map(normalizeJotformForm),
      resultSet: normalizeJotformResultSet(envelope.resultSet),
    });
  },
  async get_form(input, context) {
    const formId = readRequiredString(input.formId, "formId");
    const envelope = await requestJotformEnvelope({
      ...context,
      path: `/form/${encodeURIComponent(formId)}`,
      phase: "execute",
    });

    return {
      form: normalizeJotformForm(requireSingleContentItem(envelope, `/form/${formId}`)),
    };
  },
  async list_form_questions(input, context) {
    const formId = readRequiredString(input.formId, "formId");
    const envelope = await requestJotformEnvelope({
      ...context,
      path: `/form/${encodeURIComponent(formId)}/questions`,
      phase: "execute",
    });

    return {
      questions: normalizeQuestionMap(requireEnvelopeContentObject(envelope, `/form/${formId}/questions`)),
    };
  },
  async list_form_submissions(input, context) {
    const formId = readRequiredString(input.formId, "formId");
    const envelope = await requestJotformEnvelope({
      ...context,
      path: `/form/${encodeURIComponent(formId)}/submissions`,
      phase: "execute",
      query: compactObject({
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        offset: readOptionalNonNegativeInteger(input.offset, "offset"),
      }),
    });

    return {
      submissions: requireEnvelopeContentArray(envelope, `/form/${formId}/submissions`).map(normalizeSubmission),
    };
  },
  async get_submission(input, context) {
    const submissionId = readRequiredString(input.submissionId, "submissionId");
    const envelope = await requestJotformEnvelope({
      ...context,
      path: `/submission/${encodeURIComponent(submissionId)}`,
      phase: "execute",
    });

    return {
      submission: normalizeSubmission(requireEnvelopeContentObject(envelope, `/submission/${submissionId}`)),
    };
  },
  async create_submission(input, context) {
    const formId = readRequiredString(input.formId, "formId");
    const answers = requiredRecord(input.answers, "answers");
    if (Object.keys(answers).length === 0) {
      throw new ProviderRequestError(400, "At least one answer is required.");
    }

    const body = new URLSearchParams();
    for (const [questionId, value] of Object.entries(answers)) {
      appendSubmissionAnswer(body, questionId, value);
    }
    if (typeof input.markAsNew === "boolean") {
      body.set("submission[new]", input.markAsNew ? "1" : "0");
    }
    if (typeof input.flag === "boolean") {
      body.set("submission[flag]", input.flag ? "1" : "0");
    }

    const envelope = await requestJotformEnvelope({
      ...context,
      path: `/form/${encodeURIComponent(formId)}/submissions`,
      phase: "execute",
      method: "POST",
      body,
    });
    const content = requireEnvelopeContentObject(envelope, `/form/${formId}/submissions`);
    const submissionId =
      optionalString(content.submissionID) ?? optionalString(content.submissionId) ?? optionalString(content.id);
    const submissionUrl = optionalString(content.URL) ?? optionalString(content.url);
    if (!submissionId || !submissionUrl) {
      throw new ProviderRequestError(502, "malformed Jotform create submission response", content);
    }

    return {
      submissionId,
      submissionUrl,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, jotformActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: jotformApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "APIKEY",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const envelope = await requestJotformEnvelope({
      apiKey: input.apiKey,
      fetcher,
      signal,
      path: "/user",
      phase: "validate",
    });
    const user = normalizeJotformUser(requireEnvelopeContentObject(envelope, "/user"));

    return {
      profile: {
        accountId: user.email ?? user.username,
        displayName: user.name ?? user.email ?? user.username,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: jotformApiBaseUrl,
        validationEndpoint: "/user",
        username: user.username,
        email: user.email,
        account_type: user.account_type,
        status: user.status,
      }),
    };
  },
};

async function requestJotformEnvelope(input: JotformRequestInput): Promise<JotformEnvelope> {
  const url = new URL(input.path, jotformApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    APIKEY: input.apiKey,
    "user-agent": providerUserAgent,
  });
  if (input.body) {
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  }

  const timeout = createProviderTimeout(input.signal, jotformRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(502, `Jotform ${input.path} request timed out after 30 seconds`, error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? error.message || "Jotform request failed" : "Jotform request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await parseJotformPayload(response);
  const message = readJotformMessage(payload, response.statusText);
  const responseCode = normalizeIntegerField(payload.responseCode) ?? response.status;
  if (!response.ok || responseCode >= 400) {
    throw buildJotformError(responseCode, message, input.phase, payload);
  }

  return payload;
}

async function parseJotformPayload(response: Response): Promise<JotformEnvelope> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Jotform returned a non-object response", payload);
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Jotform returned a non-JSON response", error);
  }
}

function readJotformMessage(payload: JotformEnvelope, fallback: string): string {
  return (
    optionalString(payload.message) ??
    optionalString(optionalRecord(payload.content)?.message) ??
    (fallback || "Jotform request failed")
  );
}

function buildJotformError(
  status: number,
  message: string,
  phase: JotformRequestPhase,
  payload: unknown,
): ProviderRequestError {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function requireEnvelopeContentObject(envelope: JotformEnvelope, path: string): Record<string, unknown> {
  const content = optionalRecord(envelope.content);
  if (!content) {
    throw new ProviderRequestError(502, `malformed Jotform response from ${path}`, envelope);
  }
  return content;
}

function requireEnvelopeContentArray(envelope: JotformEnvelope, path: string): Array<Record<string, unknown>> {
  if (!Array.isArray(envelope.content)) {
    throw new ProviderRequestError(502, `malformed Jotform response from ${path}`, envelope);
  }

  return envelope.content.map((item, index) => requireProviderRecord(item, `${path} content[${index}]`));
}

function requireSingleContentItem(envelope: JotformEnvelope, path: string): Record<string, unknown> {
  if (Array.isArray(envelope.content)) {
    const firstItem = envelope.content[0];
    if (firstItem == null) {
      throw new ProviderRequestError(400, `Jotform resource not found for ${path}`, envelope);
    }
    return requireProviderRecord(firstItem, `${path} content[0]`);
  }

  return requireEnvelopeContentObject(envelope, path);
}

function normalizeJotformUser(value: Record<string, unknown>): NormalizedJotformUser {
  const webhooks = normalizeWebhookList(value.webhooks);
  const username = optionalString(value.username);
  if (!username) {
    throw new ProviderRequestError(502, "malformed Jotform user payload", value);
  }

  const user: NormalizedJotformUser = {
    username,
    is_verified: normalizeJotformBoolean(value.is_verified) ?? false,
    webhooks,
    doNotClone: normalizeJotformBoolean(value.doNotClone) ?? false,
  };
  assignOptionalUserString(user, "name", value.name);
  assignOptionalUserString(user, "email", value.email);
  assignOptionalUserString(user, "website", value.website);
  assignOptionalUserString(user, "time_zone", value.time_zone);
  assignOptionalUserString(user, "account_type", value.account_type);
  assignOptionalUserString(user, "status", value.status);
  assignOptionalUserString(user, "created_at", value.created_at);
  assignOptionalUserString(user, "updated_at", value.updated_at);
  assignOptionalUserString(user, "usage", value.usage);
  assignOptionalUserString(user, "industry", value.industry);
  assignOptionalUserString(user, "company", value.company);
  assignOptionalUserString(user, "language", value.language);
  assignOptionalUserString(user, "avatarUrl", value.avatarUrl);
  return user;
}

function normalizeJotformForm(value: Record<string, unknown>): Record<string, unknown> {
  const id = optionalString(value.id);
  if (!id) {
    throw new ProviderRequestError(502, "malformed Jotform form payload", value);
  }

  return compactObject({
    id,
    username: optionalString(value.username),
    title: optionalString(value.title),
    height: normalizeIntegerField(value.height),
    status: optionalString(value.status),
    created_at: optionalString(value.created_at),
    updated_at: optionalString(value.updated_at),
    last_submission: optionalString(value.last_submission),
    new: normalizeIntegerField(value.new),
    count: normalizeIntegerField(value.count),
    type: optionalString(value.type),
    favorite: normalizeJotformBoolean(value.favorite),
    archived: normalizeJotformBoolean(value.archived),
    url: optionalString(value.url),
  });
}

function assignOptionalUserString(
  target: NormalizedJotformUser,
  key: NormalizedJotformUserStringField,
  value: unknown,
): void {
  const parsed = optionalString(value);
  if (parsed !== undefined) {
    target[key] = parsed;
  }
}

function normalizeQuestionMap(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([questionId, questionValue]) => [
      questionId,
      normalizeQuestion(requireProviderRecord(questionValue, `question ${questionId}`), questionId),
    ]),
  );
}

function normalizeQuestion(value: Record<string, unknown>, questionId: string): Record<string, unknown> {
  const normalizedSublabels = normalizeStringMap(value.sublabels);
  const type = optionalString(value.type);
  if (!type) {
    throw new ProviderRequestError(502, "malformed Jotform question payload", value);
  }

  return compactObject({
    ...value,
    qid: optionalString(value.qid) ?? questionId,
    type,
    text: optionalString(value.text),
    name: optionalString(value.name),
    order: optionalString(value.order),
    required: optionalString(value.required),
    readonly: optionalString(value.readonly),
    labelAlign: optionalString(value.labelAlign),
    hint: optionalString(value.hint),
    validation: optionalString(value.validation),
    sublabels: normalizedSublabels,
  });
}

function normalizeSubmission(value: Record<string, unknown>): Record<string, unknown> {
  const submissionId = optionalString(value.id);
  const formId = optionalString(value.form_id);
  if (!submissionId || !formId) {
    throw new ProviderRequestError(502, "malformed Jotform submission payload", value);
  }

  return compactObject({
    id: submissionId,
    form_id: formId,
    ip: optionalString(value.ip),
    created_at: optionalString(value.created_at),
    updated_at: optionalString(value.updated_at),
    status: optionalString(value.status),
    new: normalizeJotformBoolean(value.new) ?? false,
    answers: normalizeSubmissionAnswers(value.answers),
    workflowStatus: optionalString(value.workflowStatus),
  });
}

function normalizeSubmissionAnswers(value: unknown): Record<string, unknown> {
  const answers = optionalRecord(value) ?? {};
  return Object.fromEntries(
    Object.entries(answers).map(([questionId, answerValue]) => [
      questionId,
      normalizeSubmissionAnswer(requireProviderRecord(answerValue, `answer ${questionId}`)),
    ]),
  );
}

function normalizeSubmissionAnswer(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    text: optionalString(value.text),
    type: optionalString(value.type),
    answer: value.answer,
    prettyFormat: optionalString(value.prettyFormat),
  });
}

function normalizeJotformResultSet(value: unknown): Record<string, unknown> | undefined {
  const resultSet = optionalRecord(value);
  if (!resultSet) {
    return undefined;
  }

  const offset = normalizeIntegerField(resultSet.offset);
  const limit = normalizeIntegerField(resultSet.limit);
  const count = normalizeIntegerField(resultSet.count);
  if (offset == null || limit == null || count == null) {
    throw new ProviderRequestError(502, "malformed Jotform resultSet payload", resultSet);
  }

  return {
    offset,
    limit,
    count,
  };
}

function normalizeStringMap(value: unknown): Record<string, string> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(record)
      .map(([key, childValue]) => [key, optionalString(childValue)] as [string, string | undefined])
      .filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function normalizeWebhookList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  const rawValue = optionalString(value);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function normalizeIntegerField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const rawValue = optionalString(value);
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function normalizeJotformBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }

  const rawValue = optionalString(value)?.toLowerCase();
  if (!rawValue) {
    return undefined;
  }
  if (rawValue === "1" || rawValue === "yes" || rawValue === "true") {
    return true;
  }
  if (rawValue === "0" || rawValue === "no" || rawValue === "false") {
    return false;
  }
  return undefined;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }

  const parsed = readOptionalNonNegativeInteger(value, fieldName);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }

  const parsed = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (parsed === undefined || parsed < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function appendSubmissionAnswer(body: URLSearchParams, questionId: string, value: unknown): void {
  const normalizedQuestionId = questionId.trim();
  if (!normalizedQuestionId) {
    throw new ProviderRequestError(400, "answers must use non-empty question IDs");
  }

  if (isScalarSubmissionValue(value)) {
    body.append(`submission[${normalizedQuestionId}]`, String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const childValue of value) {
      if (!isScalarSubmissionValue(childValue)) {
        throw new ProviderRequestError(400, `answers.${normalizedQuestionId} contains an unsupported array value`);
      }
      body.append(`submission[${normalizedQuestionId}][]`, String(childValue));
    }
    return;
  }

  const objectValue = optionalRecord(value);
  if (!objectValue) {
    throw new ProviderRequestError(400, `answers.${normalizedQuestionId} must be a scalar, array, or object`);
  }

  for (const [subKey, subValue] of Object.entries(objectValue)) {
    const normalizedSubKey = subKey.trim();
    if (!normalizedSubKey) {
      throw new ProviderRequestError(400, `answers.${normalizedQuestionId} contains an empty compound field key`);
    }
    appendSubmissionField(body, `submission[${normalizedQuestionId}_${normalizedSubKey}]`, subValue);
  }
}

function appendSubmissionField(body: URLSearchParams, fieldName: string, value: unknown): void {
  if (isScalarSubmissionValue(value)) {
    body.append(fieldName, String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const childValue of value) {
      if (!isScalarSubmissionValue(childValue)) {
        throw new ProviderRequestError(400, `${fieldName} contains an unsupported array value`);
      }
      body.append(`${fieldName}[]`, String(childValue));
    }
    return;
  }

  throw new ProviderRequestError(400, `${fieldName} contains an unsupported answer value`);
}

function isScalarSubmissionValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function requireProviderRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} returned invalid object`, value);
  }
  return record;
}
