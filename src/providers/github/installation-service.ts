import type { ConnectionSummary, ConnectWithCredentialInput } from "../../connection-service.ts";
import type { ResolvedCredential, RuntimeConfigReader } from "../../core/types.ts";
import type { GitHubAppInstallation, verifyGitHubUserInstallation } from "./app-auth.ts";

import { ConnectionError } from "../../connection-service.ts";
import { ProviderRequestError, providerFetch } from "../provider-runtime.ts";
import {
  listGitHubUserInstallations,
  resolveGitHubAppInstallation,
  verifyGitHubUserInstallation as verifyGitHubUserInstallationDefault,
} from "./app-auth.ts";

type GitHubConnectionManager = {
  connectWithCustomCredential(service: string, input: ConnectWithCredentialInput): Promise<ConnectionSummary>;
  disconnect(service: string, connectionName?: string): Promise<unknown>;
  getCredential(service: string, connectionName?: string): Promise<ResolvedCredential | undefined>;
};

type VerifyGitHubUserInstallation = typeof verifyGitHubUserInstallation;

export class GitHubAppInstallationService {
  private readonly connections: GitHubConnectionManager;
  private readonly fetcher: typeof fetch;
  private readonly runtimeConfig?: RuntimeConfigReader;
  private readonly verifyUserInstallation: VerifyGitHubUserInstallation;

  constructor(input: {
    connections: GitHubConnectionManager;
    fetcher?: typeof fetch;
    runtimeConfig?: RuntimeConfigReader;
    verifyUserInstallation?: VerifyGitHubUserInstallation;
  }) {
    this.connections = input.connections;
    this.fetcher = input.fetcher ?? providerFetch;
    this.runtimeConfig = input.runtimeConfig;
    this.verifyUserInstallation = input.verifyUserInstallation ?? verifyGitHubUserInstallationDefault;
  }

  async resolveInstallationToken(installationId: string, signal?: AbortSignal): Promise<string> {
    const installation = await resolveGitHubAppInstallation({
      fetcher: this.fetcher,
      installationId,
      runtimeConfig: this.runtimeConfig,
      signal,
    });
    return installation.accessToken;
  }

  async complete(input: {
    expectedAccountLogin?: string;
    installationId: string;
    targetConnectionName: string;
    verificationConnectionName: string;
  }): Promise<ConnectionSummary> {
    const installationId = requireText(input.installationId, "GitHub App installation id");
    const targetConnectionName = requireText(input.targetConnectionName, "Target GitHub connection name");
    const verificationConnectionName = requireText(
      input.verificationConnectionName,
      "GitHub verification connection name",
    );
    if (targetConnectionName === verificationConnectionName) {
      throw new ConnectionError(
        "invalid_input",
        "The target GitHub connection must differ from the verification connection.",
      );
    }

    const verificationCredential = await this.connections.getCredential("github", verificationConnectionName);
    if (verificationCredential?.authType !== "oauth2") {
      throw new ConnectionError(
        "credential_verification_failed",
        "GitHub App installation verification requires a GitHub user access token.",
      );
    }

    const installation = await this.verifyInstallationAccess({
      accessToken: verificationCredential.accessToken,
      installationId,
    });
    if (
      input.expectedAccountLogin &&
      installation.accountLogin.toLowerCase() !== input.expectedAccountLogin.toLowerCase()
    ) {
      throw new ConnectionError(
        "credential_verification_failed",
        "The GitHub App installation belongs to a different account.",
      );
    }

    const connection = await this.connections.connectWithCustomCredential("github", {
      connectionName: targetConnectionName,
      values: { installationId },
    });
    await this.connections.disconnect("github", verificationConnectionName);
    return connection;
  }

  async findAccessibleInstallation(input: {
    accountLogin?: string;
    verificationConnectionName: string;
  }): Promise<GitHubAppInstallation> {
    const credential = await this.connections.getCredential(
      "github",
      requireText(input.verificationConnectionName, "GitHub verification connection name"),
    );
    if (credential?.authType !== "oauth2") {
      throw new ConnectionError("credential_verification_failed", "GitHub user authorization is not complete.");
    }
    const installations = await listGitHubUserInstallations({
      accessToken: credential.accessToken,
      fetcher: this.fetcher,
      runtimeConfig: this.runtimeConfig,
    });
    const organizations = installations.filter(
      (installation) =>
        installation.accountType === "Organization" &&
        (!input.accountLogin || installation.accountLogin.toLowerCase() === input.accountLogin.trim().toLowerCase()),
    );
    if (organizations.length !== 1) {
      throw new ConnectionError(
        "credential_verification_failed",
        organizations.length === 0
          ? "This GitHub user cannot access an organization installation of this App."
          : "More than one organization installation is accessible. OpenMeld cannot choose an account safely.",
      );
    }
    return organizations[0]!;
  }

  private async verifyInstallationAccess(input: {
    accessToken: string;
    installationId: string;
  }): Promise<GitHubAppInstallation> {
    try {
      return await this.verifyUserInstallation({
        accessToken: input.accessToken,
        fetcher: this.fetcher,
        installationId: input.installationId,
        runtimeConfig: this.runtimeConfig,
      });
    } catch (error) {
      if (!(error instanceof ProviderRequestError && (error.status === 401 || error.status === 403))) {
        throw error;
      }
      throw new ConnectionError("credential_verification_failed", error.message);
    }
  }
}

function requireText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ConnectionError("invalid_input", `${fieldName} is required.`);
  }
  return normalized;
}
