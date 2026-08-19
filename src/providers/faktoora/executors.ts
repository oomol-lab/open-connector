import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeFaktooraAction, faktooraApiBaseUrl, validateFaktooraCredential } from "./runtime.ts";

const service = "faktoora";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"faktoora", Handler> = {
  list_projects(input, context) {
    return executeFaktooraAction(
      "list_projects",
      input,
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_projects",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_project(input, context) {
    return executeFaktooraAction(
      "create_project",
      input,
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_project",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_project(input, context) {
    return executeFaktooraAction(
      "get_project",
      input,
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_project",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_project(input, context) {
    return executeFaktooraAction(
      "update_project",
      input,
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_project",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_project(input, context) {
    return executeFaktooraAction(
      "delete_project",
      input,
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_project",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  attach_project_document(input, context) {
    return executeFaktooraAction(
      "attach_project_document",
      input,
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "attach_project_document",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  detach_project_document(input, context) {
    return executeFaktooraAction(
      "detach_project_document",
      input,
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "detach_project_document",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: faktooraApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateFaktooraCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
