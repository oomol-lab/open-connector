import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderActionName, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { OomolConsoleContext } from "./runtime.ts";

import { createProviderFetch, defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { createOomolConsoleMemberDirectory } from "./member-directory.ts";
import { defaultEndpoints } from "./request.ts";
import { executeOomolConsoleAction } from "./runtime.ts";

const service = "oomol_console";
const memberDirectory = createOomolConsoleMemberDirectory(defaultEndpoints);
export const oomolConsoleActionHandlers: ProviderActionHandlers<
  "oomol_console",
  ProviderRuntimeHandler<OomolConsoleContext>
> = {
  get_current_scope(input, context) {
    return executeAction("get_current_scope", input, context);
  },
  list_teams(input, context) {
    return executeAction("list_teams", input, context);
  },
  get_team_summary(input, context) {
    return executeAction("get_team_summary", input, context);
  },
  get_balance(input, context) {
    return executeAction("get_balance", input, context);
  },
  get_billing_summary(input, context) {
    return executeAction("get_billing_summary", input, context);
  },
  get_usage_breakdown(input, context) {
    return executeAction("get_usage_breakdown", input, context);
  },
  list_members(input, context) {
    return executeAction("list_members", input, context);
  },
  list_team_connections(input, context) {
    return executeAction("list_team_connections", input, context);
  },
  list_connection_permission_groups(input, context) {
    return executeAction("list_connection_permission_groups", input, context);
  },
  update_connection_default_permission_group(input, context) {
    return executeAction("update_connection_default_permission_group", input, context);
  },
  create_connection_permission_group(input, context) {
    return executeAction("create_connection_permission_group", input, context);
  },
  update_connection_permission_group(input, context) {
    return executeAction("update_connection_permission_group", input, context);
  },
  delete_connection_permission_group(input, context) {
    return executeAction("delete_connection_permission_group", input, context);
  },
  add_member(input, context) {
    return executeAction("add_member", input, context);
  },
  list_connection_executions(input, context) {
    return executeAction("list_connection_executions", input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OomolConsoleContext>({
  service,
  handlers: oomolConsoleActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OomolConsoleContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      teamId: credential.values.teamId?.trim() || undefined,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "OOMOL Console request failed",
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context: OomolConsoleContext = {
      apiKey: input.apiKey,
      teamId: input.values.teamId?.trim() || undefined,
      fetcher: createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    };
    const result = await executeOomolConsoleAction("list_teams", {}, context, context.fetcher, {
      endpoints: defaultEndpoints,
      memberDirectory,
    });
    const teams =
      typeof result === "object" && result != null && "teams" in result && Array.isArray(result.teams)
        ? result.teams
        : [];
    return {
      profile: {
        accountId: "oomol",
        displayName: "OOMOL Console",
      },
      grantedScopes: [],
      metadata: {
        accessibleTeamCount: teams.length,
        defaultTeamId: context.teamId,
      },
    };
  },
};

function executeAction(
  actionName: ProviderActionName<"oomol_console">,
  input: Record<string, unknown>,
  context: OomolConsoleContext,
): Promise<unknown> {
  return executeOomolConsoleAction(actionName, input, context, context.fetcher, {
    endpoints: defaultEndpoints,
    memberDirectory,
  });
}
