import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { FormsiteActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "formsite";
const formsiteDefaultRequestTimeoutMs = 30_000;
const formsiteValidationPathSuffix = "/forms";

type FormsiteRequestPhase = "validate" | "execute";
type FormsiteQueryValue = string | number | boolean | null | undefined | Record<string, string>;

interface FormsiteActionContext {
  apiKey: string;
  apiBaseUrl: string;
  defaultUserDir?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FormsiteRequestInput {
  path: string;
  phase: FormsiteRequestPhase;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, FormsiteQueryValue>;
  body?: URLSearchParams;
  notFoundAsInvalidInput?: boolean;
}

type FormsiteJsonRecord = Record<string, unknown>;
type FormsiteActionHandler = (input: Record<string, unknown>, context: FormsiteActionContext) => Promise<unknown>;

export const formsiteActionHandlers: Record<FormsiteActionName, FormsiteActionHandler> = {
  list_forms(input, context) {
    return listForms(input, context);
  },
  get_form(input, context) {
    return getForm(input, context);
  },
  get_form_items(input, context) {
    return getFormItems(input, context);
  },
  get_form_results(input, context) {
    return getFormResults(input, context);
  },
  list_webhooks(input, context) {
    return listWebhooks(input, context);
  },
  upsert_webhook(input, context) {
    return upsertWebhook(input, context);
  },
  delete_webhook(input, context) {
    return deleteWebhook(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FormsiteActionContext>({
  service,
  handlers: formsiteActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FormsiteActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeFormsiteApiBaseUrl(credential.values.apiBaseUrl),
      defaultUserDir: normalizeOptionalUserDir(credential.values.userDir),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeFormsiteApiBaseUrl(credential.values.apiBaseUrl);
  },
  auth: {
    type: "api_key_authorization",
    prefix: "bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = normalizeFormsiteApiBaseUrl(input.values.apiBaseUrl);
    const defaultUserDir = normalizeOptionalUserDir(input.values.userDir);
    const payload = await requestFormsiteJson(
      {
        apiKey: input.apiKey,
        apiBaseUrl,
        fetcher,
        signal,
      },
      {
        path: defaultUserDir ? buildUserPath(defaultUserDir, "/forms") : formsiteValidationPathSuffix,
        phase: "validate",
      },
    );
    const forms = requireArray(payload.forms, "forms");

    return {
      profile: {
        accountId: `${apiBaseUrl}:${defaultUserDir ?? "unknown-user-dir"}`,
        displayName: defaultUserDir ? `Formsite ${defaultUserDir}` : "Formsite API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: formsiteValidationPathSuffix,
        userDir: defaultUserDir,
        formCount: forms.length,
      }),
    };
  },
};

async function listForms(input: Record<string, unknown>, context: FormsiteActionContext): Promise<unknown> {
  const userDir = resolveUserDir(input, context);
  const payload = await requestFormsiteJson(context, {
    path: buildUserPath(userDir, "/forms"),
    phase: "execute",
  });

  return {
    forms: requireArray(payload.forms, "forms").map((entry) => normalizeForm(requireObject(entry, "form"))),
  };
}

async function getForm(input: Record<string, unknown>, context: FormsiteActionContext): Promise<unknown> {
  const userDir = resolveUserDir(input, context);
  const formDir = requireInputString(input, "form_dir");
  const payload = await requestFormsiteJson(context, {
    path: buildUserPath(userDir, `/forms/${encodeURIComponent(formDir)}`),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const forms = requireArray(payload.forms, "forms");
  const first = forms[0];
  if (!first) {
    throw new ProviderRequestError(502, "Formsite returned no form for get_form", payload);
  }

  return {
    form: normalizeForm(requireObject(first, "form")),
  };
}

async function getFormItems(input: Record<string, unknown>, context: FormsiteActionContext): Promise<unknown> {
  const userDir = resolveUserDir(input, context);
  const formDir = requireInputString(input, "form_dir");
  const payload = await requestFormsiteJson(context, {
    path: buildUserPath(userDir, `/forms/${encodeURIComponent(formDir)}/items`),
    phase: "execute",
    query: compactObject({
      results_labels: optionalString(input.results_labels),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    items: requireArray(payload.items, "items").map((entry) => normalizeFormItem(requireObject(entry, "item"))),
  };
}

async function getFormResults(input: Record<string, unknown>, context: FormsiteActionContext): Promise<unknown> {
  const userDir = resolveUserDir(input, context);
  const formDir =
    optionalString(input.form_id) ?? optionalString(input.form_dir) ?? requireInputString(input, "form_id");
  const payload = await requestFormsiteJson(context, {
    path: buildUserPath(userDir, `/forms/${encodeURIComponent(formDir)}/results`),
    phase: "execute",
    query: compactObject({
      limit: readOptionalNumberString(input.limit),
      page: readOptionalNumberString(input.page),
      after_date: optionalString(input.after_date),
      before_date: optionalString(input.before_date),
      after_id: optionalString(input.after_id),
      before_id: optionalString(input.before_id),
      sort_id: optionalString(input.sort_id),
      results_view: optionalString(input.results_view),
      sort_direction: optionalString(input.sort_direction),
      search_method: optionalString(input.search_method),
      search_equals: readSearchClauses(input.search_equals, "search_equals"),
      search_contains: readSearchClauses(input.search_contains, "search_contains"),
      search_begins: readSearchClauses(input.search_begins, "search_begins"),
      search_ends: readSearchClauses(input.search_ends, "search_ends"),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    results: requireArray(payload.results, "results").map((entry) =>
      normalizeFormResult(requireObject(entry, "result")),
    ),
  };
}

async function listWebhooks(input: Record<string, unknown>, context: FormsiteActionContext): Promise<unknown> {
  const userDir = resolveUserDir(input, context);
  const formDir = requireInputString(input, "form_dir");
  const payload = await requestFormsiteJson(context, {
    path: buildUserPath(userDir, `/forms/${encodeURIComponent(formDir)}/webhooks`),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    webhooks: requireArray(payload.webhooks, "webhooks").map((entry) =>
      normalizeWebhook(requireObject(entry, "webhook")),
    ),
  };
}

async function upsertWebhook(input: Record<string, unknown>, context: FormsiteActionContext): Promise<unknown> {
  const userDir = resolveUserDir(input, context);
  const formDir = requireInputString(input, "form_dir");
  const body = new URLSearchParams();
  body.set("event", requireInputString(input, "event"));
  body.set("url", requireInputString(input, "url"));
  const handshakeKey = optionalString(input.handshake_key);
  if (handshakeKey) {
    body.set("handshake_key", handshakeKey);
  }

  const payload = await requestFormsiteJson(context, {
    path: buildUserPath(userDir, `/forms/${encodeURIComponent(formDir)}/webhooks`),
    phase: "execute",
    method: "POST",
    body,
    notFoundAsInvalidInput: true,
  });
  const webhook = payload.webhook;
  if (webhook) {
    return {
      webhook: normalizeWebhook(requireObject(webhook, "webhook")),
    };
  }

  const webhooks = requireArray(payload.webhooks, "webhooks");
  const first = webhooks[0];
  if (!first) {
    throw new ProviderRequestError(502, "Formsite returned no webhook for upsert_webhook", payload);
  }

  return {
    webhook: normalizeWebhook(requireObject(first, "webhook")),
  };
}

async function deleteWebhook(input: Record<string, unknown>, context: FormsiteActionContext): Promise<unknown> {
  const userDir = resolveUserDir(input, context);
  const formDir = requireInputString(input, "form_dir");
  const body = new URLSearchParams();
  body.set("url", requireInputString(input, "url"));

  await requestFormsiteJson(context, {
    path: buildUserPath(userDir, `/forms/${encodeURIComponent(formDir)}/webhooks`),
    phase: "execute",
    method: "DELETE",
    body,
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
  };
}

async function requestFormsiteJson(
  context: Pick<FormsiteActionContext, "apiKey" | "apiBaseUrl" | "fetcher" | "signal">,
  input: FormsiteRequestInput,
): Promise<FormsiteJsonRecord> {
  const response = await formsiteFetch(context, input);
  if (!response.ok) {
    throw await toFormsiteError(response, input.phase, input.notFoundAsInvalidInput);
  }

  try {
    const payload = (await response.json()) as unknown;
    return requireObject(payload, "JSON response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Formsite returned invalid JSON", error);
  }
}

async function formsiteFetch(
  context: Pick<FormsiteActionContext, "apiKey" | "apiBaseUrl" | "fetcher" | "signal">,
  input: FormsiteRequestInput,
): Promise<Response> {
  const url = buildFormsiteUrl(context.apiBaseUrl, input.path, input.query);
  const headers = new Headers({
    accept: "application/json",
    authorization: `bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (input.body) {
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  }

  const timeoutSignal = AbortSignal.timeout(formsiteDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    return await context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body,
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, `Formsite ${input.path} request timed out after 30 seconds`, error);
    }
    const message = error instanceof Error ? error.message : "Formsite request failed";
    throw new ProviderRequestError(502, message || "Formsite request failed", error);
  }
}

function buildFormsiteUrl(apiBaseUrl: string, path: string, query?: Record<string, FormsiteQueryValue>): URL {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "object") {
      appendSearchParams(url, key, value);
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function appendSearchParams(url: URL, operator: string, clauses: Record<string, string>): void {
  for (const [fieldId, value] of Object.entries(clauses)) {
    url.searchParams.set(`${operator}[${fieldId}]`, value);
  }
}

async function toFormsiteError(
  response: Response,
  phase: FormsiteRequestPhase,
  notFoundAsInvalidInput: boolean | undefined,
): Promise<ProviderRequestError> {
  const message = await readFormsiteErrorMessage(response);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 400 || response.status === 422 || (notFoundAsInvalidInput && response.status === 404)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message);
}

async function readFormsiteErrorMessage(response: Response): Promise<string> {
  try {
    const payload = optionalRecord(await response.json());
    const message =
      optionalString(payload?.error) ?? optionalString(payload?.message) ?? optionalString(payload?.detail);
    if (message) {
      return message;
    }
  } catch {}

  return response.statusText || "Formsite request failed";
}

function normalizeFormsiteApiBaseUrl(value: string | undefined): string {
  if (!value) {
    throw new ProviderRequestError(400, "apiBaseUrl is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid absolute URL");
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  if (!normalizedPath.endsWith("/api/v2")) {
    throw new ProviderRequestError(
      400,
      "apiBaseUrl must point to the Formsite API v2 base URL, such as https://fs8.formsite.com/api/v2",
    );
  }

  return `${url.origin}${normalizedPath}`;
}

function normalizeOptionalUserDir(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveUserDir(input: Record<string, unknown>, context: FormsiteActionContext): string {
  const fromInput = normalizeOptionalUserDir(optionalString(input.user_dir));
  const userDir = fromInput ?? context.defaultUserDir;
  if (!userDir) {
    throw new ProviderRequestError(400, "user_dir is required because the connection does not have a default userDir");
  }
  return userDir;
}

function buildUserPath(userDir: string, suffix: string): string {
  return `/${encodeURIComponent(userDir)}${suffix}`;
}

function requireObject(value: unknown, fieldName: string): FormsiteJsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Formsite returned invalid ${fieldName}`, value);
  }
  return value as FormsiteJsonRecord;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Formsite returned invalid ${fieldName}`, value);
  }
  return value;
}

function requireInputString(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalNumberString(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}

function readSearchClauses(value: unknown, fieldName: string): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`, value);
  }
  const normalized: Record<string, string> = {};
  for (const [fieldId, clauseValue] of Object.entries(record)) {
    const normalizedFieldId = fieldId.trim();
    const normalizedValue = optionalString(clauseValue);
    if (!normalizedFieldId || !normalizedValue) {
      throw new ProviderRequestError(400, `${fieldName} must contain non-empty keys and values`, value);
    }
    normalized[normalizedFieldId] = normalizedValue;
  }
  return normalized;
}

function normalizeForm(input: FormsiteJsonRecord): Record<string, unknown> {
  return compactObject({
    description: optionalString(input.description),
    directory: requireResponseString(input.directory, "form.directory"),
    name: requireResponseString(input.name, "form.name"),
    publish: normalizeOptionalPublish(input.publish),
    state: optionalString(input.state),
    stats: normalizeOptionalStats(input.stats),
  });
}

function normalizeOptionalPublish(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    embed_code: optionalString(record.embed_code),
    link: optionalString(record.link),
  });
}

function normalizeOptionalStats(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    filesSize: optionalInteger(record.filesSize),
    resultsCount: optionalInteger(record.resultsCount),
  });
}

function normalizeFormItem(input: FormsiteJsonRecord): Record<string, unknown> {
  return compactObject({
    id: requireResponseString(input.id, "item.id"),
    position: requireResponseInteger(input.position, "item.position"),
    label: requireResponseString(input.label, "item.label"),
    children: normalizeOptionalStringArray(input.children),
  });
}

function normalizeFormResult(input: FormsiteJsonRecord): Record<string, unknown> {
  return compactObject({
    id: requireResponseString(input.id, "result.id"),
    date_start: optionalString(input.date_start),
    date_finish: optionalString(input.date_finish),
    date_update: optionalString(input.date_update),
    login_email: optionalString(input.login_email),
    login_username: optionalString(input.login_username),
    payment_amount: optionalNumber(input.payment_amount),
    payment_status: optionalString(input.payment_status),
    result_status: optionalString(input.result_status),
    user_browser: optionalString(input.user_browser),
    user_device: optionalString(input.user_device),
    user_ip: optionalString(input.user_ip),
    user_referrer: optionalString(input.user_referrer),
    items: requireArray(input.items, "result.items").map((entry) =>
      normalizeFormResultItem(requireObject(entry, "result item")),
    ),
  });
}

function normalizeFormResultItem(input: FormsiteJsonRecord): Record<string, unknown> {
  return compactObject({
    id: requireResponseString(input.id, "result item.id"),
    position: requireResponseInteger(input.position, "result item.position"),
    value: optionalString(input.value),
    values: normalizeOptionalValuesArray(input.values),
  });
}

function normalizeWebhook(input: FormsiteJsonRecord): Record<string, unknown> {
  return compactObject({
    event: requireResponseString(input.event, "webhook.event"),
    handshake_key: optionalString(input.handshake_key),
    url: requireResponseString(input.url, "webhook.url"),
  });
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((entry) => optionalString(entry)).filter((entry): entry is string => typeof entry === "string");
}

function normalizeOptionalValuesArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((entry) => {
    const record = requireObject(entry, "result item.values");
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, normalizePrimitive(child)]));
  });
}

function normalizePrimitive(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

function requireResponseString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Formsite returned invalid ${fieldName}`, value);
  }
  return text;
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `Formsite returned invalid ${fieldName}`, value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
