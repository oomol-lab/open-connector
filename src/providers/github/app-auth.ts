import type { RuntimeConfigReader } from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerResponseError } from "../provider-runtime.ts";
import { githubApiBaseUrl, githubHeaders, normalizeGitHubError, readJsonResponse } from "./runtime-shared.ts";

export const githubAppIdConfigName = "OOMOL_CONNECT_GITHUB_APP_ID";
export const githubAppPrivateKeyConfigName = "OOMOL_CONNECT_GITHUB_APP_PRIVATE_KEY";

const GITHUB_APP_JWT_LIFETIME_SECONDS = 9 * 60;
const GITHUB_APP_JWT_CLOCK_SKEW_SECONDS = 60;
const MAX_USER_INSTALLATION_PAGES = 10;
const PKCS1_PRIVATE_KEY_HEADER = "-----BEGIN RSA PRIVATE KEY-----";
const PKCS1_PRIVATE_KEY_FOOTER = "-----END RSA PRIVATE KEY-----";
const RSA_ALGORITHM_IDENTIFIER = Uint8Array.of(
  0x30,
  0x0d,
  0x06,
  0x09,
  0x2a,
  0x86,
  0x48,
  0x86,
  0xf7,
  0x0d,
  0x01,
  0x01,
  0x01,
  0x05,
  0x00,
);

type GitHubAppInstallationPayload = {
  account?: {
    avatar_url?: string;
    html_url?: string;
    id?: number | string;
    login?: string;
    type?: string;
  };
  app_id?: number | string;
  id?: number | string;
  permissions?: Record<string, unknown>;
  repository_selection?: string;
  suspended_at?: string | null;
};

type GitHubAppInstallationTokenPayload = {
  expires_at?: string;
  permissions?: Record<string, unknown>;
  repository_selection?: string;
  token?: string;
};

export type GitHubAppInstallation = {
  accountAvatarUrl: string;
  accountHtmlUrl: string;
  accountId: string;
  accountLogin: string;
  accountType: "Organization" | "User";
  installationId: string;
  permissions: Record<string, string>;
  repositorySelection: "all" | "selected";
};

export type ResolvedGitHubAppInstallation = {
  accessToken: string;
  expiresAt: string;
  installation: GitHubAppInstallation;
};

export async function createGitHubAppJwt(input: {
  appId: string;
  nowMs?: number;
  privateKeyPem: string;
}): Promise<string> {
  const { importPKCS8, SignJWT } = await import("jose");
  const appId = requirePositiveIntegerText(input.appId, "GitHub App id");
  const privateKeyPem = normalizePrivateKey(input.privateKeyPem);
  let privateKey: CryptoKey;
  try {
    privateKey = await importPKCS8(privateKeyPem, "RS256");
  } catch {
    throw new ProviderRequestError(
      503,
      `${githubAppPrivateKeyConfigName} must be an unencrypted RSA private key in PEM format.`,
    );
  }
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt(nowSeconds - GITHUB_APP_JWT_CLOCK_SKEW_SECONDS)
    .setExpirationTime(nowSeconds + GITHUB_APP_JWT_LIFETIME_SECONDS)
    .setIssuer(appId)
    .sign(privateKey);
}

