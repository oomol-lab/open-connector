import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { GitHubActionContext, GitHubActionHandler } from "./runtime-shared.ts";

import { defineProviderExecutors, requireBearerCredential } from "../provider-runtime.ts";
import { activityActionHandlers } from "./runtime-activity.ts";
import { issueActionHandlers } from "./runtime-issue.ts";
import { pullRequestActionHandlers } from "./runtime-pull-request.ts";
import { releaseActionHandlers } from "./runtime-release.ts";
import { repositoryActionHandlers } from "./runtime-repository.ts";
import { searchActionHandlers } from "./runtime-search.ts";
import { githubRequestJson } from "./runtime-shared.ts";

const service = "github";

export const executors: ProviderExecutors = defineProviderExecutors<GitHubActionContext>({
  service,
  handlers: Object.assign(
    {},
    activityActionHandlers,
    repositoryActionHandlers,
    issueActionHandlers,
    pullRequestActionHandlers,
    releaseActionHandlers,
    searchActionHandlers,
  ),
  async createContext(context, fetcher): Promise<GitHubActionContext> {
    const credential = await requireBearerCredential(context, service);
    return {
      accessToken: credential.accessToken,
      fetcher,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }): Promise<void> {
    await validateGitHubToken(input.apiKey, fetcher);
  },
  async oauth2(input, { fetcher }): Promise<void> {
    await validateGitHubToken(input.accessToken, fetcher);
  },
};

async function validateGitHubToken(accessToken: string, fetcher: typeof fetch): Promise<void> {
  await githubRequestJson<Record<string, unknown>>({
    path: "/user",
    accessToken,
    fetcher,
  });
}
