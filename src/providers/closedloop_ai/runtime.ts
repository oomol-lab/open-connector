import type { CredentialValidationResult, CredentialValidatorOptions, ResolvedCredential } from "../../core/types.ts";
import type { McpClientToolResult } from "../mcp-tools.ts";
import type { OAuthProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalString } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import { mapProviderActionHandlers } from "../provider-executors.ts";
import { providerResponseError } from "../provider-runtime.ts";
import { closedloopAiActions } from "./actions.ts";

const endpoint = "https://mcp.closedloop.sh";
const service = "closedloop_ai";

/** Preserve all content blocks when structured evidence and text warnings coexist. */
function retainEvidenceEnvelope(result: McpClientToolResult): McpClientToolResult {
  return "toolResult" in result ? result : { ...result, structuredContent: result };
}

export const closedloopAiActionHandlers: ProviderActionHandlers<
  typeof service,
  ProviderRuntimeHandler<OAuthProviderContext>
> = mapProviderActionHandlers(
  service,
  closedloopAiActions,
  (_action, name) =>
    async (input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> =>
      callMcpTool({
        endpoint,
        service,
        toolName: name,
        arguments: input,
        fetcher: context.fetcher,
        signal: context.signal,
        headers: { authorization: `Bearer ${context.accessToken}` },
        redirect: "manual",
        transformToolResult: retainEvidenceEnvelope,
      }),
);

/** Check current capability discovery without retrieving workspace data or inventing identity. */
export async function validateClosedloopAiCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  options: CredentialValidatorOptions,
): Promise<CredentialValidationResult> {
  const tools = await listMcpTools({
    endpoint,
    service,
    fetcher: options.fetcher,
    signal: options.signal,
    headers: { authorization: `Bearer ${credential.accessToken}` },
    redirect: "manual",
  });
  const available = new Set(tools.map((tool) => tool.name));
  const missing = closedloopAiActions.filter((action) => !available.has(action.name));
  if (missing.length)
    throw providerResponseError(
      `ClosedLoop AI does not advertise required tools: ${missing.map((action) => action.name).join(", ")}.`,
    );
  // Only echo scopes the provider actually returned, never requested defaults or discovery inference.
  return { grantedScopes: optionalString(credential.metadata.scope)?.split(/\s+/).filter(Boolean) };
}
