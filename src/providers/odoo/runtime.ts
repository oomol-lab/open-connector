import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  recordOrEmpty,
  requiredRawString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

interface OdooConnection {
  endpoint: string;
  database: string;
  username: string;
  password: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export interface OdooActionContext extends OdooConnection {
  uid: number;
}

type OdooActionHandler = (input: Record<string, unknown>, context: OdooActionContext) => Promise<unknown>;

export const odooActionHandlers: ProviderActionHandlers<"odoo", OdooActionHandler> = {
  async search({ model, domain, limit, offset, order, context }, connection) {
    return {
      ids: await executeOdoo(connection, model, "search", [domain], { limit: limit ?? 100, offset, order, context }),
    };
  },
  async read({ model, ids, fields, context }, connection) {
    return { records: await executeOdoo(connection, model, "read", [ids], { fields, context }) };
  },
  async search_read({ model, domain, fields, limit, offset, order, context }, connection) {
    return {
      records: await executeOdoo(connection, model, "search_read", [domain], {
        fields,
        limit: limit ?? 100,
        offset,
        order,
        context,
      }),
    };
  },
  async search_count({ model, domain, context }, connection) {
    return { count: await executeOdoo(connection, model, "search_count", [domain], { context }) };
  },
  async fields_get({ model, fields, attributes, context }, connection) {
    return {
      fields: await executeOdoo(connection, model, "fields_get", [], { allfields: fields, attributes, context }),
    };
  },
  async create({ model, values, context }, connection) {
    return { id: await executeOdoo(connection, model, "create", [values], { context }) };
  },
  async write({ model, ids, values, context }, connection) {
    return { success: await executeOdoo(connection, model, "write", [ids, values], { context }) };
  },
  async unlink({ model, ids, context }, connection) {
    return { success: await executeOdoo(connection, model, "unlink", [ids], { context }) };
  },
  async execute_kw({ model, method, args, kwargs }, connection) {
    return {
      result: await executeOdoo(
        connection,
        model,
        requiredInputString(method, "method"),
        looseArray(args),
        recordOrEmpty(kwargs),
      ),
    };
  },
};

export async function createOdooContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<OdooActionContext> {
  const allowPrivateNetwork = isPrivateNetworkAccessAllowed();
  const url = assertPublicHttpUrl(requiredInputString(values.baseUrl, "baseUrl"), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.protocol !== "https:" && !allowPrivateNetwork) {
    throw providerInputError(
      "baseUrl must use HTTPS unless the self-hosted runtime enables OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw providerInputError("baseUrl must not contain credentials, a query, or a fragment");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/jsonrpc`;
  const password = requiredRawString(values.password, "password", providerInputError);
  if (!password) {
    throw providerInputError("password is required");
  }
  const connection: OdooConnection = {
    endpoint: url.toString(),
    database: requiredInputString(values.database, "database"),
    username: requiredInputString(values.username, "username"),
    password,
    fetcher,
    signal,
  };
  const result = await requestOdooRpc(connection, "common", "authenticate", [
    connection.database,
    connection.username,
    password,
    {},
  ]);
  if (result === false) {
    throw new ProviderRequestError(
      401,
      "Odoo authentication failed. Check the database, username, and password or API key.",
    );
  }
  const uid = optionalInteger(result);
  if (uid === undefined || uid <= 0) {
    throw providerResponseError("Odoo authentication returned an invalid user ID");
  }
  return { ...connection, uid };
}

function executeOdoo(
  connection: OdooActionContext,
  model: unknown,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown>,
): Promise<unknown> {
  return requestOdooRpc(connection, "object", "execute_kw", [
    connection.database,
    connection.uid,
    connection.password,
    requiredInputString(model, "model"),
    method,
    args,
    compactObject(kwargs),
  ]);
}

function requestOdooRpc(
  connection: OdooConnection,
  service: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  return runProviderRequest({ signal: connection.signal, label: "Odoo" }, async (signal) => {
    const response = await connection.fetcher(connection.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": providerUserAgent },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: 1 }),
      // RPC credentials are in the body and must not be forwarded to a redirect target.
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(response.status, `Odoo request failed with HTTP ${response.status}`);
    }
    const payload = requiredResponseRecord(
      await readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "Odoo returned an invalid JSON-RPC response",
      }),
      "Odoo response",
    );
    if (payload.jsonrpc !== "2.0" || payload.id !== 1) {
      throw providerResponseError("Odoo returned an invalid JSON-RPC envelope");
    }
    if (payload.error !== undefined) {
      const error = requiredResponseRecord(payload.error, "Odoo RPC error");
      const data = optionalRecord(error.data);
      const name = optionalString(data?.name);
      const message = optionalString(data?.message) ?? optionalString(error.message) ?? "Odoo RPC request failed";
      const status =
        name === "odoo.exceptions.AccessDenied"
          ? 401
          : name === "odoo.exceptions.AccessError"
            ? 403
            : name === "odoo.exceptions.UserError" ||
                name === "odoo.exceptions.ValidationError" ||
                name === "odoo.exceptions.MissingError"
              ? 400
              : 502;
      throw new ProviderRequestError(status, message);
    }
    if (!Object.hasOwn(payload, "result")) {
      throw providerResponseError("Odoo response is missing the RPC result");
    }
    return payload.result;
  });
}
