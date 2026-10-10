import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { createPrivateKey } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createGitHubAppJwt, resolveGitHubAppInstallation, verifyGitHubUserInstallation } from "./app-auth.ts";

let privateKeyPem = "";
let publicKey: CryptoKey;

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256", { extractable: true });
  privateKeyPem = await exportPKCS8(keyPair.privateKey);
  publicKey = keyPair.publicKey;
});

describe("GitHub App authentication", () => {
  it("creates the short-lived app JWT GitHub requires", async () => {
    const token = await createGitHubAppJwt({
      appId: "12345",
      nowMs: Date.parse("2026-07-23T12:00:00.000Z"),
      privateKeyPem,
    });

    const verified = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
      currentDate: new Date("2026-07-23T12:00:00.000Z"),
    });
    expect(verified.payload).toMatchObject({
      exp: Date.parse("2026-07-23T12:09:00.000Z") / 1000,
      iat: Date.parse("2026-07-23T11:59:00.000Z") / 1000,
      iss: "12345",
    });
  });

  it("accepts the PKCS1 private key format downloaded from GitHub", async () => {
    const pkcs1PrivateKeyPem = createPrivateKey(privateKeyPem).export({ format: "pem", type: "pkcs1" }).toString();

    const token = await createGitHubAppJwt({
      appId: "12345",
      nowMs: Date.parse("2026-07-23T12:00:00.000Z"),
      privateKeyPem: pkcs1PrivateKeyPem,
    });

    const verified = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
      currentDate: new Date("2026-07-23T12:00:00.000Z"),
    });
    expect(verified.payload.iss).toBe("12345");
  });

  it("validates an active installation and mints a one-hour installation token", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: 987,
          account: {
            avatar_url: "https://avatars.githubusercontent.com/u/42?v=4",
            html_url: "https://github.com/amplifthq",
            id: 42,
            login: "amplifthq",
            type: "Organization",
          },
          app_id: 12345,
          permissions: {
            contents: "write",
            issues: "write",
            metadata: "read",
          },
          repository_selection: "selected",
          suspended_at: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          expires_at: "2026-07-23T13:00:00Z",
          permissions: {
            contents: "write",
            issues: "write",
            metadata: "read",
          },
          repository_selection: "selected",
          token: "ghs_installation_token",
        }),
      );

    const result = await resolveGitHubAppInstallation({
      fetcher,
      installationId: "987",
      runtimeConfig: githubAppRuntimeConfig,
    });

    expect(result).toMatchObject({
      accessToken: "ghs_installation_token",
      expiresAt: "2026-07-23T13:00:00Z",
      installation: {
        accountAvatarUrl: "https://avatars.githubusercontent.com/u/42?v=4",
        accountHtmlUrl: "https://github.com/amplifthq",
        accountId: "42",
        accountLogin: "amplifthq",
        accountType: "Organization",
        installationId: "987",
        repositorySelection: "selected",
      },
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/app/installations/987",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: expect.stringMatching(/^Bearer /u),
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/app/installations/987/access_tokens",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects suspended installations before minting a token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        id: 987,
        account: {
          avatar_url: "https://avatars.githubusercontent.com/u/42?v=4",
          html_url: "https://github.com/amplifthq",
          id: 42,
          login: "amplifthq",
          type: "Organization",
        },
        app_id: 12345,
        permissions: { metadata: "read" },
        repository_selection: "selected",
        suspended_at: "2026-07-23T12:00:00Z",
      }),
    );

    await expect(
      resolveGitHubAppInstallation({
        fetcher,
        installationId: "987",
        runtimeConfig: githubAppRuntimeConfig,
      }),
    ).rejects.toThrow("GitHub App installation is suspended");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("proves the authorizing GitHub user can access the exact installation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        total_count: 1,
        installations: [
          {
            id: 987,
            account: {
              avatar_url: "https://avatars.githubusercontent.com/u/42?v=4",
              html_url: "https://github.com/amplifthq",
              id: 42,
              login: "amplifthq",
              type: "Organization",
            },
            app_id: 12345,
            permissions: { metadata: "read" },
            repository_selection: "selected",
            suspended_at: null,
          },
        ],
      }),
    );

    await expect(
      verifyGitHubUserInstallation({
        accessToken: "ghu_user_token",
        fetcher,
        installationId: "987",
        runtimeConfig: githubAppRuntimeConfig,
      }),
    ).resolves.toMatchObject({
      accountId: "42",
      accountLogin: "amplifthq",
      accountType: "Organization",
      installationId: "987",
    });
  });

  it("fails closed when the user token cannot see the requested installation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        total_count: 0,
        installations: [],
      }),
    );

    await expect(
      verifyGitHubUserInstallation({
        accessToken: "ghu_user_token",
        fetcher,
        installationId: "987",
        runtimeConfig: githubAppRuntimeConfig,
      }),
    ).rejects.toThrow("The authorizing GitHub user cannot access this GitHub App installation");
  });
});

function githubAppRuntimeConfig(name: string): string | undefined {
  if (name === "OOMOL_CONNECT_GITHUB_APP_ID") {
    return "12345";
  }
  if (name === "OOMOL_CONNECT_GITHUB_APP_PRIVATE_KEY") {
    return privateKeyPem;
  }
  return undefined;
}
