import type { GitHubActionHandler } from "./runtime-shared.ts";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { optionalInteger, optionalString, optionalStringArray } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import { compactObject } from "./runtime-shared.ts";

// GitHub Projects v2 is GraphQL-only — there is no REST equivalent, so unlike every
// other action in this provider (runtime-{activity,issue,pull-request,release,
// repository,search}.ts, all REST-backed), these proxy to GitHub's own hosted
// github-mcp-server instead. See docs/features/github-projects-support/PLAN.md for
// the full rationale, including why this is additive (the REST actions are untouched)
// rather than a replacement of the provider.
const githubMcpEndpoint = "https://api.githubcopilot.com/mcp/";

// "projects" is an opt-in toolset on github-mcp-server — NOT part of its default
// toolset (context, repos, issues, pull_requests, users) — so it must be requested
// explicitly on every connection via this header, which the hosted endpoint supports
// per-request (docs/remote-server.md's X-MCP-Toolsets header). No self-hosted server
// needed.
const githubProjectsToolsetHeader = "projects";

// github-mcp-server's own parameter names are snake_case (owner_type, project_number,
// field_names, per_page, status_update_id, ...). Every other action in this provider
// uses camelCase (issueNumber, pullNumber, perPage, ...), so these handlers translate
// explicitly rather than passing field names straight through — keeps the whole
// provider's action surface uniform for a caller working across many GitHub actions.
export const projectActionHandlers: Record<string, GitHubActionHandler> = {
  list_projects(input, { accessToken, fetcher }) {
    return callGithubProjectsListTool(
      "list_projects",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        query: optionalString(input.query),
        per_page: optionalInteger(input.perPage),
        after: optionalString(input.after),
        before: optionalString(input.before),
      },
      accessToken,
      fetcher,
    );
  },
  list_project_fields(input, { accessToken, fetcher }) {
    return callGithubProjectsListTool(
      "list_project_fields",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        project_number: optionalInteger(input.projectNumber),
        per_page: optionalInteger(input.perPage),
        after: optionalString(input.after),
        before: optionalString(input.before),
      },
      accessToken,
      fetcher,
    );
  },
  list_project_items(input, { accessToken, fetcher }) {
    return callGithubProjectsListTool(
      "list_project_items",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        project_number: optionalInteger(input.projectNumber),
        query: optionalString(input.query),
        fields: optionalStringArray(input.fields),
        field_names: optionalStringArray(input.fieldNames),
        per_page: optionalInteger(input.perPage),
        after: optionalString(input.after),
        before: optionalString(input.before),
      },
      accessToken,
      fetcher,
    );
  },
  list_project_status_updates(input, { accessToken, fetcher }) {
    return callGithubProjectsListTool(
      "list_project_status_updates",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        project_number: optionalInteger(input.projectNumber),
        per_page: optionalInteger(input.perPage),
        after: optionalString(input.after),
        before: optionalString(input.before),
      },
      accessToken,
      fetcher,
    );
  },
  get_project(input, { accessToken, fetcher }) {
    return callGithubProjectsGetTool(
      "get_project",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        project_number: optionalInteger(input.projectNumber),
      },
      accessToken,
      fetcher,
    );
  },
  get_project_field(input, { accessToken, fetcher }) {
    return callGithubProjectsGetTool(
      "get_project_field",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        project_number: optionalInteger(input.projectNumber),
        field_id: optionalInteger(input.fieldId),
      },
      accessToken,
      fetcher,
    );
  },
  get_project_item(input, { accessToken, fetcher }) {
    return callGithubProjectsGetTool(
      "get_project_item",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        project_number: optionalInteger(input.projectNumber),
        item_id: optionalInteger(input.itemId),
        fields: optionalStringArray(input.fields),
        field_names: optionalStringArray(input.fieldNames),
      },
      accessToken,
      fetcher,
    );
  },
  get_project_status_update(input, { accessToken, fetcher }) {
    return callGithubProjectsGetTool(
      "get_project_status_update",
      {
        owner: optionalString(input.owner),
        owner_type: optionalString(input.ownerType),
        project_number: optionalInteger(input.projectNumber),
        status_update_id: optionalString(input.statusUpdateId),
      },
      accessToken,
      fetcher,
    );
  },
};

function callGithubProjectsListTool(
  method: string,
  args: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  return callGithubProjectsTool("projects_list", { method, ...args }, accessToken, fetcher);
}

function callGithubProjectsGetTool(
  method: string,
  args: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  return callGithubProjectsTool("projects_get", { method, ...args }, accessToken, fetcher);
}

async function callGithubProjectsTool(
  toolName: "projects_list" | "projects_get",
  args: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("user-agent", providerUserAgent);
  headers.set("x-mcp-toolsets", githubProjectsToolsetHeader);

  const transport = new StreamableHTTPClientTransport(new URL(githubMcpEndpoint), {
    fetch: fetcher,
    requestInit: { headers },
  });
  const client = new Client({ name: "open-connector", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: compactObject(args) });
    if (result.isError) {
      const content = result.content as Array<{ type?: string; text?: string }> | undefined;
      const text = content?.find((c) => c.type === "text")?.text;
      throw new ProviderRequestError(502, text ?? "GitHub Projects MCP tool returned an unknown error.");
    }
    return result as Record<string, unknown>;
  } catch (error) {
    throw mapGithubProjectsMcpError(error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function mapGithubProjectsMcpError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    // The most likely 401 cause here specifically is the added 'project' scope not
    // having been granted yet on an existing connection — say so plainly rather than
    // a generic "unauthorized", since the fix (reconnect) differs from a truly revoked
    // credential.
    return new ProviderRequestError(
      401,
      "GitHub Projects request was unauthorized — the connection may be missing the " +
        "'project' OAuth scope. Reconnect GitHub to grant it.",
    );
  }
  if (error instanceof StreamableHTTPError) {
    const status = error.code;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `GitHub Projects MCP request failed: ${error.message}`,
    );
  }
  if (error instanceof McpError) {
    return new ProviderRequestError(502, `GitHub Projects MCP request failed: ${error.message}`);
  }
  return new ProviderRequestError(
    502,
    `GitHub Projects MCP request failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}
