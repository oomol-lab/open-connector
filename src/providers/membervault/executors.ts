import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, integer, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "membervault";
const membervaultDefaultTimeoutMs = 30_000;
const membervaultMaxResponseBytes = 10 * 1024 * 1024;
const defaultRootDomain = "mvsite.app";
const legacyRootDomain = "vipmembervault.com";
const credentialHelpUrl = "https://intercom.help/membervault/en/articles/6868514-how-to-locate-your-account-s-api-key";

interface MembervaultCredential {
  apiKey: string;
  account: string;
  apiBaseUrl: string;
}

interface MembervaultContext extends MembervaultCredential {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type MembervaultActionHandler = (input: Record<string, unknown>, context: MembervaultContext) => Promise<unknown>;

export const membervaultActionHandlers: ProviderActionHandlers<"membervault", MembervaultActionHandler> = {
  async list_courses(_input, context) {
    const payload = await requestMembervaultJson("get_courses", {}, context, "execute");
    return { courses: normalizeCourses(payload), raw: payload };
  },
  async add_user(input, context) {
    const payload = await requestMembervaultJson(
      "add_user",
      compactObject({
        email: requiredString(input.email, "email", providerInputError),
        course_id: integer(input.courseId, "courseId", providerInputError),
        first_name: optionalString(input.firstName),
        last_name: optionalString(input.lastName),
      }),
      context,
      "execute",
    );
    return {
      userId: readPayloadValue(payload, "user_id", "userId", "id") ?? null,
      message: readPayloadMessage(payload),
      raw: payload,
    };
  },
  async remove_user(input, context) {
    const payload = await requestMembervaultJson(
      "remove_user",
      {
        email: requiredString(input.email, "email", providerInputError),
        course_id: integer(input.courseId, "courseId", providerInputError),
      },
      context,
      "execute",
    );
    return { message: readPayloadMessage(payload), raw: payload };
  },
  async delete_user(input, context) {
    const payload = await requestMembervaultJson(
      "delete_user",
      { email: requiredString(input.email, "email", providerInputError) },
      context,
      "execute",
    );
    return { message: readPayloadMessage(payload), raw: payload };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MembervaultContext>({
  service,
  handlers: membervaultActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<MembervaultContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      ...readMembervaultCredential(credential.apiKey, credential.values.accountUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return readMembervaultCredential(credential.apiKey, credential.values.accountUrl).apiBaseUrl;
  },
  auth: { type: "api_key_query", name: "apikey" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credential = readMembervaultCredential(input.apiKey, input.values.accountUrl);
    const payload = await requestMembervaultJson("get_courses", {}, { ...credential, fetcher, signal }, "validate");
    const courses = normalizeCourses(payload);
    return {
      profile: {
        accountId: `membervault:${credential.account}`,
        displayName: `MemberVault ${credential.account}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        account: credential.account,
        apiBaseUrl: credential.apiBaseUrl,
        validationEndpoint: "/get_courses",
        courseCount: courses.length,
        firstCourseId: stringifyOptional(courses[0]?.courseId),
        firstCourseName: courses[0]?.courseName ?? undefined,
        credentialHelpUrl,
      }),
    };
  },
};

function readMembervaultCredential(apiKeyValue: string, accountUrlValue: unknown): MembervaultCredential {
  const apiKey = apiKeyValue.trim();
  if (!apiKey) {
    throw new ProviderRequestError(400, "API key is required");
  }
  const normalized = normalizeMembervaultApiBaseUrl(accountUrlValue);
  return { apiKey, ...normalized };
}

async function requestMembervaultJson(
  endpoint: string,
  query: Record<string, string | number | undefined>,
  context: MembervaultContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const apiBaseUrl = context.apiBaseUrl.endsWith("/") ? context.apiBaseUrl.slice(0, -1) : context.apiBaseUrl;
  const url = new URL(`${apiBaseUrl}/${endpoint}`);
  url.searchParams.set("apikey", context.apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const timeout = createProviderTimeout(context.signal, membervaultDefaultTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    const payload = parseMembervaultPayload(
      await readProviderTextBody(response, "MemberVault response", membervaultMaxResponseBytes),
    );
    if (!response.ok || payloadHasError(payload)) {
      throw mapMembervaultError(response.status, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "MemberVault request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MemberVault request failed: ${error.message}` : "MemberVault request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeMembervaultApiBaseUrl(value: unknown): { account: string; apiBaseUrl: string } {
  const accountUrl = optionalString(value)?.trim();
  if (!accountUrl) {
    throw new ProviderRequestError(400, "accountUrl is required");
  }
  if (!accountUrl.includes("://") && !accountUrl.includes(".") && !accountUrl.includes("/")) {
    const account = normalizeAccount(accountUrl);
    const apiBaseUrl = `https://${account}.${defaultRootDomain}/api`;
    assertPublicHttpUrl(apiBaseUrl, {
      fieldName: "accountUrl",
      createError: (message) => new ProviderRequestError(400, message),
    });
    return { account, apiBaseUrl };
  }
  let url: URL;
  try {
    url = new URL(accountUrl.includes("://") ? accountUrl : `https://${accountUrl}`);
  } catch {
    throw new ProviderRequestError(400, "accountUrl must be a MemberVault account subdomain or URL");
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "accountUrl must use HTTPS");
  }
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(`.${defaultRootDomain}`) && !host.endsWith(`.${legacyRootDomain}`)) {
    throw new ProviderRequestError(400, "accountUrl must be a MemberVault mvsite.app or vipmembervault.com URL");
  }
  const apiBaseUrl = `${url.origin}/api`;
  assertPublicHttpUrl(apiBaseUrl, {
    fieldName: "accountUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  return { account: host.split(".")[0] || host, apiBaseUrl };
}

function normalizeAccount(value: string): string {
  const account = value.trim().toLowerCase();
  if (
    account.length === 0 ||
    account.length > 63 ||
    account.startsWith("-") ||
    account.endsWith("-") ||
    hasInvalidAccountCharacter(account)
  ) {
    throw new ProviderRequestError(400, "accountUrl must be a MemberVault account subdomain or URL");
  }
  return account;
}

function hasInvalidAccountCharacter(account: string): boolean {
  for (const character of account) {
    if (!((character >= "a" && character <= "z") || (character >= "0" && character <= "9") || character === "-")) {
      return true;
    }
  }
  return false;
}

function parseMembervaultPayload(rawBody: string): unknown {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { message: trimmed };
  }
}

function payloadHasError(payload: unknown): boolean {
  const object = optionalRecord(payload);
  if (!object) {
    return false;
  }
  const success = object.success ?? object.successful;
  return success === false || success === "false" || hasMeaningfulError(readPayloadValue(object, "error", "errors"));
}

function hasMeaningfulError(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function mapMembervaultError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readPayloadMessage(payload) ?? `MemberVault API request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  return new ProviderRequestError(status < 500 ? 400 : 502, message);
}

function normalizeCourses(payload: unknown): Array<{
  courseId: unknown;
  courseName: string | null;
  raw: Record<string, unknown>;
}> {
  return readCourseCandidates(payload)
    .map((value) => {
      const object = optionalRecord(value);
      return object
        ? {
            courseId: readPayloadValue(object, "course_id", "courseId", "id") ?? null,
            courseName:
              stringifyOptional(readPayloadValue(object, "course_name", "courseName", "name", "title")) ?? null,
            raw: object,
          }
        : null;
    })
    .filter((course) => course !== null);
}

function readCourseCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const object = optionalRecord(payload);
  if (!object) return [];
  for (const key of ["courses", "Courses", "products", "Products"]) {
    if (Array.isArray(object[key])) return object[key];
  }
  return optionalRecord(object.data) ? readCourseCandidates(object.data) : [];
}

function readPayloadMessage(payload: unknown): string | null {
  return (
    stringifyOptional(readPayloadValue(payload, "message", "Message", "error")) ??
    (typeof payload === "string" && payload.trim() ? payload.trim() : null)
  );
}

function readPayloadValue(payload: unknown, ...keys: string[]): unknown {
  const object = optionalRecord(payload);
  if (!object) return undefined;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return optionalRecord(object.data) ? readPayloadValue(object.data, ...keys) : undefined;
}

function stringifyOptional(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}
