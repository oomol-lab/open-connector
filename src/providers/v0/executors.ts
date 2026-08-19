import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { V0ActionInput } from "./runtime-client.ts";

import {
  defineApiKeyProviderExecutors,
  getProviderActionHandler,
  mapProviderActionSources,
  ProviderRequestError,
} from "../provider-runtime.ts";
import {
  v0FindRateLimit,
  v0GetBilling,
  v0GetPlan,
  v0GetUsageReport,
  v0GetUser,
  v0GetUserScopes,
  validateV0Credential,
} from "./runtime-account.ts";
import {
  v0CreateChat,
  v0DeleteChat,
  v0FavoriteChat,
  v0FindChats,
  v0FindMessages,
  v0FindVersions,
  v0ForkChat,
  v0GetChat,
  v0GetMessage,
  v0GetVersion,
  v0InitChat,
  v0ResumeMessage,
  v0SendMessage,
  v0UpdateChat,
  v0UpdateVersion,
} from "./runtime-chats.ts";
import {
  v0CreateDeployment,
  v0FindDeploymentErrors,
  v0FindDeploymentLogs,
  v0FindDeployments,
  v0GetDeployment,
} from "./runtime-deployments.ts";
import {
  v0AssignProjectToChat,
  v0CreateEnvVars,
  v0CreateHook,
  v0CreateProject,
  v0CreateVercelProject,
  v0DeleteEnvVars,
  v0DeleteHook,
  v0DeleteProject,
  v0FindEnvVars,
  v0FindHooks,
  v0FindProjects,
  v0FindVercelProjects,
  v0GetEnvVar,
  v0GetHook,
  v0GetProject,
  v0GetProjectByChat,
  v0UpdateEnvVars,
  v0UpdateHook,
  v0UpdateProject,
} from "./runtime-projects.ts";

type V0ActionHandler = (input: V0ActionInput, fetcher: typeof fetch) => Promise<unknown>;
type V0ExecutorHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const v0ActionHandlers: ProviderActionHandlers<"v0", V0ActionHandler> = {
  get_user(input, fetcher) {
    return v0GetUser(input, fetcher);
  },
  find_projects(input, fetcher) {
    return v0FindProjects(input, fetcher);
  },
  create_project(input, fetcher) {
    return v0CreateProject(input, fetcher);
  },
  get_project(input, fetcher) {
    return v0GetProject(input, fetcher);
  },
  update_project(input, fetcher) {
    return v0UpdateProject(input, fetcher);
  },
  get_project_by_chat(input, fetcher) {
    return v0GetProjectByChat(input, fetcher);
  },
  assign_project_to_chat(input, fetcher) {
    return v0AssignProjectToChat(input, fetcher);
  },
  delete_project(input, fetcher) {
    return v0DeleteProject(input, fetcher);
  },
  find_env_vars(input, fetcher) {
    return v0FindEnvVars(input, fetcher);
  },
  get_env_var(input, fetcher) {
    return v0GetEnvVar(input, fetcher);
  },
  create_env_vars(input, fetcher) {
    return v0CreateEnvVars(input, fetcher);
  },
  update_env_vars(input, fetcher) {
    return v0UpdateEnvVars(input, fetcher);
  },
  delete_env_vars(input, fetcher) {
    return v0DeleteEnvVars(input, fetcher);
  },
  create_chat(input, fetcher) {
    return v0CreateChat(input, fetcher);
  },
  init_chat(input, fetcher) {
    return v0InitChat(input, fetcher);
  },
  send_message(input, fetcher) {
    return v0SendMessage(input, fetcher);
  },
  find_chats(input, fetcher) {
    return v0FindChats(input, fetcher);
  },
  get_chat(input, fetcher) {
    return v0GetChat(input, fetcher);
  },
  update_chat(input, fetcher) {
    return v0UpdateChat(input, fetcher);
  },
  favorite_chat(input, fetcher) {
    return v0FavoriteChat(input, fetcher);
  },
  fork_chat(input, fetcher) {
    return v0ForkChat(input, fetcher);
  },
  delete_chat(input, fetcher) {
    return v0DeleteChat(input, fetcher);
  },
  find_messages(input, fetcher) {
    return v0FindMessages(input, fetcher);
  },
  get_message(input, fetcher) {
    return v0GetMessage(input, fetcher);
  },
  resume_message(input, fetcher) {
    return v0ResumeMessage(input, fetcher);
  },
  find_versions(input, fetcher) {
    return v0FindVersions(input, fetcher);
  },
  get_version(input, fetcher) {
    return v0GetVersion(input, fetcher);
  },
  update_version(input, fetcher) {
    return v0UpdateVersion(input, fetcher);
  },
  create_deployment(input, fetcher) {
    return v0CreateDeployment(input, fetcher);
  },
  find_deployments(input, fetcher) {
    return v0FindDeployments(input, fetcher);
  },
  get_deployment(input, fetcher) {
    return v0GetDeployment(input, fetcher);
  },
  find_deployment_logs(input, fetcher) {
    return v0FindDeploymentLogs(input, fetcher);
  },
  find_deployment_errors(input, fetcher) {
    return v0FindDeploymentErrors(input, fetcher);
  },
  find_hooks(input, fetcher) {
    return v0FindHooks(input, fetcher);
  },
  create_hook(input, fetcher) {
    return v0CreateHook(input, fetcher);
  },
  get_hook(input, fetcher) {
    return v0GetHook(input, fetcher);
  },
  update_hook(input, fetcher) {
    return v0UpdateHook(input, fetcher);
  },
  delete_hook(input, fetcher) {
    return v0DeleteHook(input, fetcher);
  },
  find_rate_limit(input, fetcher) {
    return v0FindRateLimit(input, fetcher);
  },
  get_billing(input, fetcher) {
    return v0GetBilling(input, fetcher);
  },
  get_plan(input, fetcher) {
    return v0GetPlan(input, fetcher);
  },
  get_user_scopes(input, fetcher) {
    return v0GetUserScopes(input, fetcher);
  },
  get_usage_report(input, fetcher) {
    return v0GetUsageReport(input, fetcher);
  },
  create_vercel_project(input, fetcher) {
    return v0CreateVercelProject(input, fetcher);
  },
  find_vercel_projects(input, fetcher) {
    return v0FindVercelProjects(input, fetcher);
  },
};

const v0ExecutorHandlers: ProviderActionHandlers<"v0", V0ExecutorHandler> = mapProviderActionSources<
  "v0",
  typeof v0ActionHandlers,
  V0ExecutorHandler
>(
  "v0",
  v0ActionHandlers,
  (actionName, handler) => (input, context) => handler({ apiKey: context.apiKey, actionName, input }, context.fetcher),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("v0", v0ExecutorHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateV0Credential({ apiKey: input.apiKey }, fetcher);
  },
};

export async function executeV0Action(input: V0ActionInput, fetcher: typeof fetch): Promise<unknown> {
  const handler = input.actionName ? getProviderActionHandler(v0ActionHandlers, input.actionName) : undefined;
  if (!handler) {
    throw new ProviderRequestError(400, `unknown v0 action: ${input.actionName}`);
  }

  return handler(input, fetcher);
}
