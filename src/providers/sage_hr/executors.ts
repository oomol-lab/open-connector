import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { objectPayload, requestJson } from "../http-json-runtime.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "sage_hr";

interface SageHrContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type Handler = ProviderRuntimeHandler<SageHrContext>;

export const sageHrActionHandlers: Record<string, Handler> = {
  async list_employees(input, context) {
    return listOutput("employees", await sageHrRequest("/employees", context, employeeQuery(input)));
  },
  async get_employee(input, context) {
    const raw = await sageHrRequest(
      `/employees/${pathValue(input.employeeId, "employeeId")}`,
      context,
      employeeHistoryQuery(input),
    );
    return { employee: entityPayload(raw, "employee"), raw: objectPayload(raw, "employee") };
  },
  async list_terminated_employees(input, context) {
    return listOutput(
      "terminatedEmployees",
      await sageHrRequest("/terminated-employees", context, employeeQuery(input)),
    );
  },
  async get_terminated_employee(input, context) {
    const raw = await sageHrRequest(`/terminated-employees/${pathValue(input.employeeId, "employeeId")}`, context);
    return {
      terminatedEmployee: entityPayload(raw, "terminatedEmployee"),
      raw: objectPayload(raw, "terminatedEmployee"),
    };
  },
  async list_teams(input, context) {
    return listOutput("teams", await sageHrRequest("/teams", context, pageQuery(input)));
  },
  async list_positions(input, context) {
    return listOutput("positions", await sageHrRequest("/positions", context, pageQuery(input)));
  },
  async list_termination_reasons(input, context) {
    return listOutput("terminationReasons", await sageHrRequest("/termination-reasons", context, pageQuery(input)));
  },
  async list_time_off_requests(input, context) {
    assertTimeOffDateRange(input);
    return listOutput(
      "timeOffRequests",
      await sageHrRequest(
        "/time-off/requests",
        context,
        compactObject({
          page: optionalInteger(input.page),
          from: optionalString(input.from),
          to: optionalString(input.to),
          employee_id: optionalString(input.employeeId),
          status: optionalString(input.status),
        }),
      ),
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SageHrContext>({
  service,
  handlers: sageHrActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeSageHrApiBaseUrl(credential.values.domain),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeSageHrApiBaseUrl(credential.values.domain);
  },
  auth: { type: "api_key_header", name: "x-auth-token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = normalizeSageHrApiBaseUrl(input.values.domain);
    await sageHrRequest("/employees", { apiKey: input.apiKey, apiBaseUrl, fetcher, signal }, {}, "validate");
    return {
      profile: {
        accountId: new URL(apiBaseUrl).hostname,
        displayName: `Sage HR ${new URL(apiBaseUrl).hostname}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/employees",
      },
    };
  },
};

function sageHrRequest(
  path: string,
  context: SageHrContext,
  query: Record<string, string | number | boolean | undefined> = {},
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return requestJson({
    providerName: "Sage HR",
    baseUrl: context.apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    query,
    phase,
    headers: {
      "x-auth-token": context.apiKey,
    },
  });
}

function listOutput(key: string, raw: unknown): Record<string, unknown> {
  const object = objectPayload(raw, key);
  const items = Array.isArray(object[key])
    ? object[key]
    : Array.isArray(object.data)
      ? object.data
      : Array.isArray(raw)
        ? raw
        : [];
  return {
    [key]: items,
    meta: optionalRecord(object.meta) ?? optionalRecord(object.pagination) ?? {},
    raw: object,
  };
}

function entityPayload(raw: unknown, key: string): Record<string, unknown> {
  const object = objectPayload(raw, key);
  return objectPayload(object[key] ?? object.data ?? raw, key);
}

function employeeQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return {
    ...pageQuery(input),
    ...employeeHistoryQuery(input),
  };
}

function employeeHistoryQuery(input: Record<string, unknown>): Record<string, boolean | undefined> {
  return {
    include_team_history: input.includeTeamHistory === true ? true : undefined,
    include_employment_status_history: input.includeEmploymentStatusHistory === true ? true : undefined,
    include_position_history: input.includePositionHistory === true ? true : undefined,
  };
}

function pageQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return { page: optionalInteger(input.page) };
}

function normalizeSageHrApiBaseUrl(value: unknown): string {
  const input = requiredString(value, "domain", (message) => new ProviderRequestError(400, message)).toLowerCase();
  const domain = input.endsWith(".sage.hr") ? input.slice(0, -".sage.hr".length) : input;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(domain)) {
    throw new ProviderRequestError(400, "domain must be a Sage HR subdomain such as acme or acme.sage.hr");
  }
  return `https://${domain}.sage.hr/api`;
}

function pathValue(value: unknown, fieldName: string): string {
  return encodePathSegment(requiredString(value, fieldName));
}

function assertTimeOffDateRange(input: Record<string, unknown>): void {
  const from = optionalString(input.from);
  const to = optionalString(input.to);
  if (!from || !to) {
    return;
  }
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    return;
  }
  const daysBetween = (toTime - fromTime) / 86_400_000;
  if (daysBetween < 0) {
    throw new ProviderRequestError(400, "to must be on or after from");
  }
  if (daysBetween >= 65) {
    throw new ProviderRequestError(400, "from and to must be less than 65 days apart");
  }
}
