import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { PollDefinition } from "../../triggers/common/poll.ts";
import type { GitHubActionContext, GitHubActionHandler } from "./runtime-shared.ts";

import { requireBearerCredential } from "../provider-credentials.ts";
import { combineProviderActionHandlers, defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  createGitHubInstallationTokenResolver,
  fetchGitHubAppInstallation,
  mintGitHubInstallationToken,
  readGitHubAppInstallationCredential,
} from "./app-installation.ts";
import { activityActionHandlers } from "./runtime-activity.ts";
import { issueActionHandlers } from "./runtime-issue.ts";
import { pullRequestActionHandlers } from "./runtime-pull-request.ts";
import { releaseActionHandlers } from "./runtime-release.ts";
import { repositoryActionHandlers } from "./runtime-repository.ts";
import { searchActionHandlers } from "./runtime-search.ts";
import { githubApiBaseUrl, githubApiVersion, githubDefaultAcceptHeader, githubRequestJson } from "./runtime-shared.ts";
import { githubRepoEvent } from "./trigger-on-repo-event.ts";
import { githubPullRequestListener } from "./trigger-watch-pull-request.ts";

const service = "github";
const { get_current_user, ...installationHandlers } = combineProviderActionHandlers<"github", GitHubActionHandler>(
  service,
  activityActionHandlers,
  repositoryActionHandlers,
  issueActionHandlers,
  pullRequestActionHandlers,
  releaseActionHandlers,
  searchActionHandlers,
);

export const executors: ProviderExecutors = {
  ...defineProviderExecutors<GitHubActionContext>({
    service,
    handlers: installationHandlers,
    async createContext(context, fetcher): Promise<GitHubActionContext> {
      const credential = await context.getCredential(service);
      if (credential?.authType === "custom_credential") {
        return {
          accessToken: await createGitHubInstallationTokenResolver(credential.values, fetcher)(context.signal),
          fetcher,
          transitFiles: context.transitFiles,
          signal: context.signal,
          installation: true,
        };
      }
      const bearer = await requireBearerCredential(context, service);
      return {
        accessToken: bearer.accessToken,
        fetcher,
        transitFiles: context.transitFiles,
        signal: context.signal,
      };
    },
  }),
  ...defineProviderExecutors<GitHubActionContext>({
    service,
    handlers: { get_current_user },
    async createContext(context, fetcher) {
      const credential = await context.getCredential(service);
      if (credential?.authType === "custom_credential") {
        throw new ProviderRequestError(
          400,
          "get_current_user requires a personal access token or OAuth user credential. This connection uses a GitHub App installation.",
        );
      }
      const bearer = await requireBearerCredential(context, service);
      return { accessToken: bearer.accessToken, fetcher, signal: context.signal };
    },
  }),
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: githubApiBaseUrl,
  // Resolved rather than `bearer`, because an installation credential has no
  // stored token: it is minted from the App key at request time.
  auth: {
    type: "bearer_resolver",
    async resolve({ context, fetcher }) {
      return { accessToken: await resolveGitHubAccessToken(context, fetcher) };
    },
  },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", githubDefaultAcceptHeader);
    headers.set("x-github-api-version", githubApiVersion);
  },
});

async function resolveGitHubAccessToken(context: ExecutionContext, fetcher: typeof fetch): Promise<string> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "custom_credential") {
    return createGitHubInstallationTokenResolver(credential.values, fetcher)(context.signal);
  }
  return (await requireBearerCredential(context, service)).accessToken;
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateGitHubToken(input.apiKey, fetcher);
  },
  async oauth2(input, { fetcher }) {
    return validateGitHubToken(input.accessToken, fetcher);
  },
  async customCredential(input, { fetcher, signal }) {
    return validateGitHubAppInstallation(input.values, fetcher, signal);
  },
};

async function validateGitHubToken(accessToken: string, fetcher: typeof fetch) {
  const user = await githubRequestJson<Record<string, unknown>>({
    path: "/user",
    accessToken,
    fetcher,
  });

  const login = typeof user.login === "string" ? user.login : undefined;
  const id = user.id === undefined ? undefined : String(user.id);
  const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : undefined;

  return {
    profile: {
      accountId: login ?? id ?? "github:user",
      displayName: name ?? login ?? id ?? "GitHub User",
    },
    metadata: {
      currentUser: user,
    },
  };
}

/**
 * Prove the three inputs agree with each other and with GitHub: the key signs
 * for this App (the installation lookup accepts the JWT), the installation
 * belongs to it, and a token can actually be minted. The profile is the
 * installation's account, identifying where the App is installed.
 */
async function validateGitHubAppInstallation(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const credential = readGitHubAppInstallationCredential(values);
  const installation = await fetchGitHubAppInstallation(credential, fetcher, signal);
  const minted = await mintGitHubInstallationToken(credential, fetcher, signal);

  const account = installation.account ?? {};
  const login = typeof account.login === "string" ? account.login : undefined;
  const accountId = account.id === undefined ? undefined : String(account.id);
  const accountType = typeof account.type === "string" ? account.type : undefined;
  if (!login && !accountId) {
    throw new ProviderRequestError(500, "GitHub described the installation without an account", 502);
  }

  return {
    profile: {
      accountId: login ?? accountId ?? `github:installation:${credential.installationId}`,
      displayName: `GitHub App installation on ${login ?? accountId}`,
      // Installation permissions are the closest thing to scopes an App has;
      // they are reported as `<permission>:<level>` so a consumer can see what
      // the credential may read without knowing GitHub's OAuth scope names.
      grantedScopes: Object.entries(minted.permissions).map(([permission, level]) => `${permission}:${level}`),
    },
    metadata: {
      appId: credential.appId,
      installationId: credential.installationId,
      accountType: accountType ?? null,
      repositorySelection: minted.repositorySelection ?? installation.repository_selection ?? null,
      permissions: minted.permissions,
    },
  };
}

export const triggers: readonly (IntegrationDefinition | PollDefinition)[] = [
  githubRepoEvent,
  githubPullRequestListener,
];
