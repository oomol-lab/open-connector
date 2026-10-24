import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { PaperlessExecutionContext, PaperlessHandler } from "./runtime-helpers.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import { paperlessNgxDocumentOperationActionHandlers } from "./runtime-document-operations.ts";
import { paperlessNgxDocumentActionHandlers } from "./runtime-documents.ts";
import {
  createPaperlessExecutionContext,
  normalizePaperlessBaseUrl,
  paperlessAcceptHeader,
  validatePaperlessCredential,
} from "./runtime-helpers.ts";
import { paperlessNgxMailActionHandlers } from "./runtime-mail.ts";
import { paperlessNgxObjectActionHandlers } from "./runtime-objects.ts";
import { paperlessNgxShareLinkActionHandlers } from "./runtime-share-links.ts";
import { paperlessNgxSystemActionHandlers } from "./runtime-system.ts";
import { paperlessNgxTaskActionHandlers } from "./runtime-tasks.ts";
import { paperlessNgxUserActionHandlers } from "./runtime-users.ts";
import { paperlessNgxWorkflowActionHandlers } from "./runtime-workflows.ts";

const service = "paperless_ngx";

const sourceHandlers: Record<string, PaperlessHandler> = {
  ...paperlessNgxDocumentActionHandlers,
  ...paperlessNgxDocumentOperationActionHandlers,
  ...paperlessNgxObjectActionHandlers,
  ...paperlessNgxWorkflowActionHandlers,
  ...paperlessNgxShareLinkActionHandlers,
  ...paperlessNgxTaskActionHandlers,
  ...paperlessNgxUserActionHandlers,
  ...paperlessNgxMailActionHandlers,
  ...paperlessNgxSystemActionHandlers,
};

const handlers = Object.fromEntries(
  Object.entries(sourceHandlers).map(([name, handler]) => [
    name,
    (input: Record<string, unknown>, context: PaperlessExecutionContext) => handler(context, input),
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<PaperlessExecutionContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createPaperlessExecutionContext({
      baseUrl: credential.metadata.baseUrl ?? credential.values.baseUrl,
      apiKey: credential.apiKey,
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    });
  },
  fallbackMessage: "Paperless-ngx request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    const value = optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl);
    if (!value) throw new ProviderRequestError(500, "paperless_ngx connection is missing baseUrl metadata");
    return normalizePaperlessBaseUrl(value);
  },
  auth: { type: "api_key_authorization", prefix: "Token " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", paperlessAcceptHeader);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validatePaperlessCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
