import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireCustomCredential,
} from "../provider-runtime.ts";
import { handlers, isBusinessEndpoint, login, readCredential, validateCredential } from "./runtime.ts";

const service = "kingdee";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context, fetcher) {
    return {
      credential: readCredential((await requireCustomCredential(context, service)).values),
      fetcher,
      signal: context.signal,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateCredential(
      input.values,
      createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed }),
      signal,
    );
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => readCredential((await requireCustomCredential(context, service)).values).baseUrl,
  auth: { type: "none" },
  allowedEndpoint: isBusinessEndpoint,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  sensitiveHeaders: ["kdservice-sessionid"],
  redirect: "manual",
  async customizeRequest({ context, fetcher, headers }) {
    const values = (await requireCustomCredential(context, service)).values;
    const kingdee = readCredential(values);
    for (const name of [
      "kdservice-sessionid",
      "KDSVCSessionId",
      "SessionId",
      "x-kd-appkey",
      "x-kd-appdata",
      "x-kd-signature",
    ]) {
      headers.delete(name);
    }
    headers.set("kdservice-sessionid", await login(kingdee, fetcher, context.signal));
  },
});
