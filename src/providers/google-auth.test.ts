import type { ResolvedCredential } from "../core/types.ts";
import type { GoogleServiceAccountToken, GoogleServiceAccountTokenRequest } from "./google-auth.ts";
import type { ProviderFetch } from "./provider-runtime.ts";

import { decodeJwt, decodeProtectedHeader } from "jose";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createGoogleServiceAccountToken,
  readGoogleServiceAccountCredential,
  resolveGoogleAccessToken,
} from "./google-auth.ts";
import { ProviderRequestError } from "./provider-runtime.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const { privateKey: secondPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const secondPrivateKeyPem = secondPrivateKey.export({ type: "pkcs8", format: "pem" }).toString();

const tokenUrl = "https://oauth2.googleapis.com/token";
const driveScopes = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive"];

let emailCounter = 0;

/** A fresh service account email per call keeps the module-level token cache from leaking across tests. */
function uniqueEmail(): string {
  return `bot-${++emailCounter}@test-project.iam.gserviceaccount.com`;
}

function serviceAccountJson(
  email: string = uniqueEmail(),
  options: { escapedNewlines?: boolean; privateKey?: string } = {},
): string {
  const key = options.privateKey ?? privateKeyPem;
  const pem = options.escapedNewlines ? key.replaceAll("\n", "\\n") : key;
  return JSON.stringify({
    type: "service_account",
    client_email: email,
    private_key: pem,
  });
}

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

function fetchRecorder(status: number, body: unknown): { fetcher: ProviderFetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as ProviderFetch;
  return { fetcher, requests };
}

async function messageOf(run: Promise<unknown>): Promise<{ message: string; status: number }> {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderRequestError);
    const requestError = error as ProviderRequestError;
    return { message: requestError.message, status: requestError.status };
  }
  throw new Error("expected the request to reject");
}

function tokenRequest(
  fetcher: ProviderFetch,
  overrides: Partial<GoogleServiceAccountTokenRequest> = {},
): Promise<GoogleServiceAccountToken> {
  return createGoogleServiceAccountToken({
    service: "googledrive",
    serviceAccount: readGoogleServiceAccountCredential({ serviceAccountJson: serviceAccountJson() }),
    scopes: driveScopes,
    fetcher,
    ...overrides,
  });
}

function formField(init: RequestInit | undefined, field: string): string {
  const body = String(init?.body ?? "");
  return new URLSearchParams(body).get(field) ?? "";
}

describe("readGoogleServiceAccountCredential", () => {
  it("reads the key file fields and the optional subject", () => {
    const email = uniqueEmail();
    const credential = readGoogleServiceAccountCredential({
      serviceAccountJson: serviceAccountJson(email),
      subject: " admin@example.com ",
    });

    expect(credential.clientEmail).toBe(email);
    expect(credential.privateKey).toBe(privateKeyPem.trim());
    expect(credential.subject).toBe("admin@example.com");
  });

  it("unescapes \\n line breaks in the private key", () => {
    const credential = readGoogleServiceAccountCredential({
      serviceAccountJson: serviceAccountJson(uniqueEmail(), { escapedNewlines: true }),
    });

    expect(credential.privateKey.trim()).toBe(privateKeyPem.trim());
  });

  it("rejects values that are not the key file JSON with a 400 error", async () => {
    const notJson = await messageOf(
      Promise.resolve().then(() => readGoogleServiceAccountCredential({ serviceAccountJson: "{not json" })),
    );
    expect(notJson.status).toBe(400);

    const missingKey = await messageOf(
      Promise.resolve().then(() =>
        readGoogleServiceAccountCredential({ serviceAccountJson: JSON.stringify({ client_email: uniqueEmail() }) }),
      ),
    );
    expect(missingKey.status).toBe(400);
    expect(missingKey.message).toContain("private_key");
  });
});

