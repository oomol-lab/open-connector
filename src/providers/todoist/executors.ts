import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  fetchTodoistCurrentAccount,
  todoistActionHandlers,
  todoistApiBaseUrl,
  validateTodoistCredential,
} from "./runtime.ts";

const service = "todoist";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, todoistActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: todoistApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTodoistCredential(input.apiKey, fetcher, signal);
  },
  oauth2(input, { fetcher, signal }) {
    return fetchTodoistCurrentAccount(input.accessToken, fetcher, signal);
  },
};
