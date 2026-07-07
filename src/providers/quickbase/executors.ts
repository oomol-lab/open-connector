import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "quickbase";
const apiBaseUrl = "https://api.quickbase.com/v1";

interface QuickbaseContext {
  apiKey: string;
  realmHostname: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type Handler = ProviderRuntimeHandler<QuickbaseContext>;

export const quickbaseActionHandlers: Record<string, Handler> = {
  async get_app(input, context) {
    return {
      app: objectPayload(
        await quickbaseRequest(`/apps/${encodePathSegment(requiredString(input.appId, "appId"))}`, context),
        "app",
      ),
    };
  },
  async list_app_tables(input, context) {
    return {
      tables: arrayPayload(
        await quickbaseRequest("/tables", context, { query: { appId: requiredString(input.appId, "appId") } }),
        "tables",
      ),
    };
  },
  async get_table_fields(input, context) {
    return {
      fields: arrayPayload(
        await quickbaseRequest("/fields", context, {
          query: {
            tableId: requiredString(input.tableId, "tableId"),
            includeFieldPerms:
              optionalBoolean(input.includeFieldPerms) === undefined ? undefined : String(input.includeFieldPerms),
          },
        }),
        "fields",
      ),
    };
  },
  async query_records(input, context) {
    const payload = objectPayload(
      await quickbaseRequest("/records/query", context, {
        method: "POST",
        body: compactObject({
          from: requiredString(input.tableId, "tableId"),
          select: input.select,
          where: optionalString(input.where),
          sortBy: input.sortBy,
          groupBy: input.groupBy,
          options: optionalRecord(input.options),
        }),
      }),
      "query response",
    );
    return {
      data: arrayPayload(payload.data, "data"),
      fields: arrayPayload(payload.fields, "fields"),
      metadata: objectPayload(payload.metadata, "metadata"),
    };
  },
  async upsert_records(input, context) {
    const mergeField = readMergeField(input);
    const payload = objectPayload(
      await quickbaseRequest("/records", context, {
        method: "POST",
        body: compactObject({
          to: requiredString(input.tableId, "tableId"),
          data: objectArray(input.data, "data"),
          fieldsToReturn: input.fieldsToReturn,
          mergeFieldId: mergeField,
        }),
      }),
      "upsert response",
    );
    return {
      data: arrayPayload(payload.data, "data"),
      metadata: optionalRecord(payload.metadata) ?? {},
    };
  },
  async delete_records(input, context) {
    const recordIds = stringArray(input.recordIds, "recordIds");
    const where = recordIds.map((id) => `{3.EX.${id}}`).join("OR");
    const payload = objectPayload(
      await quickbaseRequest("/records", context, {
        method: "DELETE",
        body: {
          from: requiredString(input.tableId, "tableId"),
          where,
        },
      }),
      "delete response",
    );
    return {
      deletedRecordIds: recordIds,
      numberDeleted: integer(
        payload.numberDeleted,
        "numberDeleted",
        (message) => new ProviderRequestError(502, message),
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<QuickbaseContext>({
  service,
  handlers: quickbaseActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      realmHostname: normalizeRealmHostname(credential.values.realmHostname),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `QB-USER-TOKEN ${credential.apiKey}`);
    headers.set("qb-realm-hostname", normalizeRealmHostname(credential.values.realmHostname));
    headers.set("user-agent", providerUserAgent);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const realmHostname = normalizeRealmHostname(input.values.realmHostname);
    const apps = arrayPayload(
      await quickbaseRequest("/apps", { apiKey: input.apiKey, realmHostname, fetcher, signal }, "validate"),
      "Quickbase apps",
    );
    const firstApp = optionalRecord(apps[0]);
    return {
      profile: {
        accountId: `quickbase:${realmHostname}`,
        displayName: firstString(firstApp, ["name"])
          ? `Quickbase (${firstString(firstApp, ["name"])})`
          : `Quickbase (${realmHostname})`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        realmHostname,
        validationEndpoint: "/apps",
      },
    };
  },
};

function quickbaseRequest(
  path: string,
  context: QuickbaseContext,
  options:
    | "validate"
    | {
        method?: string;
        query?: Record<string, string | undefined>;
        body?: unknown;
      } = {},
): Promise<unknown> {
  const phase = options === "validate" ? "validate" : "execute";
  const requestOptions = typeof options === "object" ? options : {};
  return requestJson({
    providerName: "Quickbase",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    method: requestOptions.method,
    query: requestOptions.query,
    body: requestOptions.body,
    phase,
    headers: {
      authorization: `QB-USER-TOKEN ${context.apiKey}`,
      "QB-Realm-Hostname": context.realmHostname,
    },
  });
}

function normalizeRealmHostname(value: unknown): string {
  const hostname = requiredString(value, "realmHostname").toLowerCase();
  if (!/^[a-z0-9.-]+\.quickbase\.(com|eu)$/.test(hostname)) {
    throw new ProviderRequestError(
      400,
      "realmHostname must be a Quickbase realm hostname such as example.quickbase.com",
    );
  }
  return hostname;
}

function readMergeField(input: Record<string, unknown>): string | number | undefined {
  const mergeFieldId = input.mergeFieldId;
  const mergeFieldName = optionalString(input.mergeFieldName);
  if (mergeFieldId !== undefined && mergeFieldName !== undefined) {
    throw new ProviderRequestError(400, "mergeFieldId and mergeFieldName cannot both be provided");
  }
  if (typeof mergeFieldId === "number") {
    return mergeFieldId;
  }
  return mergeFieldName;
}
