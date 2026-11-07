import type { KeyObject } from "node:crypto";

import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
export interface AlipayCredential {
  appId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  environment: string;
  gateway: string;
  appAuthToken: string | undefined;
}

const gateways: Record<string, string> = {
  prod: "https://openapi.alipay.com/gateway.do",
  sandbox: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
};

function alipayGateway(environment: string | undefined): string {
  const gateway = gateways[environment || "prod"];
  if (!gateway || !Object.hasOwn(gateways, environment || "prod")) {
    throw new ProviderRequestError(400, "environment must be prod or sandbox", undefined, "invalid_input");
  }
  return gateway;
}

export function readAlipayCredential(values: Record<string, string>): AlipayCredential {
  const appId = requiredInputString(values.appId, "appId").trim();
  const environment = values.environment?.trim() || "prod";
  const gateway = alipayGateway(environment);
  const privateText = requiredInputString(values.privateKey, "privateKey").replaceAll("\\n", "\n").trim();
  const publicText = requiredInputString(values.alipayPublicKey, "alipayPublicKey").replaceAll("\\n", "\n").trim();
  let privateKey: KeyObject;
  let publicKey: KeyObject;
  try {
    if (privateText.startsWith("-----BEGIN")) {
      privateKey = createPrivateKey(privateText);
    } else {
      const key = Buffer.from(privateText, "base64");
      try {
        privateKey = createPrivateKey({ key, format: "der", type: "pkcs8" });
      } catch {
        privateKey = createPrivateKey({ key, format: "der", type: "pkcs1" });
      }
    }
    publicKey = publicText.startsWith("-----BEGIN")
      ? createPublicKey(publicText)
      : createPublicKey({ key: Buffer.from(publicText, "base64"), format: "der", type: "spki" });
    if (privateKey.asymmetricKeyType !== "rsa" || publicKey.asymmetricKeyType !== "rsa") {
      throw new Error("RSA keys required");
    }
  } catch {
    throw new ProviderRequestError(
      400,
      "Provide an RSA application private key and Alipay public key in PEM or Base64 DER format",
      undefined,
      "invalid_input",
    );
  }
  if (!appId) throw new ProviderRequestError(400, "appId is required", undefined, "invalid_input");
  return {
    appId,
    privateKey,
    publicKey,
    environment,
    gateway,
    appAuthToken: values.appAuthToken?.trim() || undefined,
  };
}

export function signAlipayParameters(
  credential: AlipayCredential,
  method: string,
  bizContent: Record<string, unknown>,
  common: Record<string, string> = {},
): URLSearchParams {
  const timestamp = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const parameters: Record<string, string> = {
    ...common,
    app_id: credential.appId,
    method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp,
    version: "1.0",
    biz_content: JSON.stringify(bizContent),
  };
  if (credential.appAuthToken) parameters.app_auth_token = credential.appAuthToken;
  else delete parameters.app_auth_token;
  delete parameters.sign;
  const canonical = Object.keys(parameters)
    .sort()
    .filter((key) => parameters[key] !== "")
    .map((key) => `${key}=${parameters[key]}`)
    .join("&");
  parameters.sign = sign("RSA-SHA256", Buffer.from(canonical), credential.privateKey).toString("base64");
  return new URLSearchParams(parameters);
}

function responseSource(text: string, responseKey: string): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = 0;
  let key: string | undefined;
  let start = -1;
  let result: string | undefined;
  const keys = new Set<string>();
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        inString = false;
        if (depth === 1 && key === undefined) {
          key = JSON.parse(text.slice(stringStart, index + 1));
          if (keys.has(key!))
            throw new ProviderRequestError(
              502,
              "Alipay response contains duplicate envelope fields",
              undefined,
              "provider_error",
            );
          keys.add(key!);
        }
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      stringStart = index;
    } else if (char === "{" || char === "[") {
      if (depth === 1 && key === responseKey) start = index;
      depth++;
    } else if (char === "}" || char === "]") {
      depth--;
      if (depth === 1 && key === responseKey && start >= 0) result = text.slice(start, index + 1);
    } else if (char === "," && depth === 1) {
      key = undefined;
      start = -1;
    }
  }
  return result;
}

export function parseAlipayResponse(
  text: string,
  method: string,
  credential: AlipayCredential,
  status = 200,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(
      status >= 400 ? status : 502,
      "Alipay returned invalid JSON",
      undefined,
      "provider_error",
    );
  }
  const envelope = requiredResponseRecord(parsed, "Alipay response");
  const methodKey = `${method.replaceAll(".", "_")}_response`;
  const responseKey = Object.hasOwn(envelope, methodKey) ? methodKey : "error_response";
  const body = requiredResponseRecord(envelope[responseKey], "Alipay business response");
  const raw = responseSource(text, responseKey);
  const signature = optionalString(envelope.sign);
  const code = optionalString(body.code);

  if (signature || code === "10000") {
    if (
      !raw ||
      !signature ||
      !verify("RSA-SHA256", Buffer.from(raw), credential.publicKey, Buffer.from(signature, "base64"))
    ) {
      throw new ProviderRequestError(502, "Alipay response signature verification failed", undefined, "provider_error");
    }
  }
  if (status < 200 || status >= 300 || code !== "10000") {
    let message = [code, optionalString(body.msg), optionalString(body.sub_code), optionalString(body.sub_msg)]
      .filter(Boolean)
      .join(": ");
    if (credential.appAuthToken) message = message.replaceAll(credential.appAuthToken, "[REDACTED]");
    throw new ProviderRequestError(
      status >= 400 ? status : 502,
      `Alipay: ${message || "request failed"}`,
      undefined,
      "provider_error",
    );
  }
  return body;
}

export function requestAlipay(
  credential: AlipayCredential,
  method: string,
  parameters: URLSearchParams,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Alipay", signal: callerSignal }, async (signal) => {
    const response = await fetcher(credential.gateway, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        accept: "application/json",
      },
      body: parameters.toString(),
      signal,
      redirect: "manual",
    });
    return parseAlipayResponse(await response.text(), method, credential, response.status);
  });
}

export function alipayBusinessInput(
  input: Record<string, unknown>,
  reserved: readonly string[],
): Record<string, unknown> {
  const extra = optionalRecord(input.extra_biz_content) ?? {};
  for (const key of Object.keys(extra)) {
    if (reserved.includes(key) || key === "product_code" || key === "__proto__") {
      throw new ProviderRequestError(400, `extra_biz_content cannot override ${key}`, undefined, "invalid_input");
    }
  }
  const business: Record<string, unknown> = { ...extra };
  for (const [key, value] of Object.entries(input)) {
    if (!["extra_biz_content", "return_url", "notify_url"].includes(key) && value !== undefined) business[key] = value;
  }
  return business;
}
