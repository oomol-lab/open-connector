import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "surveymethods";
const surveyMethodsApiBaseUrl = "https://api.surveymethods.com/v1";
interface SurveyMethodsCredentials {
  apiKey: string;
  loginId: string;
}
type SurveyMethodsRequestPhase = "validate" | "execute";
interface SurveyMethodsActionInput {
  apiKey: string;
  providerMetadata?: Record<string, unknown>;
  actionName: string;
  input: Record<string, unknown>;
}
interface Context extends SurveyMethodsCredentials {
  fetcher: typeof fetch;
}

const actionNames = [
  "get_account",
  "list_surveys",
  "get_survey",
  "list_email_lists",
  "create_email_list",
  "add_email_list_contact",
  "list_email_list_contacts",
];
const handlers = Object.fromEntries(
  actionNames.map((name) => [
    name,
    (input: Record<string, unknown>, context: Context) =>
      executeSurveyMethodsAction(
        { apiKey: context.apiKey, providerMetadata: { loginId: context.loginId }, actionName: name, input },
        context.fetcher,
      ),
  ]),
);
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<Context> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      loginId: requireLoginId(credential.values.loginId ?? credential.metadata.loginId),
      fetcher,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const credentials = readSurveyMethodsCredentials({
      apiKey: input.apiKey,
      loginId: String(input.values.loginId ?? ""),
    });
    const payload = await requestSurveyMethodsJson({
      credentials,
      path: "/users/details/",
      method: "GET",
      fetcher: context.fetcher,
      phase: "validate",
    });
    const account = requireObjectField(payload, "user", "SurveyMethods account response");
    return {
      profile: { accountId: credentials.loginId, displayName: credentials.loginId },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: surveyMethodsApiBaseUrl,
        loginId: credentials.loginId,
        accountType: optionalString(account.account_type),
        subscriptionStatus: optionalString(account.subscription_status),
      }),
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: surveyMethodsApiBaseUrl,
  auth: { type: "api_key_header", name: "x-surveymethods-placeholder" },
  customizeRequest({ url, headers, credential }) {
    if (credential?.authType != "api_key")
      throw new ProviderRequestError(401, "Configure SurveyMethods credentials first.");
    const loginId = requireLoginId(credential.values.loginId ?? credential.metadata.loginId);
    const parts = url.pathname.split("/");
    parts.splice(2, 0, encodeURIComponent(loginId), encodeURIComponent(credential.apiKey));
    url.pathname = parts.join("/");
    headers.delete("x-surveymethods-placeholder");
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

async function executeSurveyMethodsAction(input: SurveyMethodsActionInput, fetcher: typeof fetch) {
  const credentials = readSurveyMethodsCredentials({
    apiKey: input.apiKey,
    loginId: requireLoginId(input.providerMetadata?.loginId),
  });
  const request = buildActionRequest(input.actionName, input.input);
  const payload = await requestSurveyMethodsJson({
    credentials,
    ...request,
    fetcher,
    phase: "execute",
  });
  return normalizeActionOutput(input.actionName, payload);
}

function buildActionRequest(actionName: string, input: Record<string, unknown>) {
  if (actionName === "get_account") return { method: "GET", path: "/users/details/" };
  if (actionName === "list_surveys") {
    const recordsPerPage = optionalInteger(input.recordsPerPage);
    const startPage = optionalInteger(input.startPage);
    const suffix = recordsPerPage == null && startPage == null ? "" : `${recordsPerPage ?? 20}/${startPage ?? 1}/`;
    return { method: "GET", path: `/surveys/details/${suffix}` };
  }
  if (actionName === "get_survey") {
    return {
      method: "GET",
      path: `/surveys/${encodeURIComponent(requireString(input.surveyCode, "surveyCode"))}/`,
    };
  }
  if (actionName === "list_email_lists") return { method: "GET", path: "/emaillists/codes/" };
  if (actionName === "create_email_list") {
    const customFieldLabels = readStringArray(input.customFieldLabels, "customFieldLabels");
    return {
      method: "POST",
      path: "/emaillists/create/",
      body: {
        email_list_type: requireString(input.emailListType, "emailListType"),
        email_list_name: requireString(input.emailListName, "emailListName"),
        custom_field_labels: customFieldLabels.join(","),
      },
    };
  }
  if (actionName === "add_email_list_contact") {
    const listCode = encodeURIComponent(requireString(input.emailListCode, "emailListCode"));
    const email = encodeURIComponent(requireString(input.email, "email"));
    const customFieldValues = readStringArray(input.customFieldValues, "customFieldValues");
    return {
      method: "POST",
      path: `/emaillists/${listCode}/append/${email}/`,
      body: customFieldValues.length > 0 ? { custom_fields_values: customFieldValues.join(",") } : undefined,
    };
  }
  const listCode = encodeURIComponent(requireString(input.emailListCode, "emailListCode"));
  return { method: "GET", path: `/emaillists/${listCode}/` };
}

function normalizeActionOutput(actionName: string, payload: unknown) {
  const root = requireObject(payload, "SurveyMethods response");
  const status = requireString(root.status, "status");
  if (actionName === "get_account") {
    const user = requireObjectField(root, "user", "SurveyMethods account response");
    const license = optionalRecord(user.license);
    return {
      status,
      account: {
        accountType: requireString(user.account_type, "user.account_type"),
        memberSince: requireString(user.member_since, "user.member_since"),
        expiresOn: requireString(user.expires_on, "user.expires_on"),
        subscriptionStatus: requireString(user.subscription_status, "user.subscription_status"),
        license: license
          ? {
              licenseExpiresOn: requireString(license.license_expires_on, "user.license.license_expires_on"),
              totalLicenses: requireInteger(license.total_licenses, "user.license.total_licenses"),
              usedLicenses: requireInteger(license.used_licenses, "user.license.used_licenses"),
            }
          : null,
      },
    };
  }
  if (actionName === "list_surveys") {
    const page = requireObject(requireArray(root.pages, "pages")[0], "pages[0]");
    return {
      status,
      rowCount: requireInteger(root.rowcount, "rowcount"),
      pageNumber: requireInteger(page.number, "pages[0].number"),
      surveys: requireArray(page.surveys, "pages[0].surveys").map(normalizeSurveySummary),
    };
  }
  if (actionName === "get_survey") {
    const survey = requireObjectField(root, "survey", "SurveyMethods survey response");
    const ssl = requireObjectField(survey, "ssl", "SurveyMethods survey response");
    return {
      status,
      survey: {
        code: requireString(survey.code, "survey.code"),
        title: requireString(survey.title, "survey.title"),
        folderName: requireString(survey.folder_name, "survey.folder_name"),
        pageCount: requireInteger(survey.page_count, "survey.page_count"),
        questionCount: requireInteger(survey.question_count, "survey.question_count"),
        status: requireString(survey.status, "survey.status"),
        ssl: {
          surveyLink: requireString(ssl.survey_link, "survey.ssl.survey_link"),
          publishedReports: requireString(ssl.published_reports, "survey.ssl.published_reports"),
        },
        anonymous: requireString(survey.anonymous, "survey.anonymous"),
        attempts: requireString(survey.attempts, "survey.attempts"),
        width: requireString(survey.width, "survey.width"),
        collaborated: requireString(survey.collaborated, "survey.collaborated"),
        createdDate: requireString(survey.created_date, "survey.created_date"),
        latestLaunchDate: requireString(survey.latest_launch_date, "survey.latest_launch_date"),
        closedDate: requireString(survey.closed_date, "survey.closed_date"),
        webLaunchUrl: requireString(survey.web_launch_url, "survey.web_launch_url"),
        defaultPublishUrl: requireString(survey.default_publish_url, "survey.default_publish_url"),
        responseCount: requireInteger(survey.response_count, "survey.response_count"),
      },
    };
  }
  if (actionName === "list_email_lists") {
    return {
      status,
      rowCount: requireInteger(root.rowcount, "rowcount"),
      emailLists: requireArray(root.email_lists, "email_lists").map((item) => {
        const list = requireObject(item, "email list");
        return {
          code: requireString(list.code, "email_list.code"),
          name: requireString(list.name, "email_list.name"),
          type: requireString(list.type, "email_list.type"),
        };
      }),
    };
  }
  if (actionName === "create_email_list") {
    const list = requireObjectField(root, "email_list", "SurveyMethods email list response");
    return {
      status,
      emailList: {
        code: requireString(list.code, "email_list.code"),
        name: requireString(list.name, "email_list.name"),
      },
    };
  }
  if (actionName === "add_email_list_contact") return { status };
  return {
    status,
    rowCount: requireInteger(root.rowcount, "rowcount"),
    listType: requireString(root.list_type, "list_type"),
    customFieldLabels: normalizeStringRecord(root.custom_field_labels),
    contacts: requireArray(root.email_list, "email_list").map((item) => {
      const contact = requireObject(item, "email list contact");
      return {
        email: requireString(contact.email, "email_list.email"),
        customFieldValues: normalizeStringRecord(contact.custom_field_values),
      };
    }),
  };
}

function normalizeSurveySummary(value: unknown) {
  const survey = requireObject(value, "survey summary");
  return {
    code: requireString(survey.code, "survey.code"),
    title: requireString(survey.title, "survey.title"),
    status: requireString(survey.status, "survey.status"),
    createdDate: requireString(survey.created_date, "survey.created_date"),
    latestLaunchDate: requireString(survey.latest_launch_date, "survey.latest_launch_date"),
    closedDate: requireString(survey.closed_date, "survey.closed_date"),
    webLaunchUrl: requireString(survey.web_launch_url, "survey.web_launch_url"),
  };
}

async function requestSurveyMethodsJson(input: {
  credentials: SurveyMethodsCredentials;
  path: string;
  method: string;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: SurveyMethodsRequestPhase;
}) {
  const url = `${surveyMethodsApiBaseUrl}/${encodeURIComponent(input.credentials.loginId)}/${encodeURIComponent(input.credentials.apiKey)}${input.path}`;
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SurveyMethods request failed: ${error.message}` : "SurveyMethods request failed",
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      optionalString(optionalRecord(payload)?.status) ?? `SurveyMethods request failed with HTTP ${response.status}`;
    if (response.status === 401) {
      throw new ProviderRequestError(401, message);
    }
    if (response.status === 429) throw new ProviderRequestError(429, message);
    throw new ProviderRequestError(response.status, message);
  }
  return payload;
}

function readSurveyMethodsCredentials(input: Record<string, string>): SurveyMethodsCredentials {
  if (!input.apiKey?.trim()) throw new ProviderRequestError(400, "apiKey is required");
  return { apiKey: input.apiKey.trim(), loginId: requireLoginId(input.loginId) };
}

function requireLoginId(value: unknown) {
  const loginId = optionalString(value)?.trim();
  if (!loginId) {
    throw new ProviderRequestError(400, "surveymethods Login ID is required");
  }
  return loginId;
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `SurveyMethods ${field} must be an object`);
  return object;
}

function requireObjectField(value: unknown, field: string, context: string) {
  return requireObject(requireObject(value, context)[field], field);
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `SurveyMethods ${field} must be an array`);
  return value;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (text == null) throw new ProviderRequestError(502, `SurveyMethods ${field} must be a string`);
  return text;
}

function requireInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ProviderRequestError(502, `SurveyMethods ${field} must be an integer`);
  return value;
}

function readStringArray(value: unknown, field: string) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(400, `${field} must be an array of strings`);
  }
  return value;
}

function normalizeStringRecord(value: unknown): Record<string, string> | null {
  if (value == null) return null;
  const object = requireObject(value, "string record");
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(object)) {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, "SurveyMethods string record contains a non-string value");
    }
    result[key] = item;
  }
  return result;
}