describe("createGoogleServiceAccountToken", () => {
  it("posts a signed RS256 assertion to the Google token endpoint", async () => {
    const email = uniqueEmail();
    const { fetcher, requests } = fetchRecorder(200, {
      access_token: "ya29.sa-token",
      expires_in: 3600,
      scope: driveScopes.join(" "),
      token_type: "Bearer",
    });

    const token = await tokenRequest(fetcher, {
      serviceAccount: readGoogleServiceAccountCredential({ serviceAccountJson: serviceAccountJson(email) }),
    });

    expect(token.accessToken).toBe("ya29.sa-token");
    expect(token.grantedScopes).toEqual(driveScopes);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(tokenUrl);
    expect(requests[0].init?.method).toBe("POST");
    expect(new Headers(requests[0].init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(formField(requests[0].init, "grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const assertion = formField(requests[0].init, "assertion");
    const header = decodeProtectedHeader(assertion);
    const claims = decodeJwt(assertion);
    expect(header.alg).toBe("RS256");
    expect(claims.iss).toBe(email);
    expect(claims.aud).toBe(tokenUrl);
    expect(claims.scope).toBe(driveScopes.join(" "));
    expect(claims.exp !== undefined && claims.iat !== undefined && claims.exp - claims.iat).toBe(3600);
    expect(claims.sub).toBeUndefined();
  });

  it("impersonates the subject through the sub claim", async () => {
    const { fetcher, requests } = fetchRecorder(200, { access_token: "ya29.sa-token", expires_in: 3600 });
    const serviceAccount = {
      ...readGoogleServiceAccountCredential({ serviceAccountJson: serviceAccountJson() }),
      subject: "admin@example.com",
    };

    await createGoogleServiceAccountToken({ service: "googledrive", serviceAccount, scopes: driveScopes, fetcher });

    expect(decodeJwt(formField(requests[0]?.init, "assertion")).sub).toBe("admin@example.com");
  });

  it("surfaces the Google error description with its HTTP status", async () => {
    const { fetcher } = fetchRecorder(400, {
      error: "invalid_grant",
      error_description: "Invalid JWT Signature.",
    });

    const failure = await messageOf(tokenRequest(fetcher));

    expect(failure.status).toBe(400);
    expect(failure.message).toBe("Invalid JWT Signature.");
  });

  it("reuses the cached token until close to expiry", async () => {
    const longLived = fetchRecorder(200, { access_token: "ya29.long", expires_in: 3600 });
    const longLivedAccount = readGoogleServiceAccountCredential({
      serviceAccountJson: serviceAccountJson("long-lived@test-project.iam.gserviceaccount.com"),
    });
    expect(
      (
        await createGoogleServiceAccountToken({
          service: "googledrive",
          serviceAccount: longLivedAccount,
          scopes: driveScopes,
          fetcher: longLived.fetcher,
        })
      ).accessToken,
    ).toBe("ya29.long");
    expect(
      (
        await createGoogleServiceAccountToken({
          service: "googledrive",
          serviceAccount: longLivedAccount,
          scopes: driveScopes,
          fetcher: longLived.fetcher,
        })
      ).accessToken,
    ).toBe("ya29.long");
    expect(longLived.requests).toHaveLength(1);

    // A token inside the five-minute refresh skew is minted again on the next call.
    const nearExpiry = fetchRecorder(200, { access_token: "ya29.near-expiry", expires_in: 60 });
    const nearExpiryAccount = readGoogleServiceAccountCredential({
      serviceAccountJson: serviceAccountJson("near-expiry@test-project.iam.gserviceaccount.com"),
    });
    expect(
      (
        await createGoogleServiceAccountToken({
          service: "googledrive",
          serviceAccount: nearExpiryAccount,
          scopes: driveScopes,
          fetcher: nearExpiry.fetcher,
        })
      ).accessToken,
    ).toBe("ya29.near-expiry");
    expect(
      (
        await createGoogleServiceAccountToken({
          service: "googledrive",
          serviceAccount: nearExpiryAccount,
          scopes: driveScopes,
          fetcher: nearExpiry.fetcher,
        })
      ).accessToken,
    ).toBe("ya29.near-expiry");
    expect(nearExpiry.requests).toHaveLength(2);
  });

  it("mints separate tokens per scope set", async () => {
    const { fetcher, requests } = fetchRecorder(200, { access_token: "ya29.scoped", expires_in: 3600 });

    await tokenRequest(fetcher);
    await tokenRequest(fetcher, { scopes: ["https://www.googleapis.com/auth/spreadsheets"] });

    expect(requests).toHaveLength(2);
  });

  it("does not serve one key's cached token to a different key of the same identity", async () => {
    const email = uniqueEmail();
    const first = fetchRecorder(200, { access_token: "ya29.first-key", expires_in: 3600 });
    const second = fetchRecorder(200, { access_token: "ya29.second-key", expires_in: 3600 });

    const firstToken = await tokenRequest(first.fetcher, {
      serviceAccount: readGoogleServiceAccountCredential({ serviceAccountJson: serviceAccountJson(email) }),
    });
    const secondToken = await tokenRequest(second.fetcher, {
      serviceAccount: readGoogleServiceAccountCredential({
        serviceAccountJson: serviceAccountJson(email, { privateKey: secondPrivateKeyPem }),
      }),
    });

    expect(firstToken.accessToken).toBe("ya29.first-key");
    expect(secondToken.accessToken).toBe("ya29.second-key");
    expect(first.requests).toHaveLength(1);
    expect(second.requests).toHaveLength(1);
  });
});

describe("resolveGoogleAccessToken", () => {
  it("passes stored OAuth tokens through without network calls", async () => {
    const { fetcher, requests } = fetchRecorder(200, {});
    const credential: ResolvedCredential = {
      authType: "oauth2",
      accessToken: "ya29.oauth",
      tokenType: "Bearer",
      profile: { accountId: "user@gmail.com", displayName: "User", grantedScopes: [] },
      metadata: {},
    };

    const resolved = await resolveGoogleAccessToken({
      service: "googledrive",
      scopes: driveScopes,
      credential,
      fetcher,
    });

    expect(resolved).toEqual({ accessToken: "ya29.oauth", tokenType: "Bearer", accountId: "user@gmail.com" });
    expect(requests).toHaveLength(0);
  });

  it("mints a service account token for custom credentials", async () => {
    const { fetcher, requests } = fetchRecorder(200, {
      access_token: "ya29.sa",
      expires_in: 3600,
      scope: driveScopes.join(" "),
    });
    const credential: ResolvedCredential = {
      authType: "custom_credential",
      values: { serviceAccountJson: serviceAccountJson(), subject: "admin@example.com" },
      profile: { accountId: "admin@example.com", displayName: "admin@example.com", grantedScopes: [] },
      metadata: {},
    };

    const resolved = await resolveGoogleAccessToken({
      service: "googledrive",
      scopes: driveScopes,
      credential,
      fetcher,
    });

    expect(resolved).toEqual({ accessToken: "ya29.sa", tokenType: "Bearer", accountId: "admin@example.com" });
    expect(requests).toHaveLength(1);
  });

  it("names both connection modes when no credential is stored", async () => {
    const { fetcher } = fetchRecorder(200, {});

    const failure = await messageOf(
      resolveGoogleAccessToken({ service: "googledrive", scopes: driveScopes, credential: undefined, fetcher }),
    );

    expect(failure.status).toBe(401);
    expect(failure.message).toBe("Connect googledrive with OAuth or service account credentials first.");
  });
});
