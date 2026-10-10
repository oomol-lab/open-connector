import type { ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { GitHubAppInstallationService } from "./installation-service.ts";

describe("GitHubAppInstallationService", () => {
  it("verifies user access, removes the temporary OAuth credential, and stores only the installation id", async () => {
    const calls: string[] = [];
    const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
      accessToken: "ghu_user_token",
      authType: "oauth2",
      metadata: {},
      profile: {
        accountId: "felix",
        displayName: "Felix",
        grantedScopes: [],
      },
      tokenType: "Bearer",
    };
    const connections = {
      connectWithCustomCredential: vi.fn(async (_service, input) => {
        calls.push(`connect:${input.connectionName}`);
        return {
          authType: "custom_credential" as const,
          health: { state: "unknown" as const, observedAt: "2026-01-01T00:00:00.000Z", expiresAt: null, reason: null },
          configured: true as const,
          connectionName: input.connectionName,
          default: false,
          id: "connection-1",
          profile: {
            accountId: "organization:42",
            displayName: "amplifthq (GitHub App)",
            grantedScopes: [],
          },
          service: "github",
          virtual: false,
        };
      }),
      disconnect: vi.fn(async (_service, connectionName) => {
        calls.push(`disconnect:${connectionName}`);
        return {
          configured: false as const,
          connectionName,
          service: "github",
        };
      }),
      getCredential: vi.fn(async () => oauthCredential),
    };
    const verifyUserInstallation = vi.fn(async () => ({
      accountAvatarUrl: "https://avatars.githubusercontent.com/u/42?v=4",
      accountHtmlUrl: "https://github.com/amplifthq",
      accountId: "42",
      accountLogin: "amplifthq",
      accountType: "Organization" as const,
      installationId: "987",
      permissions: { metadata: "read" },
      repositorySelection: "selected" as const,
    }));
    const service = new GitHubAppInstallationService({
      connections,
      runtimeConfig: githubAppRuntimeConfig,
      verifyUserInstallation,
    });

    await expect(
      service.complete({
        installationId: "987",
        targetConnectionName: "organization:org-1:github",
        verificationConnectionName: "github-install-verifier:state-1",
      }),
    ).resolves.toMatchObject({
      configured: true,
      connectionName: "organization:org-1:github",
    });
    expect(verifyUserInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "ghu_user_token",
        installationId: "987",
      }),
    );
    expect(calls).toEqual(["connect:organization:org-1:github", "disconnect:github-install-verifier:state-1"]);
    expect(connections.connectWithCustomCredential).toHaveBeenCalledWith("github", {
      connectionName: "organization:org-1:github",
      values: { installationId: "987" },
    });
  });

  it("rejects an installation for a different GitHub account before storing it", async () => {
    const connections = {
      connectWithCustomCredential: vi.fn(),
      disconnect: vi.fn(),
      getCredential: vi.fn(async () => githubUserCredential),
    };
    const service = new GitHubAppInstallationService({
      connections,
      runtimeConfig: githubAppRuntimeConfig,
      verifyUserInstallation: vi.fn(async () => githubInstallation),
    });
    await expect(
      service.complete({
        expectedAccountLogin: "other-org",
        installationId: "987",
        targetConnectionName: "org_target",
        verificationConnectionName: "github_verify_test",
      }),
    ).rejects.toThrow("different account");
    expect(connections.connectWithCustomCredential).not.toHaveBeenCalled();
  });

  it("selects only an unambiguous organization installation of the configured App", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        installations: [
          { id: 111, app_id: 99999, account: { id: 1, login: "wrong-app", type: "Organization" } },
          {
            id: 987,
            app_id: 12345,
            account: {
              id: 42,
              login: "amplifthq",
              type: "Organization",
              avatar_url: "https://github.com/avatar",
              html_url: "https://github.com/amplifthq",
            },
            repository_selection: "all",
          },
        ],
      }),
    );
    const service = new GitHubAppInstallationService({
      connections: {
        connectWithCustomCredential: vi.fn(),
        disconnect: vi.fn(),
        getCredential: vi.fn(async () => githubUserCredential),
      },
      fetcher,
      runtimeConfig: githubAppRuntimeConfig,
    });
    await expect(
      service.findAccessibleInstallation({ verificationConnectionName: "github_verify_test" }),
    ).resolves.toMatchObject({ accountLogin: "amplifthq", installationId: "987" });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/user/installations"), expect.anything());
  });

  it.each([
    ["another App", [{ id: 987, app_id: 99999, account: { id: 42, login: "amplifthq", type: "Organization" } }]],
    ["no accessible installation", []],
  ])("rejects %s during reconnect", async (_case, installations) => {
    const service = new GitHubAppInstallationService({
      connections: {
        connectWithCustomCredential: vi.fn(),
        disconnect: vi.fn(),
        getCredential: vi.fn(async () => githubUserCredential),
      },
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ installations })),
      runtimeConfig: githubAppRuntimeConfig,
    });
    await expect(
      service.findAccessibleInstallation({ verificationConnectionName: "github_verify_test" }),
    ).rejects.toThrow("cannot access an organization installation");
  });

  it("refuses to guess when the user can access two organization installations", async () => {
    const makeInstallation = (id: number, login: string) => ({
      id,
      app_id: 12345,
      account: {
        id,
        login,
        type: "Organization",
        avatar_url: "https://github.com/avatar",
        html_url: `https://github.com/${login}`,
      },
      repository_selection: "all",
    });
    const service = new GitHubAppInstallationService({
      connections: {
        connectWithCustomCredential: vi.fn(),
        disconnect: vi.fn(),
        getCredential: vi.fn(async () => githubUserCredential),
      },
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ installations: [makeInstallation(987, "amplifthq"), makeInstallation(988, "another-org")] }),
        ),
      runtimeConfig: githubAppRuntimeConfig,
    });
    await expect(
      service.findAccessibleInstallation({ verificationConnectionName: "github_verify_test" }),
    ).rejects.toThrow("More than one organization installation");
  });

  it("keeps the temporary user authorization when storing the installation fails", async () => {
    const connections = {
      connectWithCustomCredential: vi.fn(async () => {
        throw new Error("credential store unavailable");
      }),
      disconnect: vi.fn(),
      getCredential: vi.fn(async () => githubUserCredential),
    };
    const service = new GitHubAppInstallationService({
      connections,
      runtimeConfig: githubAppRuntimeConfig,
      verifyUserInstallation: vi.fn(async () => githubInstallation),
    });

    await expect(
      service.complete({
        installationId: "987",
        targetConnectionName: "organization:org-1:github",
        verificationConnectionName: "github-install-verifier:state-1",
      }),
    ).rejects.toThrow("credential store unavailable");
    expect(connections.disconnect).not.toHaveBeenCalled();
  });

  it("preserves a GitHub service failure instead of presenting it as an authorization failure", async () => {
    const providerError = new ProviderRequestError(502, "GitHub request failed");
    const connections = {
      connectWithCustomCredential: vi.fn(),
      disconnect: vi.fn(),
      getCredential: vi.fn(async () => githubUserCredential),
    };
    const service = new GitHubAppInstallationService({
      connections,
      runtimeConfig: githubAppRuntimeConfig,
      verifyUserInstallation: vi.fn(async () => {
        throw providerError;
      }),
    });

    await expect(
      service.complete({
        installationId: "987",
        targetConnectionName: "organization:org-1:github",
        verificationConnectionName: "github-install-verifier:state-1",
      }),
    ).rejects.toBe(providerError);
    expect(connections.connectWithCustomCredential).not.toHaveBeenCalled();
    expect(connections.disconnect).not.toHaveBeenCalled();
  });

  it("fails before changing connections when the verifier is not a GitHub user token", async () => {
    const connections = {
      connectWithCustomCredential: vi.fn(),
      disconnect: vi.fn(),
      getCredential: vi.fn(async () => ({
        apiKey: "github_pat",
        authType: "api_key" as const,
        metadata: {},
        profile: {
          accountId: "felix",
          displayName: "Felix",
          grantedScopes: [],
        },
        values: { apiKey: "github_pat" },
      })),
    };
    const service = new GitHubAppInstallationService({
      connections,
      runtimeConfig: githubAppRuntimeConfig,
      verifyUserInstallation: vi.fn(),
    });

    await expect(
      service.complete({
        installationId: "987",
        targetConnectionName: "organization:org-1:github",
        verificationConnectionName: "github-install-verifier:state-1",
      }),
    ).rejects.toThrow("GitHub App installation verification requires a GitHub user access token");
    expect(connections.disconnect).not.toHaveBeenCalled();
    expect(connections.connectWithCustomCredential).not.toHaveBeenCalled();
  });

  it("rejects a target that would overwrite the temporary verifier connection", async () => {
    const connections = {
      connectWithCustomCredential: vi.fn(),
      disconnect: vi.fn(),
      getCredential: vi.fn(),
    };
    const service = new GitHubAppInstallationService({
      connections,
      runtimeConfig: githubAppRuntimeConfig,
      verifyUserInstallation: vi.fn(),
    });

    await expect(
      service.complete({
        installationId: "987",
        targetConnectionName: "same",
        verificationConnectionName: "same",
      }),
    ).rejects.toThrow("The target GitHub connection must differ from the verification connection");
  });
});

const githubUserCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  accessToken: "ghu_user_token",
  authType: "oauth2",
  metadata: {},
  profile: {
    accountId: "felix",
    displayName: "Felix",
    grantedScopes: [],
  },
  tokenType: "Bearer",
};

const githubInstallation = {
  accountAvatarUrl: "https://avatars.githubusercontent.com/u/42?v=4",
  accountHtmlUrl: "https://github.com/amplifthq",
  accountId: "42",
  accountLogin: "amplifthq",
  accountType: "Organization" as const,
  installationId: "987",
  permissions: { metadata: "read" },
  repositorySelection: "selected" as const,
};

function githubAppRuntimeConfig(name: string): string | undefined {
  if (name === "OOMOL_CONNECT_GITHUB_APP_ID") {
    return "12345";
  }
  if (name === "OOMOL_CONNECT_GITHUB_APP_PRIVATE_KEY") {
    return "private-key";
  }
  return undefined;
}
