import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createPrivateKey, createSign, randomBytes } from "node:crypto";
import { optionalInteger, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "coinbase";
const coinbaseApiBaseUrl = "https://api.coinbase.com";
const accountsPath = "/api/v3/brokerage/accounts";
const coinbaseFetch = createProviderFetch({ skipDnsValidation: true });

type CoinbaseRequestPhase = "validate" | "execute";
type CoinbaseJwtBuilder = (input: { method: string; path: string }) => string;
interface CoinbaseActionContext extends ApiKeyProviderContext {
  keyName: string;
}
type CoinbaseActionHandler = (input: Record<string, unknown>, context: CoinbaseActionContext) => Promise<unknown>;

export const coinbaseActionHandlers: Record<string, CoinbaseActionHandler> = {
  list_accounts(input, context) {
    return coinbaseGetJson(
      accountsPath,
      queryParams({
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      }),
      context,
      "execute",
    );
  },
  get_account(input, context) {
    const accountUuid = requiredString(input.account_uuid, "account_uuid", providerInputError);
    return coinbaseGetJson(`${accountsPath}/${encodeURIComponent(accountUuid)}`, {}, context, "execute");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CoinbaseActionContext>({
  service,
  handlers: coinbaseActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<CoinbaseActionContext> {
    return createCoinbaseContext(context, fetcher);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const jwtBuilder = createCoinbaseJwtBuilder({
      apiKey: credential.apiKey,
      keyName: requiredString(credential.values.keyName, "keyName", providerInputError),
      now: () => Date.now(),
      nonce: () => randomBytes(16).toString("hex"),
    });
    const url = createProviderProxyUrl(coinbaseApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${jwtBuilder({ method: input.method, path: url.pathname + url.search })}`);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await coinbaseFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Coinbase request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Coinbase request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: CoinbaseActionContext = {
      apiKey: input.apiKey,
      keyName: requiredString(input.values.keyName, "keyName", providerInputError),
      fetcher,
      signal,
    };
    const payload = await coinbaseGetJson(accountsPath, {}, context, "validate");
    const accounts = readAccountsArray(payload);
    const firstAccount = accounts[0];
    return {
      profile: {
        accountId: optionalString(firstAccount?.uuid),
        displayName: optionalString(firstAccount?.name) ?? "Coinbase API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: accountsPath,
        apiBaseUrl: coinbaseApiBaseUrl,
        accountCount: accounts.length,
      },
    };
  },
};

async function coinbaseGetJson(
  path: string,
  query: Record<string, string>,
  context: CoinbaseActionContext,
  phase: CoinbaseRequestPhase,
): Promise<unknown> {
  const jwtBuilder = createCoinbaseJwtBuilder({
    apiKey: context.apiKey,
    keyName: context.keyName,
    now: () => Date.now(),
    nonce: () => randomBytes(16).toString("hex"),
  });
  const url = new URL(path, coinbaseApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    const requestPath = url.pathname + url.search;
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${jwtBuilder({ method: "GET", path: requestPath })}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Coinbase request failed: ${error.message}` : "Coinbase request failed",
    );
  }

  const payload = await readCoinbasePayload(response);
  if (!response.ok) {
    throw buildCoinbaseError(response.status, payload, phase);
  }

  return payload;
}

async function createCoinbaseContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CoinbaseActionContext> {
  const credential = await requireApiKeyCredential(context, service);
  const providerContext: CoinbaseActionContext = {
    apiKey: credential.apiKey,
    keyName: requiredString(credential.values.keyName, "keyName", providerInputError),
    fetcher,
    signal: context.signal,
  };
  if (context.transitFiles) {
    providerContext.transitFiles = context.transitFiles;
  }
  return providerContext;
}

function createCoinbaseJwtBuilder(input: {
  apiKey: string;
  keyName: string;
  now: () => number;
  nonce: () => string;
}): CoinbaseJwtBuilder {
  const privateKey = parseCoinbasePrivateKey(input.apiKey);
  return ({ method, path }) => {
    const nowSeconds = Math.floor(input.now() / 1000);
    const header = {
      alg: "ES256",
      kid: input.keyName,
      nonce: input.nonce(),
      typ: "JWT",
    };
    const payload = {
      iss: "cdp",
      nbf: nowSeconds,
      exp: nowSeconds + 120,
      sub: input.keyName,
      uri: `${method} api.coinbase.com${path}`,
    };

    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signer = createSign("SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign({
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });

    return `${signingInput}.${signature.toString("base64url")}`;
  };
}

async function readCoinbasePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Coinbase returned an empty response");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Coinbase returned invalid JSON");
  }
}

function buildCoinbaseError(status: number, payload: unknown, phase: CoinbaseRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ?? optionalString(record?.error) ?? `Coinbase request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function parseCoinbasePrivateKey(apiKey: string): ReturnType<typeof createPrivateKey> {
  try {
    return createPrivateKey(apiKey);
  } catch {
    throw new ProviderRequestError(400, "coinbase apiKey must be a valid ECDSA private key in PEM format");
  }
}

function readAccountsArray(payload: unknown): Array<Record<string, unknown>> {
  const record = requiredRecord(payload, "payload", providerResponseError);
  if (!Array.isArray(record.accounts)) {
    throw new ProviderRequestError(502, "Coinbase response missing accounts");
  }
  return record.accounts.map((item) => requiredRecord(item, "account", providerResponseError));
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
