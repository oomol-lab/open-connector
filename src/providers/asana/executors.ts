import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { AsanaActionHandler } from "./runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  combineProviderActionHandlers,
  defineBearerProviderExecutors,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { attachmentActionHandlers } from "./runtime-attachments.ts";
import { customFieldActionHandlers } from "./runtime-custom-fields.ts";
import { projectSectionActionHandlers } from "./runtime-projects-sections.ts";
import { storyTagActionHandlers } from "./runtime-stories-tags.ts";
import { taskActionHandlers } from "./runtime-tasks.ts";
import { workspaceUserTeamActionHandlers } from "./runtime-workspaces-users-teams.ts";
import { asanaApiBaseUrl, requestAsana } from "./runtime.ts";
import { readAsanaGrantedScopes } from "./scopes.ts";

const service = "asana";
const asanaValidationPath = "/users/me";

export const executors: ProviderExecutors = defineBearerProviderExecutors(
  service,
  combineProviderActionHandlers<"asana", AsanaActionHandler>(
    service,
    workspaceUserTeamActionHandlers,
    projectSectionActionHandlers,
    taskActionHandlers,
    storyTagActionHandlers,
    customFieldActionHandlers,
    attachmentActionHandlers,
  ),
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAsanaCredential(input.apiKey, [], fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateAsanaCredential(input.accessToken, readAsanaGrantedScopes(input.metadata.scope), fetcher, signal);
  },
};

async function validateAsanaCredential(
  accessToken: string,
  grantedScopes: string[],
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const payload = await requestAsana({
    path: asanaValidationPath,
    context: {
      accessToken,
      fetcher,
      signal,
    },
    phase: "validate",
    query: {
      opt_fields: ["name", "email", "workspaces", "workspaces.name"].join(","),
    },
  });

  const user = requiredRecord(payload.data, "asana user response", (message) => new ProviderRequestError(502, message));
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
      displayName: name ?? email ?? userId ?? "Authenticated user",
    },
    grantedScopes,
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
}
