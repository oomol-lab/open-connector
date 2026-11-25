import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderRequestContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const yuqueBaseUrl = "https://www.yuque.com/api/v2";
export const yuqueHeaders: Record<string, string> = { "accept": "application/json", "user-agent": providerUserAgent };

function segment(value: unknown): string {
  const text = String(value);
  if (!text || text === "." || text === ".." || text.includes("/") || text.includes("\\") || text.includes("%")) {
    throw providerInputError("Yuque identifiers must be single, unencoded path segments");
  }
  return encodeURIComponent(text);
}

function repoPath(value: unknown): string {
  if (typeof value === "number") return segment(value);
  const parts = String(value).split("/");
  if (parts.length !== 1 && parts.length !== 2) {
    throw providerInputError("repo must be an ID or owner/repository namespace");
  }
  if (parts.length === 1 && !Number.isInteger(Number(parts[0]))) {
    throw providerInputError("repo must be an ID or owner/repository namespace");
  }
  return parts.map(segment).join("/");
}

export async function requestYuque(
  apiKey: string,
  context: ProviderRequestContext,
  endpoint: string,
  method = "GET",
  fields: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Yuque", signal: context.signal }, async (signal) => {
    const url = new URL(`${yuqueBaseUrl}${endpoint}`);
    if (method === "GET") {
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const response = await context.fetcher(url, {
      method,
      signal,
      headers: { ...yuqueHeaders, "X-Auth-Token": apiKey, "content-type": "application/json" },
      body: method === "POST" || method === "PUT" ? JSON.stringify(fields) : undefined,
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Yuque returned a non-JSON response (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const payload = optionalRecord(parsed);
    if (!response.ok) {
      const message = optionalString(payload?.message) ?? optionalString(payload?.error);
      const code = payload?.code ?? payload?.status;
      const details = [code == null ? undefined : String(code), message].filter(Boolean).join(": ");
      throw new ProviderRequestError(
        response.status,
        `Yuque request failed (HTTP ${response.status})${details ? `: ${details}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(parsed, "Yuque response");
  });
}

export const yuqueHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_current_user: (_input, context) => requestYuque(context.apiKey, context, "/user"),
  list_user_groups: ({ user, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/users/${segment(user)}/groups`, "GET", fields),
  list_group_members: ({ group, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/groups/${segment(group)}/users`, "GET", fields),
  search: (input, context) => requestYuque(context.apiKey, context, "/search", "GET", input),
  list_repositories: ({ owner, ownerType, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/${ownerType}/${segment(owner)}/repos`, "GET", fields),
  create_repository: ({ owner, ownerType, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/${ownerType}/${segment(owner)}/repos`, "POST", fields),
  get_repository: ({ repo }, context) => requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}`),
  update_repository: ({ repo, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}`, "PUT", fields),
  delete_repository: ({ repo }, context) => requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}`, "DELETE"),
  list_documents: ({ repo, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}/docs`, "GET", fields),
  create_document: ({ repo, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}/docs`, "POST", fields),
  get_document: ({ repo, id, ...fields }, context) =>
    requestYuque(
      context.apiKey,
      context,
      repo === undefined ? `/repos/docs/${segment(id)}` : `/repos/${repoPath(repo)}/docs/${segment(id)}`,
      "GET",
      fields,
    ),
  update_document: ({ repo, id, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}/docs/${segment(id)}`, "PUT", fields),
  delete_document: ({ repo, id }, context) =>
    requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}/docs/${segment(id)}`, "DELETE"),
  list_document_versions: (input, context) => requestYuque(context.apiKey, context, "/doc_versions", "GET", input),
  get_document_version: ({ id }, context) => requestYuque(context.apiKey, context, `/doc_versions/${segment(id)}`),
  get_table_of_contents: ({ repo }, context) => requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}/toc`),
  update_table_of_contents: ({ repo, ...fields }, context) =>
    requestYuque(context.apiKey, context, `/repos/${repoPath(repo)}/toc`, "PUT", fields),
};
