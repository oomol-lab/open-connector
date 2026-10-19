import type { ApiKeyActionRequest } from "../provider-runtime.ts";

import { optionalNumber, optionalRecord, optionalRawString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { prepareEmployeeWrite } from "./employee-runtime.ts";
import { readSmartHrNextPage } from "./pagination.ts";
import { supplementalGetRoutes, supplementalListRoutes, masterWriteRoutes } from "./resource-routes.ts";

function readSmartHrTenant(metadata: Record<string, unknown>) {
  const subdomain = requiredInputString(metadata.subdomain, "subdomain").toLowerCase();
  const allowed = "abcdefghijklmnopqrstuvwxyz0123456789-";
  if (
    subdomain.length > 63 ||
    subdomain.startsWith("-") ||
    subdomain.endsWith("-") ||
    [...subdomain].some((character) => !allowed.includes(character))
  ) {
    throw new ProviderRequestError(
      400,
      "subdomain must be a SmartHR tenant subdomain, not a URL",
      undefined,
      "invalid_input",
    );
  }
  const environment = optionalRawString(metadata.environment) ?? "production";
  if (environment !== "production" && environment !== "sandbox") {
    throw new ProviderRequestError(400, "environment must be production or sandbox", undefined, "invalid_input");
  }
  return { subdomain, environment };
}

export function smartHrBaseUrl(metadata: Record<string, unknown>): string {
  const tenant = readSmartHrTenant(metadata);
  return `https://${tenant.subdomain}.${tenant.environment === "sandbox" ? "daruma.space" : "smarthr.jp"}/api`;
}

interface RequestOptions {
  apiKey: string;
  metadata: Record<string, unknown>;
  path: string;
  query?: Record<string, unknown>;
  method?: string;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  fetcher: typeof fetch;
}

async function requestSmartHr(options: RequestOptions) {
  const url = new URL(`${smartHrBaseUrl(options.metadata)}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const apiKey = requiredInputString(options.apiKey, "Access Token");
  return runProviderRequest({ label: "SmartHR", signal: options.signal }, async (signal) => {
    const response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    if (!response.ok) {
      throw await readSmartHrError(response);
    }
    return {
      data: response.status === 204 ? null : await response.json(),
      headers: response.headers,
      requestUrl: url,
    };
  });
}

export async function validateSmartHrCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{ accountId: string; displayName: string; tenant: { subdomain: string; environment: string } }> {
  const tenant = readSmartHrTenant(input);
  const { data } = await requestSmartHr({
    apiKey: input.apiKey ?? "",
    metadata: tenant,
    path: "/v1/companies",
    query: { page: 1, per_page: 1 },
    signal,
    fetcher,
  });
  if (!Array.isArray(data))
    throw new ProviderRequestError(502, "SmartHR companies response must be an array", undefined, "provider_error");
  const company = optionalRecord(data[0]);
  return {
    accountId: `${tenant.environment}:${tenant.subdomain}`,
    displayName: optionalRawString(company?.name) ?? new URL(smartHrBaseUrl(tenant)).hostname,
    tenant,
  };
}

const listRoutes: Record<string, { path: string; key: string }> = {
  ...supplementalListRoutes,
  list_employees: { path: "crews", key: "employees" },
  list_companies: { path: "companies", key: "companies" },
  list_departments: { path: "departments", key: "departments" },
  list_employment_types: { path: "employment_types", key: "employmentTypes" },
  list_custom_fields: { path: "crew_custom_field_templates", key: "customFields" },
  list_custom_field_groups: { path: "crew_custom_field_template_groups", key: "customFieldGroups" },
  list_business_establishments: { path: "biz_establishments", key: "businessEstablishments" },
};
const getRoutes: Record<string, { path: string; key: string; id: string }> = {
  ...supplementalGetRoutes,
  get_employee: { path: "crews", key: "employee", id: "employeeId" },
  get_department: { path: "departments", key: "department", id: "departmentId" },
  get_employment_type: { path: "employment_types", key: "employmentType", id: "employmentTypeId" },
};
const employeeQueryNames: Record<string, string> = {
  employeeCode: "emp_code",
  employmentTypeIds: "employment_type_id",
  employmentStatus: "emp_status",
  gender: "gender",
  sort: "sort",
  enteredAtFrom: "entered_at_from",
  enteredAtTo: "entered_at_to",
  resignedAtFrom: "resigned_at_from",
  resignedAtTo: "resigned_at_to",
  userIds: "user_id",
  departmentIds: "department_id",
  positionIds: "position_id",
  query: "q",
  preferBusinessName: "prefer_business_name",
  employeeIds: "id",
  fields: "fields",
};

function pathId(value: unknown, name: string) {
  const id = requiredInputString(value, name);
  if (id === "." || id === "..")
    throw new ProviderRequestError(400, `${name} must not be a dot path segment`, undefined, "invalid_input");
  return encodeURIComponent(id);
}

export async function executeSmartHrAction(
  input: ApiKeyActionRequest,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const values = input.input;
  const common = { apiKey: input.apiKey, metadata: input.providerMetadata ?? {}, fetcher, signal };
  const list = listRoutes[input.actionName];
  if (list) {
    const query: Record<string, unknown> = {
      page: values.page ?? 1,
      per_page: values.perPage ?? 10,
    };
    if (input.actionName === "list_employees") {
      for (const [key, upstream] of Object.entries(employeeQueryNames)) query[upstream] = values[key];
    } else {
      query.embed = values.embed;
      query.code = values.code;
      query.sort = values.sort;
    }
    const { data, headers, requestUrl } = await requestSmartHr({
      ...common,
      path: `/v1/${list.path}`,
      query,
    });
    if (!Array.isArray(data))
      throw new ProviderRequestError(502, "SmartHR list response must be an array", undefined, "provider_error");
    const count = headers.get("x-total-count");
    const total = count === null || count.trim() === "" ? NaN : Number(count);
    return {
      [list.key]: data,
      page: query.page,
      perPage: query.per_page,
      totalCount: Number.isInteger(total) && total >= 0 ? total : null,
      nextPage: readSmartHrNextPage(headers, requestUrl),
    };
  }
  const get = getRoutes[input.actionName];
  if (get) {
    const { data } = await requestSmartHr({
      ...common,
      path: `/v1/${get.path}/${pathId(values[get.id], get.id)}`,
      query: { fields: values.fields, embed: values.embed },
    });
    return { [get.key]: requiredResponseRecord(data, "SmartHR resource response") };
  }
  const master = masterWriteRoutes[input.actionName];
  if (master) {
    const resourcePath = `/v1/${master.path}${master.method === "POST" ? "" : `/${pathId(values[master.id], master.id)}`}`;
    const body =
      master.method === "DELETE"
        ? undefined
        : Object.fromEntries(
            master.fields.filter((field) => values[field] !== undefined).map((field) => [field, values[field]]),
          );
    const { data } = await requestSmartHr({
      ...common,
      method: master.method,
      path: resourcePath,
      body,
    });
    return master.method === "DELETE"
      ? { deleted: true }
      : { [master.key]: requiredResponseRecord(data, "SmartHR master data response") };
  }
  if (input.actionName === "create_employee" || input.actionName === "update_employee") {
    const creating = input.actionName === "create_employee";
    const employeePath = `/v1/crews${creating ? "" : `/${pathId(values.employeeId, "employeeId")}`}`;
    readSmartHrTenant(common.metadata);
    requiredInputString(common.apiKey, "Access Token");
    const body = await prepareEmployeeWrite(values.employee, fetcher, signal);
    const { data } = await requestSmartHr({
      ...common,
      method: creating ? "POST" : "PATCH",
      path: employeePath,
      body,
    });
    return { employee: requiredResponseRecord(data, "SmartHR employee response") };
  }
  if (["delete_employee", "clear_employee_departments", "invite_employee"].includes(input.actionName)) {
    const employeePath = `/v1/crews/${pathId(values.employeeId, "employeeId")}`;
    const inviting = input.actionName === "invite_employee";
    const clearing = input.actionName === "clear_employee_departments";
    await requestSmartHr({
      ...common,
      method: inviting ? "PUT" : "DELETE",
      path: `${employeePath}${inviting ? "/invite" : clearing ? "/departments" : ""}`,
      body: inviting
        ? { inviter_user_id: values.inviterUserId, crew_input_form_id: values.employeeInputFormId }
        : undefined,
    });
    return inviting ? { invited: true } : clearing ? { cleared: true } : { deleted: true };
  }
  const departmentId =
    input.actionName === "create_department" ? undefined : pathId(values.departmentId, "departmentId");
  if (input.actionName === "discontinue_department") {
    await requestSmartHr({
      ...common,
      method: "POST",
      path: `/v1/departments/${departmentId}/discontinue`,
      body: { discontinued_date: values.discontinuedDate },
    });
    return { discontinued: true };
  }
  const methods: Record<string, string> = {
    create_department: "POST",
    update_department: "PATCH",
    replace_department: "PUT",
  };
  const method = methods[input.actionName];
  if (!method)
    throw new ProviderRequestError(400, `unknown smarthr action: ${input.actionName}`, undefined, "invalid_input");
  const { data } = await requestSmartHr({
    ...common,
    method,
    path: `/v1/departments${departmentId === undefined ? "" : `/${departmentId}`}`,
    body: {
      name: values.name,
      code: values.code,
      position: values.position,
      company_id: values.companyId,
      parent_id: values.parentId,
    },
  });
  return { department: requiredResponseRecord(data, "SmartHR department response") };
}

export async function readSmartHrError(response: Response): Promise<ProviderRequestError> {
  const error = optionalRecord(await response.json().catch(() => undefined));
  const code = optionalNumber(error?.code);
  const type = optionalRawString(error?.type);
  const message = optionalRawString(error?.message) ?? `SmartHR request failed with status ${response.status}`;
  const detail = `${message}${code === undefined ? "" : ` (code: ${code})`}${type ? ` [${type}]` : ""}`;
  const invalidToken = code === 2 || type === "unauthorized_token";
  return new ProviderRequestError(
    response.status,
    detail,
    error?.errors === undefined ? undefined : { errors: error.errors },
    invalidToken ? "authorization_failed" : "provider_error",
  );
}
