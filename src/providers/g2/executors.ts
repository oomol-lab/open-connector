import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { G2Endpoint } from "./endpoint.ts";

import { looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { g2Actions, g2EndpointByName } from "./actions.ts";
const baseUrl = "https://data.g2.com";
async function request(
  apiKey: string,
  path: string,
  query: URLSearchParams,
  fetcher: typeof fetch,
  method = "GET",
  bodyInput?: {
    contentType: string;
    value: unknown;
  },
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "G2" }, async (signal) => {
    const url = new URL(path, baseUrl);
    url.search = query.toString();
    const response = await fetcher(url, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/vnd.api+json",
        ...(bodyInput ? { "content-type": bodyInput.contentType } : {}),
      },
      body: bodyInput ? JSON.stringify(bodyInput.value) : undefined,
      signal,
    });
    if (response.ok && response.status === 204) return { success: true };
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const errors = looseArray(optionalRecord(body)?.errors).map(optionalRecord);
      const details = errors
        .flatMap((error) => [optionalString(error?.title), optionalString(error?.detail), optionalString(error?.code)])
        .filter(Boolean)
        .join("; ");
      const badCredentials = response.status === 401 && errors.some((error) => error?.title === "Bad Credentials");
      throw new ProviderRequestError(
        response.status,
        `G2 request failed (${response.status})${details ? `: ${details}` : ""}`,
        undefined,
        badCredentials ? "authorization_failed" : "provider_error",
      );
    }
    return requiredResponseRecord(body, "G2 response");
  });
}
function cursor(link: unknown, parameter: string): string | null {
  const href = optionalString(link) ?? optionalString(optionalRecord(link)?.href);
  if (!href) return null;
  try {
    return new URL(href, baseUrl).searchParams.get(parameter);
  } catch {
    return null;
  }
}
function buildBody(body: NonNullable<G2Endpoint["body"]>, input: Record<string, unknown>) {
  const values = Object.fromEntries(
    Object.entries(body.fields)
      .filter(([key]) => input[key] !== undefined)
      .map(([key, name]) => [name, input[key]]),
  );
  if (body.mode === "json") return values;
  if (body.mode === "attributes")
    return {
      data: {
        type: body.resourceType,
        id: body.resourceId ? input[body.resourceId] : undefined,
        attributes: values,
      },
    };
  if (body.mode === "resource") return { data: { type: body.resourceType, id: values.id } };
  return { data: (values.id as string[]).map((id) => ({ type: body.resourceType, id })) };
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const endpoint = g2EndpointByName.get(actionName);
  if (!endpoint) throw providerInputError(`Unknown G2 action: ${actionName}`);
  const parameters = values;
  let path = endpoint.path;
  for (const [key, name] of Object.entries(endpoint.pathParameters)) {
    const placeholder = `{${name}}`;
    if (path.includes(placeholder)) path = path.replace(placeholder, encodeURIComponent(String(parameters[key])));
  }
  const query = new URLSearchParams();
  for (const [key, parameter] of Object.entries(endpoint.query)) {
    const value = parameters[key];
    if (value === undefined) continue;
    if (parameter.encoding === "deepObject") {
      const filters = requiredResponseRecord(value, "G2 dimension filters");
      for (const [field, filter] of Object.entries(filters)) query.set(`${parameter.name}[${field}]`, String(filter));
    } else if (Array.isArray(value)) {
      if (parameter.encoding === "repeat") {
        for (const item of value) query.append(parameter.name, String(item));
      } else {
        query.set(parameter.name, value.join(","));
      }
    } else query.set(parameter.name, String(value));
  }
  const result = await request(
    context.apiKey,
    path,
    query,
    context.fetcher,
    endpoint.method,
    endpoint.body ? { contentType: endpoint.body.contentType, value: buildBody(endpoint.body, parameters) } : undefined,
    context.signal,
  );
  if (endpoint.emptyResponse) return result;
  const links = optionalRecord(result.links);
  return {
    ...result,
    nextCursor: cursor(links?.next, "page[after]"),
    previousCursor: cursor(links?.prev, "page[before]"),
  };
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "g2",
  Object.fromEntries(
    g2Actions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const body = await request(
      input.apiKey,
      "/api/v2/categories",
      new URLSearchParams({ "page[size]": "1", "fields[categories]": "name" }),
      fetcher,
      undefined,
      undefined,
      signal,
    );
    if (!Array.isArray(body.data)) {
      throw providerResponseError("G2 category response is missing data");
    }
    return { profile: { displayName: "G2 API Token" }, grantedScopes: [], metadata: {} };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "g2",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  async customizeRequest({ headers: proxyHeaders }) {
    for (const [name, value] of Object.entries({ accept: "application/vnd.api+json" }))
      if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
  },
});
