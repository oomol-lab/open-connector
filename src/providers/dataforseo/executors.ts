import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { dataForSeoActionHandlers, dataForSeoApiBaseUrl, requestDataForSeoUserData } from "./runtime.ts";

const service = "dataforseo";

const dataForSeoFetch = createProviderFetch({ skipDnsValidation: true });

interface DataForSeoContext {
  login: string;
  password: string;
  fetcher: typeof fetch;
}

export const executors: ProviderExecutors = defineProviderExecutors<DataForSeoContext>({
  service,
  skipDnsValidation: true,
  handlers: dataForSeoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DataForSeoContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      login: requiredString(credential.values.login, "login", (message) => new ProviderRequestError(400, message)),
      password: requiredString(
        credential.values.password,
        "password",
        (message) => new ProviderRequestError(400, message),
      ),
      fetcher,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, service);
    const login = requiredString(credential.values.login, "login", (message) => new ProviderRequestError(400, message));
    const password = requiredString(
      credential.values.password,
      "password",
      (message) => new ProviderRequestError(400, message),
    );
    const url = createProviderProxyUrl(dataForSeoApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await dataForSeoFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher }) {
    const login = requiredString(input.values.login, "login", (message) => new ProviderRequestError(400, message));
    const password = requiredString(
      input.values.password,
      "password",
      (message) => new ProviderRequestError(400, message),
    );
    const userData = await requestDataForSeoUserData({ login, password, fetcher }, "validate");
    const money = optionalRecord(userData.money);
    const account = optionalString(userData.login) ?? login;

    return {
      profile: {
        accountId: account,
        displayName: account,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://api.dataforseo.com/v3",
        login: account,
        timezone: optionalString(userData.timezone),
        balance: optionalNumber(money?.balance),
        totalDeposited: optionalNumber(money?.total),
        validationEndpoint: "/appendix/user_data",
      },
    };
  },
};
