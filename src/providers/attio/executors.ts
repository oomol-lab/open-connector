import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { AttioActionContext, AttioActionHandler } from "./runtime.ts";

import { compactObject, optionalInteger, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { requireBearerCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredResponseRecord } from "../provider-runtime.ts";
import { crmActionHandlers } from "./crm-runtime.ts";
import { validateAttioCredential } from "./oauth.ts";
import { attioRequest, readDataArray, readDataObject, readPagination } from "./runtime.ts";

const attioSelfPath = "/v2/self";

const attioActionHandlers: Record<string, AttioActionHandler> = {
  ...crmActionHandlers,
  identify(_input, context) {
    return executeIdentify(context);
  },
  list_objects(_input, context) {
    return executeListObjects(context);
  },
  get_object: executeGetObject,
  list_attributes: executeListAttributes,
  list_records: executeListRecords,
  get_record: executeGetRecord,
  create_record: executeCreateRecord,
  upsert_record: executeUpsertRecord,
  update_record: executeUpdateRecord,
  delete_record: executeDeleteRecord,
};

async function executeIdentify(context: AttioActionContext) {
  const payload = await attioRequest(attioSelfPath, {
    ...context,
    method: "GET",
    phase: "execute",
  });
  const meta = requiredResponseRecord(payload, "Attio token metadata");
  if (typeof meta.active !== "boolean") {
    throw new ProviderRequestError(502, "Attio token metadata is missing active", undefined, "provider_error");
  }

  return {
    active: meta.active === true,
    workspaceId: optionalRawString(meta.workspace_id) ?? null,
    workspaceName: optionalRawString(meta.workspace_name) ?? null,
    workspaceSlug: optionalRawString(meta.workspace_slug) ?? null,
    scope: optionalRawString(meta.scope) ?? null,
    raw: meta,
  };
}
async function executeListObjects(context: AttioActionContext) {
  const payload = await attioRequest("/v2/objects", {
    ...context,
    method: "GET",
    phase: "execute",
  });

  return { objects: readDataArray(payload) };
}
async function executeGetObject(input: Record<string, unknown>, context: AttioActionContext) {
  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}`, {
    ...context,
    method: "GET",
    phase: "execute",
  });

  return { object: readDataObject(payload) };
}
async function executeListAttributes(input: Record<string, unknown>, context: AttioActionContext) {
  const searchParams = paginationSearchParams(input);
  const showArchived = input.showArchived;
  if (typeof showArchived === "boolean") {
    searchParams.set("show_archived", String(showArchived));
  }

  const payload = await attioRequest(`/v2/${encodePath(input.target)}/${encodePath(input.identifier)}/attributes`, {
    ...context,
    method: "GET",
    phase: "execute",
    searchParams,
  });

  return {
    attributes: readDataArray(payload),
    pagination: readPagination(payload),
  };
}
async function executeListRecords(input: Record<string, unknown>, context: AttioActionContext) {
  if (input.filter !== undefined && input.filterViewId !== undefined) {
    throw new ProviderRequestError(400, "filter and filterViewId cannot be used together", undefined, "invalid_input");
  }

  const body = compactObject({
    filter: optionalRecord(input.filter),
    filter_view_id: optionalRawString(input.filterViewId),
    sorts: Array.isArray(input.sorts) ? input.sorts : undefined,
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  });
  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}/records/query`, {
    ...context,
    method: "POST",
    phase: "execute",
    body,
  });

  return {
    records: readDataArray(payload),
    pagination: readPagination(payload),
  };
}
async function executeGetRecord(input: Record<string, unknown>, context: AttioActionContext) {
  const payload = await attioRequest(recordPath(input), {
    ...context,
    method: "GET",
    phase: "execute",
  });

  return { record: readDataObject(payload) };
}
async function executeCreateRecord(input: Record<string, unknown>, context: AttioActionContext) {
  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}/records`, {
    ...context,
    method: "POST",
    phase: "execute",
    body: recordValuesBody(input),
  });

  return { record: readDataObject(payload) };
}
async function executeUpsertRecord(input: Record<string, unknown>, context: AttioActionContext) {
  const searchParams = new URLSearchParams();
  searchParams.set("matching_attribute", String(input.matchingAttribute));
  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}/records`, {
    ...context,
    method: "PUT",
    phase: "execute",
    searchParams,
    body: recordValuesBody(input),
  });

  return { record: readDataObject(payload) };
}
async function executeUpdateRecord(input: Record<string, unknown>, context: AttioActionContext) {
  const method = input.mode === "overwrite_multiselect" ? "PUT" : "PATCH";
  const payload = await attioRequest(recordPath(input), {
    ...context,
    method,
    phase: "execute",
    body: recordValuesBody(input),
  });

  return { record: readDataObject(payload) };
}
async function executeDeleteRecord(input: Record<string, unknown>, context: AttioActionContext) {
  const payload = await attioRequest(recordPath(input), {
    ...context,
    method: "DELETE",
    phase: "execute",
  });

  return { deleted: true, raw: payload };
}
function paginationSearchParams(input: Record<string, unknown>) {
  const searchParams = new URLSearchParams();
  const limit = optionalInteger(input.limit);
  const offset = optionalInteger(input.offset);
  if (limit !== undefined) {
    searchParams.set("limit", String(limit));
  }
  if (offset !== undefined) {
    searchParams.set("offset", String(offset));
  }
  return searchParams;
}
function recordValuesBody(input: Record<string, unknown>) {
  return {
    data: {
      values: optionalRecord(input.values) ?? {},
    },
  };
}
function recordPath(input: Record<string, unknown>) {
  return `/v2/objects/${encodePath(input.object)}/records/${encodePath(input.recordId)}`;
}
function encodePath(value: unknown) {
  return encodeURIComponent(String(value));
}
export const executors: ProviderExecutors = defineProviderExecutors<AttioActionContext>({
  service: "attio",
  handlers: attioActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireBearerCredential(context, "attio");
    return { apiKey: credential.accessToken, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "attio",
  baseUrl: "https://api.attio.com",
  auth: { type: "bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAttioCredential(input.apiKey, fetcher, signal);
  },
  oauth2(input, { fetcher, signal }) {
    return validateAttioCredential(input.accessToken, fetcher, signal);
  },
};

export { oauth } from "./oauth.ts";
