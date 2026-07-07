import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { HelloleadsActionName } from "./actions.ts";

import { compactObject, optionalRecord, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "helloleads";
const helloleadsApiBaseUrl = "https://app.helloleads.io";
const formDefinitionPath = "/index.php/api/event/eventAutoFormFields";
const recaptchaSettingsPath = "/index.php/api/event/getGeneralSettings";
const submitWebFormPath = "/index.php/app/account/visitorKeyPost";

type HelloleadsMode = "validate" | "execute";
type HelloleadsFieldType = "text" | "textarea" | "dropdown" | "multiselect" | "date" | "file" | "hidden" | "unknown";
type HelloleadsActionContext = ApiKeyProviderContext;
type HelloleadsActionHandler = (input: Record<string, unknown>, context: HelloleadsActionContext) => Promise<unknown>;

interface HelloleadsFieldDefinition {
  field?: unknown;
  label?: unknown;
  type?: unknown;
  mandatory?: unknown;
  placeholder?: unknown;
  values?: unknown;
  cust?: unknown;
}

interface NormalizedWebFormField {
  name: string;
  label: string;
  type: HelloleadsFieldType;
  required: boolean;
  placeholder: string | null;
  acceptsMultiple: boolean;
  allowsFileUpload: boolean;
  custom: boolean;
  options: string[];
  hiddenValue: string | null;
}

interface LoadedWebForm {
  organizationId: string | null;
  eventId: string | null;
  country: string | null;
  mobileCode: string | null;
  requiresRecaptcha: boolean;
  fields: NormalizedWebFormField[];
}

export const helloleadsActionHandlers: Record<HelloleadsActionName, HelloleadsActionHandler> = {
  async get_web_form_definition(_input, context) {
    const form = await loadWebForm(context.apiKey, context);

    return {
      organizationId: form.organizationId,
      eventId: form.eventId,
      country: form.country,
      mobileCode: form.mobileCode,
      requiresRecaptcha: form.requiresRecaptcha,
      fields: form.fields
        .filter((field) => field.type !== "hidden")
        .map((field) => ({
          name: field.name,
          label: field.label,
          type: field.type === "hidden" ? "unknown" : field.type,
          required: field.required,
          placeholder: field.placeholder,
          acceptsMultiple: field.acceptsMultiple,
          allowsFileUpload: field.allowsFileUpload,
          custom: field.custom,
          options: field.options,
        })),
    };
  },

  async submit_web_form(input, context) {
    const form = await loadWebForm(context.apiKey, context);

    if (form.requiresRecaptcha) {
      throw new ProviderRequestError(
        400,
        "HelloLeads forms with reCAPTCHA v2 enabled are not supported by this action",
      );
    }

    const submittedValues = readSubmittedValues(input.values);
    const response = await fetchHelloleadsJson(
      new URL(submitWebFormPath, helloleadsApiBaseUrl),
      {
        method: "POST",
        headers: helloleadsHeaders({
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        }),
        body: buildSubmitBody(form, submittedValues, input.countryCode),
      },
      context,
      "execute",
    );

    const status = typeof response.status === "string" ? response.status : "";
    const message =
      typeof response.message === "string" && response.message.length > 0
        ? response.message
        : "HelloLeads returned an unknown submission result";

    if (status.toLowerCase() !== "success") {
      throw new ProviderRequestError(400, message, response);
    }

    const rawData = optionalRecord(response.data) ?? {};

    return {
      successful: true,
      status,
      message,
      submissionAction: nullableString(rawData.submissionAction),
      leadFullName: nullableString(rawData.leadFullName),
      visitorId: nullableString(rawData.visitorId),
      userId: nullableString(rawData.userId),
      eventId: nullableString(rawData.eventId),
      raw: response,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, helloleadsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: helloleadsApiBaseUrl,
  auth: {
    type: "api_key_query",
    name: "key",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const form = await loadWebForm(requiredHelloleadsApiKey(input.apiKey), {
      apiKey: input.apiKey,
      fetcher,
      signal,
    });

    return {
      profile: {
        displayName: "HelloLeads Web Form Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: helloleadsApiBaseUrl,
        validationEndpoint: formDefinitionPath,
        organizationId: form.organizationId ?? undefined,
        eventId: form.eventId ?? undefined,
        fieldCount: form.fields.length,
      }),
    };
  },
};

async function loadWebForm(apiKey: string, context: HelloleadsActionContext): Promise<LoadedWebForm> {
  const definitionUrl = new URL(formDefinitionPath, helloleadsApiBaseUrl);
  definitionUrl.searchParams.set("key", requiredHelloleadsApiKey(apiKey));

  const payload = await fetchHelloleadsJson(
    definitionUrl,
    {
      method: "GET",
      headers: helloleadsHeaders(),
    },
    context,
    "validate",
  );

  const fields = normalizeFormFields(payload.fields);
  if (fields.length === 0) {
    const message =
      typeof payload.message === "string" && payload.message.length > 0
        ? payload.message
        : "Invalid HelloLeads Web Form Key";
    throw new ProviderRequestError(400, message, payload);
  }

  const organizationId = nullableString(payload.organizationId);
  const requiresRecaptcha = organizationId ? await loadRecaptchaSetting(organizationId, context) : false;

  return {
    organizationId,
    eventId: nullableString(payload.eventId),
    country: nullableString(payload.country),
    mobileCode: nullableString(payload.mobileCode),
    requiresRecaptcha,
    fields,
  };
}

async function loadRecaptchaSetting(organizationId: string, context: HelloleadsActionContext): Promise<boolean> {
  const settingsUrl = new URL(recaptchaSettingsPath, helloleadsApiBaseUrl);
  settingsUrl.searchParams.set("organizationId", organizationId);
  settingsUrl.searchParams.set("recaptchaSelection", "v2");

  const payload = await fetchHelloleadsJson(
    settingsUrl,
    {
      method: "GET",
      headers: helloleadsHeaders(),
    },
    context,
    "validate",
  );

  return Array.isArray(payload.grecaptchaData) && payload.grecaptchaData.length > 0;
}

async function fetchHelloleadsJson(
  url: URL,
  init: RequestInit,
  context: Pick<HelloleadsActionContext, "fetcher" | "signal">,
  mode: HelloleadsMode,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      ...init,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `helloleads request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readHelloleadsPayload(response);
  if (!response.ok) {
    throw mapHelloleadsHttpError(response.status, payload, mode);
  }

  return payload;
}

async function readHelloleadsPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return optionalRecord(payload) ?? {};
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "helloleads returned malformed JSON");
    }
    return { message: text };
  }
}

function mapHelloleadsHttpError(
  status: number,
  payload: Record<string, unknown>,
  mode: HelloleadsMode,
): ProviderRequestError {
  const message = readHelloleadsMessage(payload, status);

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : status, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readHelloleadsMessage(payload: Record<string, unknown>, status: number): string {
  for (const key of ["message", "error", "status"]) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return `helloleads request failed with ${status}`;
}

function normalizeFormFields(value: unknown): NormalizedWebFormField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const fields: NormalizedWebFormField[] = [];
  for (const item of value) {
    const record = optionalRecord(item) as HelloleadsFieldDefinition | undefined;
    if (!record) {
      continue;
    }

    const name = nullableString(record.field);
    const label = nullableString(record.label);
    if (!name || !label) {
      continue;
    }

    const type = normalizeFieldType(record.type);
    fields.push({
      name,
      label,
      type,
      required: readTruthyFlag(record.mandatory),
      placeholder: nullableString(record.placeholder),
      acceptsMultiple: type === "multiselect",
      allowsFileUpload: type === "file",
      custom: record.cust === "1" || record.cust === 1,
      options: normalizeFieldOptions(record),
      hiddenValue: nullableString(record.values),
    });
  }

  return fields;
}

function normalizeFieldType(value: unknown): HelloleadsFieldType {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "text field" || normalized === "number") {
    return "text";
  }
  if (normalized === "textarea") {
    return "textarea";
  }
  if (normalized === "dropdown") {
    return "dropdown";
  }
  if (normalized === "multiselect") {
    return "multiselect";
  }
  if (normalized === "date") {
    return "date";
  }
  if (normalized === "file") {
    return "file";
  }
  if (normalized === "hidden") {
    return "hidden";
  }

  return "unknown";
}

function normalizeFieldOptions(field: HelloleadsFieldDefinition): string[] {
  const source = typeof field.values === "string" && field.values.length > 0 ? field.values : undefined;
  if (!source) {
    return [];
  }

  return source
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readTruthyFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function readSubmittedValues(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, "submit_web_form requires a values object");
  }
  return record;
}

function buildSubmitBody(form: LoadedWebForm, values: Record<string, unknown>, countryCodeValue: unknown): string {
  const fieldMap = new Map(form.fields.map((field) => [field.name, field]));
  const body = new URLSearchParams();
  const customFieldValues: Record<string, string> = {};
  const countryCode =
    typeof countryCodeValue === "string" && countryCodeValue.trim().length > 0 ? countryCodeValue.trim() : undefined;

  for (const [key, value] of Object.entries(values)) {
    if (!fieldMap.has(key)) {
      throw new ProviderRequestError(400, `Unknown HelloLeads form field '${key}'`);
    }
    if (value === undefined || value === null) {
      continue;
    }
  }

  for (const field of form.fields) {
    if (field.type === "hidden") {
      if (field.hiddenValue != null) {
        body.append(field.name, field.hiddenValue);
      }
      continue;
    }

    const rawValue = values[field.name];
    if (field.type === "file") {
      if (field.required) {
        throw new ProviderRequestError(
          400,
          `HelloLeads form field '${field.label}' requires file upload, which is not supported by this action`,
        );
      }
      if (rawValue !== undefined) {
        throw new ProviderRequestError(
          400,
          `HelloLeads form field '${field.label}' accepts file uploads, which are not supported by this action`,
        );
      }
      continue;
    }

    if (field.required && isMissingSubmittedValue(rawValue, field.acceptsMultiple)) {
      throw new ProviderRequestError(400, `HelloLeads form field '${field.label}' is required`);
    }

    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    if (field.acceptsMultiple) {
      const items = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (items.length === 0) {
        continue;
      }

      for (const item of items) {
        body.append(`${field.name}[]`, stringifyFieldValue(item, field.label));
      }
      continue;
    }

    let serialized = stringifyFieldValue(rawValue, field.label);
    if (field.name === "mobile" && countryCode && !serialized.startsWith(countryCode)) {
      serialized = `${countryCode}${serialized}`;
    }

    body.append(field.name, serialized);
    if (field.custom && field.type !== "multiselect") {
      customFieldValues[field.name] = serialized;
    }
  }

  if (Object.keys(customFieldValues).length > 0) {
    body.append("customlist", JSON.stringify(customFieldValues));
  }
  body.append("middleName", "");
  body.append("cityCode", "");
  body.append("surName", "");
  if (countryCode) {
    body.append("countryCode", countryCode);
  }

  return body.toString();
}

function isMissingSubmittedValue(value: unknown, acceptsMultiple: boolean): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (acceptsMultiple) {
    return Array.isArray(value) ? value.length === 0 : String(value).trim().length === 0;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}

function stringifyFieldValue(value: unknown, fieldLabel: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  throw new ProviderRequestError(
    400,
    `HelloLeads form field '${fieldLabel}' must be a string, number, boolean, or string array`,
  );
}

function requiredHelloleadsApiKey(value: unknown): string {
  return requiredString(value, "apiKey", (message) => new ProviderRequestError(400, message));
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function helloleadsHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}
