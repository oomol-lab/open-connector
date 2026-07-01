import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BasinActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "basin";
const basinApiBaseUrl = "https://usebasin.com";
const basinValidationPath = "/api/v1/projects";

type BasinJsonObject = Record<string, unknown>;
type BasinQueryValue = string | number | boolean | undefined;
type BasinMode = "validate" | "execute";
type BasinActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const basinActionHandlers: Record<BasinActionName, BasinActionHandler> = {
  list_projects(input, context) {
    return requestBasinJson({
      context,
      path: "/api/v1/projects",
      query: listQuery(input),
      mode: "execute",
    });
  },
  get_project(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/projects/${encodeURIComponent(requirePositiveInteger(input.project_id, "project_id"))}`,
      mode: "execute",
    });
  },
  create_project(input, context) {
    return requestBasinJson({
      context,
      path: "/api/v1/projects/",
      method: "POST",
      body: {
        project: {
          name: requireString(input.name, "name"),
        },
      },
      mode: "execute",
    });
  },
  update_project(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/projects/${encodeURIComponent(requirePositiveInteger(input.project_id, "project_id"))}`,
      method: "PUT",
      body: {
        project: {
          name: requireString(input.name, "name"),
        },
      },
      mode: "execute",
    });
  },
  delete_project(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/projects/${encodeURIComponent(requirePositiveInteger(input.project_id, "project_id"))}`,
      method: "DELETE",
      mode: "execute",
    });
  },
  list_forms(input, context) {
    return requestBasinJson({
      context,
      path: "/api/v1/forms",
      query: listQuery(input),
      mode: "execute",
    });
  },
  get_form(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/forms/${encodeURIComponent(requireString(input.form_id, "form_id"))}`,
      mode: "execute",
    });
  },
  create_form(input, context) {
    return requestBasinJson({
      context,
      path: "/api/v1/forms/",
      method: "POST",
      body: {
        form: compactObject(pickFormFields(input)),
      },
      mode: "execute",
    });
  },
  update_form(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/forms/${encodeURIComponent(requireString(input.form_id, "form_id"))}`,
      method: "PUT",
      body: {
        form: compactObject(pickFormFields(input)),
      },
      mode: "execute",
    });
  },
  delete_form(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/forms/${encodeURIComponent(requireString(input.form_id, "form_id"))}`,
      method: "DELETE",
      mode: "execute",
    });
  },
  list_submissions(input, context) {
    return requestBasinJson({
      context,
      path: "/api/v1/submissions/",
      query: compactObject({
        form_id: optionalString(input.form_id),
        filter_by: optionalString(input.filter_by),
        query: optionalString(input.query),
        order_by: optionalString(input.order_by),
        date_range: optionalString(input.date_range),
      }),
      mode: "execute",
    });
  },
  get_submission(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/submissions/${encodeURIComponent(requirePositiveInteger(input.submission_id, "submission_id"))}`,
      mode: "execute",
    });
  },
  async delete_submission(input, context) {
    await requestBasinJson({
      context,
      path: `/api/v1/submissions/${encodeURIComponent(requirePositiveInteger(input.submission_id, "submission_id"))}`,
      method: "DELETE",
      mode: "execute",
    });
    return { success: true };
  },
  list_form_webhooks(input, context) {
    return requestBasinJson({
      context,
      path: "/api/v1/form_webhooks",
      query: listQuery(input),
      mode: "execute",
    });
  },
  get_form_webhook(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/form_webhooks/${encodeURIComponent(requirePositiveInteger(input.webhook_id, "webhook_id"))}`,
      mode: "execute",
    });
  },
  create_form_webhook(input, context) {
    return requestBasinJson({
      context,
      path: "/api/v1/form_webhooks/",
      method: "POST",
      body: {
        form_webhook: compactObject(pickWebhookFields(input)),
      },
      mode: "execute",
    });
  },
  update_form_webhook(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/form_webhooks/${encodeURIComponent(requirePositiveInteger(input.webhook_id, "webhook_id"))}`,
      method: "PUT",
      body: {
        form_webhook: compactObject(pickWebhookFields(input)),
      },
      mode: "execute",
    });
  },
  delete_form_webhook(input, context) {
    return requestBasinJson({
      context,
      path: `/api/v1/form_webhooks/${encodeURIComponent(requirePositiveInteger(input.webhook_id, "webhook_id"))}`,
      method: "DELETE",
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: basinActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestBasinJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: basinValidationPath,
      query: {
        page: 1,
      },
      mode: "validate",
    });

    const projects = extractBasinArray(payload, "projects");
    const firstProject = optionalRecord(projects[0]);
    const meta = optionalRecord(payload.meta);
    const projectCount = optionalNumber(meta?.count) ?? projects.length;

    return {
      profile: {
        displayName: "Basin API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: basinApiBaseUrl,
        validationEndpoint: basinValidationPath,
        projectCount,
        firstProjectId: optionalNumber(firstProject?.id),
        firstProjectName: optionalString(firstProject?.name),
      }),
    };
  },
};

function listQuery(input: Record<string, unknown>): Record<string, BasinQueryValue> {
  return compactObject({
    page: optionalNumber(input.page),
    query: optionalString(input.query),
  });
}

function pickFormFields(input: Record<string, unknown>): Record<string, unknown> {
  return {
    name: optionalString(input.name),
    timezone: optionalString(input.timezone),
    project_id: optionalNumber(input.project_id),
    redirect_url: optionalString(input.redirect_url),
    use_ajax: optionalBoolean(input.use_ajax),
    notification_emails: optionalString(input.notification_emails),
    notification_cc_emails: optionalString(input.notification_cc_emails),
    notification_bcc_emails: optionalString(input.notification_bcc_emails),
    notification_subject: optionalString(input.notification_subject),
    notification_from_name: optionalString(input.notification_from_name),
    autoreply: optionalBoolean(input.autoreply),
    autoreply_body: optionalString(input.autoreply_body),
    autoreply_subject: optionalString(input.autoreply_subject),
    autoreply_from_name: optionalString(input.autoreply_from_name),
    autoreply_greeting: optionalString(input.autoreply_greeting),
    autoreply_name: optionalString(input.autoreply_name),
    autoreply_title: optionalString(input.autoreply_title),
    autoreply_email: optionalString(input.autoreply_email),
    force_recaptcha: optionalBoolean(input.force_recaptcha),
    force_hcaptcha: optionalBoolean(input.force_hcaptcha),
    force_turnstile: optionalBoolean(input.force_turnstile),
    honeypot_field: optionalString(input.honeypot_field),
    retention_days: optionalNumber(input.retention_days),
    allowed_domains: optionalStringArray(input.allowed_domains),
    blocked_domains: optionalStringArray(input.blocked_domains),
    duplicate_filter: optionalBoolean(input.duplicate_filter),
    smtp_email_validation: optionalBoolean(input.smtp_email_validation),
  };
}

function pickWebhookFields(input: Record<string, unknown>): Record<string, unknown> {
  return {
    form_id: optionalNumber(input.form_id),
    name: optionalString(input.name),
    url: optionalString(input.url),
    format: optionalString(input.format),
    enabled: optionalBoolean(input.enabled),
    trigger_when_spam: optionalBoolean(input.trigger_when_spam),
  };
}

async function requestBasinJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  mode: BasinMode;
  method?: string;
  query?: Record<string, BasinQueryValue>;
  body?: unknown;
}): Promise<BasinJsonObject> {
  const response = await basinFetch(input);
  const raw = await readResponseBody(response);
  const payload = raw.trim() === "" ? { success: true } : parseBasinBody(raw);

  if (!response.ok) {
    throw toBasinError(response, payload, input.mode);
  }

  return payload;
}

async function basinFetch(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  method?: string;
  query?: Record<string, BasinQueryValue>;
  body?: unknown;
}): Promise<Response> {
  const url = new URL(input.path.startsWith("/") ? `${basinApiBaseUrl}${input.path}` : `${basinApiBaseUrl}/${input.path}`);
  const method = input.method ?? "GET";
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.context.fetcher(url, {
      method,
      headers: basinHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Basin request failed for ${method} ${url.toString()}: ${message}`);
  }
}

function basinHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Token ${apiKey}`,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Failed to read Basin response body: ${error.message}` : "Failed to read Basin response body",
    );
  }
}

function parseBasinBody(raw: string): BasinJsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Basin returned invalid JSON");
  }

  const payload = optionalRecord(parsed);
  if (!payload) {
    throw new ProviderRequestError(502, "Basin returned a non-object JSON payload");
  }

  return payload;
}

function toBasinError(response: Response, payload: BasinJsonObject, mode: BasinMode): ProviderRequestError {
  const message = extractBasinErrorMessage(payload) ?? `Basin request failed with status ${response.status}`;

  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function extractBasinErrorMessage(payload: BasinJsonObject): string | undefined {
  const message = optionalString(payload.error) ?? optionalString(payload.message);
  if (message) {
    return message;
  }

  const errors = optionalRecord(payload.errors);
  if (!errors) {
    return undefined;
  }

  for (const value of Object.values(errors)) {
    if (typeof value === "string" && value) {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string" && value[0]) {
      return value[0];
    }
  }

  return undefined;
}

function extractBasinArray(payload: BasinJsonObject, key: string): unknown[] {
  const direct = payload[key];
  if (Array.isArray(direct)) {
    return direct;
  }

  const data = payload.data;
  return Array.isArray(data) ? data : [];
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function requirePositiveInteger(value: unknown, fieldName: string): string {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(value);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
}
