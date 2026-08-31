import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "simplybook_me";
const simplybookMeApiBaseUrl = "https://user-api.simplybook.me";
const simplybookMeLoginUrl = `${simplybookMeApiBaseUrl}/login`;

interface SimplybookMeContext {
  companyLogin: string;
  token: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface JsonRpcRequestInput {
  url: string;
  method: string;
  params: unknown[];
  fetcher: typeof fetch;
  signal?: AbortSignal;
  companyLogin?: string;
  token?: string;
}

interface JsonRpcErrorPayload {
  code?: unknown;
  message?: unknown;
}

type SimplybookMeActionHandler = (input: Record<string, unknown>, context: SimplybookMeContext) => Promise<unknown>;

export const simplybookMeActionHandlers: ProviderActionHandlers<"simplybook_me", SimplybookMeActionHandler> = {
  async get_company_info(_input, context) {
    const company = await callPublicMethod(context, "getCompanyInfo", []);
    return { company: requireObjectPayload(company, "SimplyBook.me company info response") };
  },
  async list_services(input, context) {
    const services = await callPublicMethod(context, "getEventList", [input.isVisibleOnly ?? true, true]);
    return { services: normalizeObjectList(services, "SimplyBook.me service list response") };
  },
  async list_performers(input, context) {
    const performers = await callPublicMethod(context, "getUnitList", [input.isVisibleOnly ?? true, true]);
    return {
      performers: normalizeObjectList(performers, "SimplyBook.me performer list response"),
    };
  },
  async get_available_units(input, context) {
    const performerIds = await callPublicMethod(context, "getAvailableUnits", [
      input.serviceId,
      input.dateTime,
      input.count ?? 1,
    ]);
    return {
      performerIds: normalizeIntegerList(performerIds, "SimplyBook.me available units response"),
    };
  },
  async get_start_time_matrix(input, context) {
    const timesByDate = await callPublicMethod(context, "getStartTimeMatrix", [
      input.from,
      input.to,
      input.serviceId,
      input.performerId,
      input.count ?? 1,
    ]);
    return { timesByDate: normalizeTimeMatrix(timesByDate) };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SimplybookMeContext>({
  service,
  handlers: simplybookMeActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<SimplybookMeContext> {
    const credential = await requireApiKeyCredential(context, service);
    const companyLogin = requireCompanyLogin(credential.values.companyLogin);
    const token = await getSimplybookMeToken({
      apiKey: credential.apiKey,
      companyLogin,
      fetcher,
      signal: context.signal,
    });
    return { companyLogin, token, fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const companyLogin = requireCompanyLogin(input.values.companyLogin);
    const token = await getSimplybookMeToken({
      apiKey: input.apiKey,
      companyLogin,
      fetcher,
      signal,
    });
    const company = await callPublicMethod({ companyLogin, token, fetcher, signal }, "getCompanyInfo", []);
    const companyRecord = optionalRecord(company) ?? {};
    return {
      profile: {
        accountId: companyLogin,
        displayName: readCompanyLabel(companyRecord, companyLogin),
      },
      grantedScopes: [],
      metadata: {
        companyLogin,
        apiBaseUrl: simplybookMeApiBaseUrl,
        validationMethod: "getCompanyInfo",
      },
    };
  },
};

async function getSimplybookMeToken(input: {
  apiKey: string;
  companyLogin: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<string> {
  const payload = await callJsonRpc({
    url: simplybookMeLoginUrl,
    method: "getToken",
    params: [input.companyLogin, input.apiKey],
    fetcher: input.fetcher,
    signal: input.signal,
  });
  if (typeof payload !== "string" || !payload) {
    throw new ProviderRequestError(502, "SimplyBook.me token response is invalid");
  }
  return payload;
}

function callPublicMethod(context: SimplybookMeContext, method: string, params: unknown[]): Promise<unknown> {
  return callJsonRpc({
    url: simplybookMeApiBaseUrl,
    method,
    params,
    fetcher: context.fetcher,
    signal: context.signal,
    companyLogin: context.companyLogin,
    token: context.token,
  });
}

async function callJsonRpc(input: JsonRpcRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(input.url, {
      method: "POST",
      headers: buildJsonRpcHeaders(input.companyLogin, input.token),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: input.method,
        params: input.params,
        id: 1,
      }),
      signal: timeout.signal,
    });
    const payload = optionalRecord(
      await readProviderJsonBody(response, {
        emptyBody: {},
        invalidJsonMessage: "SimplyBook.me returned invalid JSON",
        invalidJsonFallback: response.ok ? undefined : (text) => ({ error: { message: text } }),
      }),
    );
    if (!payload) {
      throw new ProviderRequestError(502, "SimplyBook.me returned an invalid response");
    }
    if (!response.ok) {
      throw mapHttpError(response.status, readJsonRpcMessage(payload, response.statusText));
    }
    const error = optionalRecord(payload.error) as JsonRpcErrorPayload | undefined;
    if (error) {
      throw mapJsonRpcError(error);
    }
    return payload.result;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "SimplyBook.me request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SimplyBook.me request failed: ${error.message}` : "SimplyBook.me request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildJsonRpcHeaders(companyLogin: string | undefined, token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
  if (companyLogin !== undefined && token !== undefined) {
    headers["X-Company-Login"] = companyLogin;
    headers["X-Token"] = token;
  }
  return headers;
}

function mapJsonRpcError(error: JsonRpcErrorPayload): ProviderRequestError {
  const code = typeof error.code === "number" ? error.code : undefined;
  const message =
    typeof error.message === "string" && error.message ? error.message : "SimplyBook.me JSON-RPC request failed";
  if (code === -33001 || code === -33002) {
    return new ProviderRequestError(401, message);
  }
  if (code === -32602 || code === -32080 || code === -32085 || code === -32001) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function mapHttpError(status: number, message: string): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function readJsonRpcMessage(payload: Record<string, unknown>, fallback: string): string {
  const error = optionalRecord(payload.error);
  return optionalString(error?.message) ?? (fallback || "SimplyBook.me request failed");
}

function requireCompanyLogin(value: unknown): string {
  return requiredString(value, "companyLogin", (message) => new ProviderRequestError(400, `simplybook_me ${message}`));
}

function requireObjectPayload(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function normalizeObjectList(value: unknown, message: string): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.map((item) => requireObjectPayload(item, message));
  }
  return Object.values(requireObjectPayload(value, message)).map((item) => requireObjectPayload(item, message));
}

function normalizeIntegerList(value: unknown, message: string): number[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item) => {
    const parsed = Number(item);
    if (!Number.isInteger(parsed)) {
      throw new ProviderRequestError(502, message);
    }
    return parsed;
  });
}

function normalizeTimeMatrix(value: unknown): Record<string, string[]> {
  const record = requireObjectPayload(value, "SimplyBook.me start time matrix response");
  const normalized: Record<string, string[]> = {};
  for (const [date, times] of Object.entries(record)) {
    if (!Array.isArray(times)) {
      throw new ProviderRequestError(502, "SimplyBook.me start times response is invalid");
    }
    normalized[date] = times.map((time) => String(time));
  }
  return normalized;
}

function readCompanyLabel(company: Record<string, unknown>, companyLogin: string): string {
  return optionalString(company.name) ?? optionalString(company.company) ?? companyLogin ?? "SimplyBook.me API Key";
}
