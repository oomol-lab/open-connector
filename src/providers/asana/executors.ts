import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { AsanaContext } from "./runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError, requireApiKeyCredential } from "../provider-runtime.ts";
import { attachmentActionHandlers } from "./runtime-attachments.ts";
import { customFieldActionHandlers } from "./runtime-custom-fields.ts";
import { projectSectionActionHandlers } from "./runtime-projects-sections.ts";
import { storyTagActionHandlers } from "./runtime-stories-tags.ts";
import { taskActionHandlers } from "./runtime-tasks.ts";
import { workspaceUserTeamActionHandlers } from "./runtime-workspaces-users-teams.ts";
import { asanaApiBaseUrl, requestAsana } from "./runtime.ts";

const service = "asana";
const asanaValidationPath = "/users/me";

export const executors: ProviderExecutors = defineProviderExecutors<AsanaContext>({
  service,
  handlers: Object.assign(
    {},
    workspaceUserTeamActionHandlers,
    projectSectionActionHandlers,
    taskActionHandlers,
    storyTagActionHandlers,
    customFieldActionHandlers,
    attachmentActionHandlers,
  ),
  async createContext(context, fetcher): Promise<AsanaContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAsana({
      path: asanaValidationPath,
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
      query: {
        opt_fields: ["name", "email", "workspaces", "workspaces.name"].join(","),
      },
    });

    const user = requiredRecord(
      payload.data,
      "asana user response",
      (message) => new ProviderRequestError(502, message),
    );
    const userId = optionalString(user.gid);
    const name = optionalString(user.name);
    const email = optionalString(user.email);
    const workspaces = Array.isArray(user.workspaces)
      ? user.workspaces.map((workspace) => optionalRecord(workspace)).filter((workspace) => !!workspace)
      : [];
    const workspaceNames = workspaces
      .map((workspace) => optionalString(workspace.name))
      .filter((workspaceName) => !!workspaceName);

    return {
      profile: {
        accountId: userId,
        displayName: name ?? email ?? "Asana PAT",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: asanaApiBaseUrl,
        validationEndpoint: asanaValidationPath,
        userId,
        name,
        email,
        workspaceCount: workspaces.length,
        workspaceNames,
      }),
    };
  },
};
