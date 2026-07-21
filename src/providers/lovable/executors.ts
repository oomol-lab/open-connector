import type { CredentialValidators, CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";
import type { LovableActionName } from "./actions.ts";

import { defineBearerProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "lovable";
export const lovableMcpBaseUrl = "https://mcp.lovable.dev/";

async function requestLovableMcp(
  toolName: string,
  argumentsData: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Mcp-Protocol-Version": "2024-11-05",
  };

  if (context.accessToken.startsWith("lov_")) {
    headers["Lovable-API-Key"] = context.accessToken;
  } else {
    const tokenType = context.tokenType || "Bearer";
    headers["Authorization"] = `${tokenType} ${context.accessToken}`;
  }

  context.signal?.throwIfAborted();

  const response = await context.fetcher(lovableMcpBaseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: argumentsData,
      },
    }),
    signal: context.signal,
  });

  if (!response.ok) {
    throw new ProviderRequestError(response.status, `Lovable MCP server request failed with status ${response.status}`);
  }

  const json = (await response.json()) as any;
  if (json.error) {
    throw new ProviderRequestError(400, json.error.message || "Lovable MCP tool call returned an error", json.error);
  }

  const result = json.result;
  if (result?.isError) {
    const errorText = result.content?.[0]?.text || "Unknown Lovable MCP error";
    throw new ProviderRequestError(400, errorText);
  }

  const textContent = result?.content?.[0]?.text;
  if (typeof textContent === "string") {
    try {
      return JSON.parse(textContent);
    } catch {
      return textContent;
    }
  }

  return result;
}

export const lovableActionHandlers: Record<
  LovableActionName,
  (input: Record<string, unknown>, context: BearerProviderContext) => Promise<unknown>
> = {
  get_me(input, context) {
    return requestLovableMcp("get_me", input, context);
  },
  list_workspaces(input, context) {
    return requestLovableMcp("list_workspaces", input, context);
  },
  get_workspace(input, context) {
    return requestLovableMcp("get_workspace", input, context);
  },
  create_project(input, context) {
    return requestLovableMcp("create_project", input, context);
  },
  list_projects(input, context) {
    return requestLovableMcp("list_projects", input, context);
  },
  get_project(input, context) {
    return requestLovableMcp("get_project", input, context);
  },
  deploy_project(input, context) {
    return requestLovableMcp("deploy_project", input, context);
  },
  send_message(input, context) {
    return requestLovableMcp("send_message", input, context);
  },
  get_message(input, context) {
    return requestLovableMcp("get_message", input, context);
  },
  list_messages(input, context) {
    return requestLovableMcp("list_messages", input, context);
  },
  get_diff(input, context) {
    return requestLovableMcp("get_diff", input, context);
  },
  list_files(input, context) {
    return requestLovableMcp("list_files", input, context);
  },
  read_file(input, context) {
    return requestLovableMcp("read_file", input, context);
  },
  get_database_status(input, context) {
    return requestLovableMcp("get_database_status", input, context);
  },
  enable_database(input, context) {
    return requestLovableMcp("enable_database", input, context);
  },
  query_database(input, context) {
    return requestLovableMcp("query_database", input, context);
  },
};

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, lovableActionHandlers);

async function validateLovableCredential(
  auth: { apiKey?: string; accessToken?: string; tokenType?: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Mcp-Protocol-Version": "2024-11-05",
  };
  if (auth.apiKey) {
    headers["Lovable-API-Key"] = auth.apiKey;
  } else if (auth.accessToken) {
    const tokenType = auth.tokenType || "Bearer";
    headers["Authorization"] = `${tokenType} ${auth.accessToken}`;
  }

  const response = await fetcher(lovableMcpBaseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "validate",
      method: "tools/call",
      params: {
        name: "get_me",
        arguments: {},
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new ProviderRequestError(response.status, `Lovable API returned status ${response.status}`);
  }

  const json = (await response.json()) as any;
  if (json.error) {
    throw new ProviderRequestError(401, json.error.message || "Invalid credentials", json.error);
  }

  const result = json.result;
  if (result?.isError) {
    throw new ProviderRequestError(401, result.content?.[0]?.text || "Invalid credentials");
  }

  const textContent = result?.content?.[0]?.text;
  let user: any = null;
  if (typeof textContent === "string") {
    try {
      user = JSON.parse(textContent);
    } catch {
      user = { rawText: textContent };
    }
  }

  return {
    profile: {
      accountId: user?.user?.id || user?.id || "lovable-user",
      displayName: user?.user?.name || user?.name || user?.user?.email || user?.email || "Lovable User",
    },
    grantedScopes: [],
    metadata: {
      user,
    },
  };
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLovableCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateLovableCredential({ accessToken: input.accessToken, tokenType: input.tokenType }, fetcher, signal);
  },
};