export async function resolveGitHubAppInstallation(input: {
  fetcher: typeof fetch;
  installationId: string;
  runtimeConfig?: RuntimeConfigReader;
  signal?: AbortSignal;
}): Promise<ResolvedGitHubAppInstallation> {
  const configuration = readGitHubAppRuntimeConfiguration(input.runtimeConfig);
  const installationId = requirePositiveIntegerText(input.installationId, "GitHub App installation id");
  const appJwt = await createGitHubAppJwt(configuration);
  const installation = await getGitHubAppInstallation({
    appId: configuration.appId,
    appJwt,
    fetcher: input.fetcher,
    installationId,
    signal: input.signal,
  });
  const tokenPayload = await requestGitHubJson<GitHubAppInstallationTokenPayload>({
    accessToken: appJwt,
    body: {},
    fetcher: input.fetcher,
    method: "POST",
    path: `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    signal: input.signal,
  });
  const accessToken = requiredString(tokenPayload.token, "GitHub App installation token", providerResponseError);
  const expiresAt = requiredString(
    tokenPayload.expires_at,
    "GitHub App installation token expiration",
    providerResponseError,
  );
  return {
    accessToken,
    expiresAt,
    installation: {
      ...installation,
      permissions: normalizePermissions(tokenPayload.permissions ?? installation.permissions),
      repositorySelection: normalizeRepositorySelection(
        tokenPayload.repository_selection ?? installation.repositorySelection,
      ),
    },
  };
}

export async function verifyGitHubUserInstallation(input: {
  accessToken: string;
  fetcher: typeof fetch;
  installationId: string;
  runtimeConfig?: RuntimeConfigReader;
}): Promise<GitHubAppInstallation> {
  const configuration = readGitHubAppRuntimeConfiguration(input.runtimeConfig);
  const installationId = requirePositiveIntegerText(input.installationId, "GitHub App installation id");
  for (let page = 1; page <= MAX_USER_INSTALLATION_PAGES; page += 1) {
    const payload = await requestGitHubJson<{ installations?: GitHubAppInstallationPayload[] }>({
      accessToken: input.accessToken,
      fetcher: input.fetcher,
      path: `/user/installations?per_page=100&page=${page}`,
    });
    const installations = Array.isArray(payload.installations) ? payload.installations : [];
    const matching = installations.find((installation) => String(installation.id ?? "") === installationId);
    if (matching) return normalizeInstallation({ appId: configuration.appId, installation: matching, installationId });
    if (installations.length < 100) break;
  }
  throw new ProviderRequestError(403, "The authorizing GitHub user cannot access this GitHub App installation.");
}

export async function listGitHubUserInstallations(input: {
  accessToken: string;
  fetcher: typeof fetch;
  runtimeConfig?: RuntimeConfigReader;
}): Promise<GitHubAppInstallation[]> {
  const configuration = readGitHubAppRuntimeConfiguration(input.runtimeConfig);
  const result: GitHubAppInstallation[] = [];
  for (let page = 1; page <= MAX_USER_INSTALLATION_PAGES; page += 1) {
    const payload = await requestGitHubJson<{
      installations?: GitHubAppInstallationPayload[];
    }>({
      accessToken: input.accessToken,
      fetcher: input.fetcher,
      path: `/user/installations?per_page=100&page=${page}`,
    });
    const installations = Array.isArray(payload.installations) ? payload.installations : [];
    for (const installation of installations) {
      if (String(installation.app_id ?? "") !== configuration.appId) continue;
      result.push(
        normalizeInstallation({
          appId: configuration.appId,
          installation,
          installationId: requirePositiveIntegerText(String(installation.id ?? ""), "GitHub App installation id"),
        }),
      );
    }
    if (installations.length < 100) {
      break;
    }
  }
  return result;
}

async function getGitHubAppInstallation(input: {
  appId: string;
  appJwt: string;
  fetcher: typeof fetch;
  installationId: string;
  signal?: AbortSignal;
}): Promise<GitHubAppInstallation> {
  const payload = await requestGitHubJson<GitHubAppInstallationPayload>({
    accessToken: input.appJwt,
    fetcher: input.fetcher,
    path: `/app/installations/${encodeURIComponent(input.installationId)}`,
    signal: input.signal,
  });
  return normalizeInstallation({
    appId: input.appId,
    installation: payload,
    installationId: input.installationId,
  });
}

function normalizeInstallation(input: {
  appId: string;
  installation: GitHubAppInstallationPayload;
  installationId: string;
}): GitHubAppInstallation {
  if (String(input.installation.app_id ?? "") !== input.appId) {
    throw new ProviderRequestError(403, "The GitHub App installation belongs to a different app.");
  }
  if (input.installation.suspended_at) {
    throw new ProviderRequestError(403, "The GitHub App installation is suspended.");
  }
  const accountType = input.installation.account?.type;
  if (accountType !== "Organization" && accountType !== "User") {
    throw providerResponseError("GitHub App installation account type is missing.");
  }
  return {
    accountAvatarUrl: requiredString(
      input.installation.account?.avatar_url,
      "GitHub App installation account avatar URL",
      providerResponseError,
    ),
    accountHtmlUrl: requiredString(
      input.installation.account?.html_url,
      "GitHub App installation account URL",
      providerResponseError,
    ),
    accountId: requirePositiveIntegerText(
      requiredString(
        input.installation.account?.id === undefined ? undefined : String(input.installation.account.id),
        "GitHub App installation account id",
        providerResponseError,
      ),
      "GitHub App installation account id",
      providerResponseError,
    ),
    accountLogin: requiredString(
      input.installation.account?.login,
      "GitHub App installation account login",
      providerResponseError,
    ),
    accountType,
    installationId: input.installationId,
    permissions: normalizePermissions(input.installation.permissions),
    repositorySelection: normalizeRepositorySelection(input.installation.repository_selection),
  };
}

async function requestGitHubJson<T>(input: {
  accessToken: string;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  method?: string;
  path: string;
  signal?: AbortSignal;
}): Promise<T> {
  const response = await input.fetcher(`${githubApiBaseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: githubHeaders(input.accessToken, input.body !== undefined),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw normalizeGitHubError(response, payload, "github app request failed");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw providerResponseError("GitHub App returned an invalid response.");
  }
  return payload as T;
}

function readGitHubAppRuntimeConfiguration(runtimeConfig?: RuntimeConfigReader): {
  appId: string;
  privateKeyPem: string;
} {
  const appId = requireRuntimeConfig(runtimeConfig, githubAppIdConfigName);
  const privateKeyPem = requireRuntimeConfig(runtimeConfig, githubAppPrivateKeyConfigName);
  return {
    appId: requirePositiveIntegerText(appId, "GitHub App id"),
    privateKeyPem,
  };
}

function requireRuntimeConfig(runtimeConfig: RuntimeConfigReader | undefined, name: string): string {
  const value = runtimeConfig?.(name)?.trim() ?? "";
  if (!value) {
    throw new ProviderRequestError(503, `${name} is not configured.`);
  }
  return value;
}

function normalizePrivateKey(value: string): string {
  const normalized = value.trim().replace(/\\n/gu, "\n");
  if (!normalized.startsWith(PKCS1_PRIVATE_KEY_HEADER)) {
    return normalized;
  }
  return convertPkcs1PemToPkcs8(normalized);
}

function convertPkcs1PemToPkcs8(value: string): string {
  const encodedPkcs1 = value
    .replace(PKCS1_PRIVATE_KEY_HEADER, "")
    .replace(PKCS1_PRIVATE_KEY_FOOTER, "")
    .replace(/\s/gu, "");
  const pkcs1 = Uint8Array.from(atob(encodedPkcs1), (character) => character.charCodeAt(0));
  const privateKeyInfo = encodeDerElement(
    0x30,
    concatenateBytes(Uint8Array.of(0x02, 0x01, 0x00), RSA_ALGORITHM_IDENTIFIER, encodeDerElement(0x04, pkcs1)),
  );
  const encodedPkcs8 = encodeBase64(privateKeyInfo);
  const lines = encodedPkcs8.match(/.{1,64}/gu) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

function encodeDerElement(tag: number, value: Uint8Array): Uint8Array {
  return concatenateBytes(Uint8Array.of(tag), encodeDerLength(value.length), value);
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) {
    return Uint8Array.of(length);
  }
  const octets: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    octets.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Uint8Array.of(0x80 | octets.length, ...octets);
}

function concatenateBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function encodeBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function requirePositiveIntegerText(
  value: string,
  fieldName: string,
  createError: (message: string) => ProviderRequestError = (message) => new ProviderRequestError(400, message),
): string {
  const normalized = value.trim();
  const parsed = Number(normalized);
  if (!/^[1-9][0-9]*$/u.test(normalized) || !Number.isSafeInteger(parsed)) {
    throw createError(`${fieldName} must be a positive integer.`);
  }
  return normalized;
}

function normalizePermissions(value: Record<string, unknown> | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, permission]) =>
      typeof permission === "string" && permission ? [[key, permission]] : [],
    ),
  );
}

function normalizeRepositorySelection(value: unknown): "all" | "selected" {
  if (value === "all" || value === "selected") {
    return value;
  }
  throw providerResponseError("GitHub App installation repository selection is missing.");
}
