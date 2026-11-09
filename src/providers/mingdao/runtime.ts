import type { CredentialValidationResult } from "../../core/types.ts";
import type { MingdaoRoute } from "./route-types.ts";

import { optionalNumber, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { mingdaoBuildRoutes } from "./routes-build.ts";
import { mingdaoManagementRoutes } from "./routes-management.ts";
import { mingdaoQueryRoutes } from "./routes-query.ts";

export const mingdaoApiBaseUrl = "https://api.mingdao.com";

const worksheetPath = "/v3/app/worksheets/{worksheetId}";
const recordPath = `${worksheetPath}/rows/{rowId}`;
const routes: Record<string, MingdaoRoute> = {
  ...mingdaoQueryRoutes,
  ...mingdaoManagementRoutes,
  ...mingdaoBuildRoutes,
  get_app: { method: "GET", path: "/v3/app" },
  list_worksheets: { method: "POST", path: "/v3/app/worksheets/list" },
  get_worksheet: { method: "GET", path: worksheetPath },
  list_records: { method: "POST", path: `${worksheetPath}/rows/list` },
  get_record: { method: "GET", path: recordPath },
  create_record: { method: "POST", path: `${worksheetPath}/rows` },
  update_record: { method: "PATCH", path: recordPath },
  delete_record: { method: "DELETE", path: recordPath },
  batch_create_records: { method: "POST", path: `${worksheetPath}/rows/batch` },
  batch_update_records: { method: "PATCH", path: `${worksheetPath}/rows/batch` },
  batch_delete_records: { method: "DELETE", path: `${worksheetPath}/rows/batch` },
  get_related_records: { method: "GET", path: `${recordPath}/relations/{field}` },
  pivot_records: { method: "POST", path: `${worksheetPath}/rows/pivot` },
  list_workflows: { method: "GET", path: "/v3/app/workflow/processes" },
  get_workflow: { method: "GET", path: "/v3/app/workflow/processes/{processId}" },
  trigger_workflow: { method: "POST", path: "/v3/app/workflow/hooks/{processId}", bodyField: "parameters" },
};

export interface MingdaoContext {
  apiKey: string;
  sign: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export async function validateMingdaoCredential(
  apiKey: string,
  sign: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await requestMingdao({
    apiKey,
    sign: requiredInputString(sign, "sign"),
    path: "/v3/app",
    method: "GET",
    payload: {},
    fetcher,
    signal,
  });
  const app = requiredResponseRecord(result.data, "Mingdao application");
  return {
    profile: {
      accountId: `mingdao:${optionalString(app.appId) ?? apiKey}`,
      displayName: optionalString(app.name) ?? "Mingdao Application",
    },
    metadata: { appId: optionalString(app.appId), apiBaseUrl: mingdaoApiBaseUrl, validationEndpoint: "/v3/app" },
  };
}

type MingdaoHandler = (input: Record<string, unknown>, context: MingdaoContext) => Promise<unknown>;

export const mingdaoActionHandlers: Record<string, MingdaoHandler> = Object.fromEntries(
  Object.keys(routes).map((actionName) => [
    actionName,
    (input: Record<string, unknown>, context: MingdaoContext) => executeMingdaoAction(actionName, input, context),
  ]),
);

async function executeMingdaoAction(
  actionName: string,
  input: Record<string, unknown>,
  context: MingdaoContext,
): Promise<unknown> {
  const route = routes[actionName];
  if (!route) throw new ProviderRequestError(400, `unknown mingdao action: ${actionName}`);
  let path = route.path;
  const payload = { ...input };
  for (const field of [
    "worksheetId",
    "rowId",
    "field",
    "processId",
    "approvalId",
    "roleId",
    "userId",
    "optionsetId",
    "pageId",
  ]) {
    if (!path.includes(`{${field}}`)) continue;
    const value = requiredInputString(payload[field], field);
    if (value === "." || value === "..")
      throw new ProviderRequestError(400, `${field} must not be a path traversal segment`);
    path = path.replace(`{${field}}`, encodeURIComponent(value));
    if (!route.retainPathFields?.includes(field)) delete payload[field];
  }
  const body = route.bodyField
    ? requiredRecord(input[route.bodyField], route.bodyField, (message) => new ProviderRequestError(400, message))
    : payload;
  return requestMingdao({
    ...context,
    method: route.method,
    path,
    payload: body,
    noBody: route.noBody,
    successCodes: route.successCodes,
  });
}

interface MingdaoRequest extends MingdaoContext {
  method: string;
  path: string;
  payload: Record<string, unknown>;
  noBody?: boolean;
  successCodes?: readonly number[];
}

async function requestMingdao(input: MingdaoRequest): Promise<{ data: unknown }> {
  return runProviderRequest({ label: "Mingdao", signal: input.signal }, async (signal) => {
    const url = new URL(`${mingdaoApiBaseUrl}${input.path}`);
    if (input.method === "GET") {
      for (const [key, value] of Object.entries(input.payload)) {
        if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
        else if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        "HAP-Appkey": input.apiKey,
        "HAP-Sign": input.sign,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.method === "GET" || input.noBody ? undefined : JSON.stringify(input.payload),
      signal,
    });
    if (response.status === 429)
      throw new ProviderRequestError(429, "Mingdao request rate limit exceeded", undefined, "rate_limited");
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new ProviderRequestError(response.ok ? 502 : response.status, "Mingdao returned invalid JSON");
    }
    const envelope = requiredResponseRecord(parsed, "Mingdao response");
    const code = optionalNumber(envelope.error_code) ?? optionalNumber(envelope.errorCode);
    if (
      !response.ok ||
      envelope.success === false ||
      (code !== undefined && !(input.successCodes ?? [1]).includes(code))
    ) {
      const message =
        optionalString(envelope.error_msg) ??
        optionalString(envelope.errorMsg) ??
        `Mingdao request failed${code === undefined ? "" : ` (${code})`}`;
      if (code === 51 || code === 90000 || code === 90001)
        throw new ProviderRequestError(429, message, parsed, "rate_limited");
      throw new ProviderRequestError(response.ok ? 502 : response.status, message, parsed);
    }
    if (!Object.hasOwn(envelope, "data")) throw new ProviderRequestError(502, "Mingdao response is missing data");
    return { data: envelope.data };
  });
}
