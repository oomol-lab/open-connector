import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import {
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import { createProviderFetch, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "avochato";
const baseUrl = "https://www.avochato.com";
interface Credentials {
  authId: string;
  authSecret: string;
}
interface Context extends Credentials {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
function credentials(values: Record<string, unknown>): Credentials {
  return {
    authId: requiredString(values.authId, "authId"),
    authSecret: requiredString(values.authSecret, "authSecret"),
  };
}
async function request(
  path: string,
  method: "GET" | "POST",
  input: { query?: Record<string, unknown>; body?: Record<string, unknown> },
  context: Context,
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  const body =
    method === "POST" ? { ...(input.body ?? {}), auth_id: context.authId, auth_secret: context.authSecret } : undefined;
  if (method === "GET") {
    url.searchParams.set("auth_id", context.authId);
    url.searchParams.set("auth_secret", context.authSecret);
  }
  for (const [key, value] of Object.entries(input.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      "user-agent": providerUserAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Avochato returned invalid JSON");
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      optionalString(optionalRecord(payload)?.message) ??
        optionalString(optionalRecord(payload)?.error) ??
        `Avochato request failed with HTTP ${response.status}`,
      payload,
    );
  return payload;
}
function data(payload: unknown): Record<string, unknown> {
  return optionalRecord(optionalRecord(payload)?.data) ?? optionalRecord(payload) ?? {};
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function snakeBody(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    otherPhone: "other_phone",
    optedOut: "opted_out",
    doubleOptedIn: "double_opted_in",
    allowEmptyFields: "allow_empty_fields",
    userId: "user_id",
    stuckNumber: "stuck_number",
    markAddressed: "mark_addressed",
    statusCallback: "status_callback",
    sendAsUserId: "send_as_user_id",
    sendAsUserEmail: "send_as_user_email",
    createdFrom: "created_from",
    createdTo: "created_to",
  };
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) if (value !== undefined) output[map[key] ?? key] = value;
  return output;
}
const handlers = {
  async get_current_identity(_input: Record<string, unknown>, context: Context) {
    const value = data(await request("/v1/whoami", "GET", {}, context));
    return {
      account: optionalRecord(value.account) ?? {},
      user: optionalRecord(value.user) ?? {},
      origin: optionalString(value.origin) ?? null,
      createdAt: optionalString(value.created_at) ?? null,
    };
  },
  async list_contacts(input: Record<string, unknown>, context: Context) {
    const value = data(
      await request("/v1/contacts", "GET", { query: { after_page: input.afterPage, limit: input.limit } }, context),
    );
    return {
      contacts: list(value.contacts),
      nextPage: optionalString(value.next_page) ?? null,
      size: optionalInteger(value.size) ?? null,
    };
  },
  async get_contacts(input: Record<string, unknown>, context: Context) {
    const ids = requiredStringArray(input.ids, "ids");
    const value = data(
      await request(
        `/v1/contacts/${ids.map(encodeURIComponent).join("%2C")}`,
        "GET",
        { query: { page: input.page } },
        context,
      ),
    );
    return { contacts: list(value.contacts), page: optionalInteger(value.page) ?? null };
  },
  async upsert_contact(input: Record<string, unknown>, context: Context) {
    const contact = snakeBody(input);
    const allowEmptyFields = contact.allow_empty_fields;
    delete contact.allow_empty_fields;
    const value = data(
      await request(
        "/v1/contacts",
        "POST",
        {
          body: {
            contacts: [contact],
            ...(allowEmptyFields === undefined ? {} : { allow_empty_fields: allowEmptyFields }),
          },
        },
        context,
      ),
    );
    return { contact: optionalRecord(value.contact) ?? value };
  },
  async list_messages(input: Record<string, unknown>, context: Context) {
    const query = snakeBody(input);
    if (query.created_from !== undefined) {
      query["created_at[from]"] = query.created_from;
      delete query.created_from;
    }
    if (query.created_to !== undefined) {
      query["created_at[to]"] = query.created_to;
      delete query.created_to;
    }
    const payload = await request("/v1/messages", "GET", { query }, context);
    const value = data(payload);
    return { messages: list(value.messages), page: optionalInteger(optionalRecord(payload)?.page) ?? null };
  },
  async get_message(input: Record<string, unknown>, context: Context) {
    const value = data(
      await request(`/v1/messages/${encodeURIComponent(requiredString(input.eventId, "eventId"))}`, "GET", {}, context),
    );
    return { message: optionalRecord(value.message) ?? value };
  },
  async send_message(input: Record<string, unknown>, context: Context) {
    const value = data(await request("/v1/messages", "POST", { body: snakeBody(input) }, context));
    return { message: optionalRecord(value.message) ?? value };
  },
};
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return { ...credentials(credential.values), fetcher, signal: context.signal };
  },
});
const proxyFetch = createProviderFetch({ skipDnsValidation: true });

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, service);
    const value = credentials(credential.values);
    const url = createProviderProxyUrl(baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
    const method = input.method.toUpperCase();
    let body = input.body;
    if (method === "GET" || method === "HEAD") {
      url.searchParams.set("auth_id", value.authId);
      url.searchParams.set("auth_secret", value.authSecret);
    } else {
      if (body !== undefined && body !== null && !optionalRecord(body)) {
        throw new ProviderRequestError(400, "Avochato proxy auth requires a JSON object body");
      }
      body = { ...(optionalRecord(body) ?? {}), auth_id: value.authId, auth_secret: value.authSecret };
      headers.set("content-type", "application/json");
    }
    const response = await proxyFetch(url, {
      method: input.method,
      headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      signal: context.signal,
    });
    if (!response.ok) {
      const message = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, message || `Avochato proxy failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Avochato proxy request failed");
  }
};
export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const value = credentials(input.values);
    const payload = data(await request("/v1/whoami", "GET", {}, { ...value, fetcher, signal }));
    return {
      profile: {
        accountId: optionalString(optionalRecord(payload.account)?.id),
        displayName:
          optionalString(optionalRecord(payload.account)?.name) ||
          optionalString(optionalRecord(payload.user)?.name) ||
          "Avochato Account",
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/v1/whoami" },
    };
  },
};
