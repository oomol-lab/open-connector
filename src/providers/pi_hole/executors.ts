import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { PiHoleActionContext, PiHoleActionHandler } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  combineProviderActionHandlers,
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { piHoleManagementActionHandlers } from "./runtime-management.ts";
import {
  ensurePiHoleSession,
  piHoleActionHandlers,
  resolvePiHoleApiPath,
  resolvePiHoleBaseUrl,
  validatePiHoleCredential,
} from "./runtime.ts";

const service = "pi_hole";

function resolvePiHoleApiRoot(context: ExecutionContext): Promise<string> {
  return requireApiKeyCredential(context, service).then((credential) => {
    const baseUrl = resolvePiHoleBaseUrl({ values: credential.values, metadata: credential.metadata });
    const apiPath = resolvePiHoleApiPath({ values: credential.values, metadata: credential.metadata });
    return `${baseUrl.replace(/\/+$/, "")}/${apiPath}/`;
  });
}

export const executors: ProviderExecutors = defineProviderExecutors<PiHoleActionContext>({
  service,
  handlers: combineProviderActionHandlers<"pi_hole", PiHoleActionHandler>(
    service,
    piHoleActionHandlers,
    piHoleManagementActionHandlers,
  ),
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<PiHoleActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      appPassword: credential.apiKey,
      baseUrl: resolvePiHoleBaseUrl({ values: credential.values, metadata: credential.metadata }),
      apiPath: resolvePiHoleApiPath({ values: credential.values, metadata: credential.metadata }),
      transitFiles: context.transitFiles,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: resolvePiHoleApiRoot,
  // The API authenticates with a per-session SID, which cannot be expressed as
  // a static header, so the proxy attaches it during request customization.
  auth: { type: "none" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async customizeRequest({ context, headers, fetcher }) {
    const credential = await requireApiKeyCredential(context, service);
    const sid = await ensurePiHoleSession({
      appPassword: credential.apiKey,
      baseUrl: resolvePiHoleBaseUrl({ values: credential.values, metadata: credential.metadata }),
      apiPath: resolvePiHoleApiPath({ values: credential.values, metadata: credential.metadata }),
      fetcher,
      signal: context.signal,
    });
    if (sid) {
      headers.set("x-ftl-sid", sid);
    }
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    // Re-guard the shared validator fetcher with Pi-hole's private-network
    // opt-in so validating a private instance baseUrl works when the
    // deployment allows it (createProviderFetch unwraps an already-guarded
    // fetcher).
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validatePiHoleCredential(input, guardedFetcher, signal);
  },
};
