import type { KeyObject } from "node:crypto";

import { Buffer } from "node:buffer";
import { createHash, createPrivateKey, createSign } from "node:crypto";
import { ProviderRequestError } from "../provider-runtime.ts";

const bodySigningMethods = new Set(["POST", "PUT", "PATCH"]);

export interface OracleApiSigningIdentity {
  tenancyId: string;
  userId: string;
  fingerprint: string;
  privateKey: KeyObject;
}

export interface OracleApiSigningInput {
  method: string;
  url: URL;
  body?: string;
  now?: Date;
}

/** Parse and validate an OCI RSA API signing key. */
export function parseOracleApiPrivateKey(pem: string, passphrase?: string): KeyObject {
  try {
    const key = createPrivateKey({
      key: pem,
      format: "pem",
      passphrase: passphrase || undefined,
    });
    if (key.asymmetricKeyType !== "rsa") {
      throw new Error("key is not RSA");
    }
    return key;
  } catch {
    throw new ProviderRequestError(
      400,
      "privateKey must be a valid RSA private key in PEM format and privateKeyPassphrase must decrypt it",
    );
  }
}

/** Build the OCI Signature Authorization header and every header covered by it. */
export function signOracleApiRequest(identity: OracleApiSigningIdentity, input: OracleApiSigningInput): Headers {
  const method = input.method.toUpperCase();
  const headers = new Headers({
    accept: "application/json",
    host: input.url.host,
    "x-date": (input.now ?? new Date()).toUTCString(),
  });
  const signedHeaderNames = ["(request-target)", "host", "x-date"];

  if (bodySigningMethods.has(method)) {
    const body = input.body ?? "";
    headers.set("content-type", "application/json");
    headers.set("content-length", String(Buffer.byteLength(body, "utf8")));
    headers.set("x-content-sha256", createHash("sha256").update(body).digest("base64"));
    signedHeaderNames.push("content-type", "content-length", "x-content-sha256");
  }

  const signingString = buildOracleApiSigningString(method, input.url, headers, signedHeaderNames);
  const signer = createSign("RSA-SHA256");
  signer.update(signingString);
  signer.end();
  const signature = signer.sign(identity.privateKey).toString("base64");
  const keyId = `${identity.tenancyId}/${identity.userId}/${identity.fingerprint}`;
  headers.set(
    "authorization",
    [
      'Signature version="1"',
      `keyId="${keyId}"`,
      'algorithm="rsa-sha256"',
      `headers="${signedHeaderNames.join(" ")}"`,
      `signature="${signature}"`,
    ].join(","),
  );
  return headers;
}

export function buildOracleApiSigningString(
  method: string,
  url: URL,
  headers: Headers,
  signedHeaderNames: readonly string[],
): string {
  const requestTarget = `${method.toLowerCase()} ${url.pathname}${url.search}`;
  return signedHeaderNames
    .map((name) => {
      if (name === "(request-target)") return `(request-target): ${requestTarget}`;
      const value = headers.get(name);
      if (value == null) {
        throw new ProviderRequestError(500, `OCI signing header ${name} is missing`);
      }
      return `${name}: ${value}`;
    })
    .join("\n");
}
