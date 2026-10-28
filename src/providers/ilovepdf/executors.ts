import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IlovepdfContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, injectProviderProxyJsonBodyField } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import actions from "./actions.ts";
import {
  createIlovepdfToken,
  ilovepdfApiBaseUrl,
  processIlovepdfFiles,
  validateIlovepdfCredential,
} from "./runtime.ts";
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "ilovepdf",
  handlers: Object.fromEntries(
    actions.map((action) => [
      action.name,
      (input: Record<string, unknown>, context: IlovepdfContext) => processIlovepdfFiles(action.name, input, context),
    ]),
  ),
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "ilovepdf");
    return {
      secretKey: credential.apiKey,
      publicKey: requiredInputString(credential.values?.publicKey, "publicKey"),
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateIlovepdfCredential(input.apiKey, requiredInputString(input.values.publicKey, "publicKey"), fetcher);
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "ilovepdf",
  baseUrl: ilovepdfApiBaseUrl,
  auth: { type: "none" },
  redirect: "manual",
  async customizeRequest({ context, service, url, headers, body, setBody, method }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set(
      "authorization",
      `Bearer ${await createIlovepdfToken(credential.apiKey, requiredInputString(credential.values?.publicKey, "publicKey"))}`,
    );
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (url.pathname !== "/v1/task") return;
    url.searchParams.delete("secret_key");
    if (!["POST", "PUT", "PATCH"].includes(method)) {
      url.searchParams.set("secret_key", credential.apiKey);
      return;
    }
    setBody(injectProviderProxyJsonBodyField(body, "secret_key", credential.apiKey));
    headers.set("content-type", "application/json");
  },
});
