import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireBearerCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { mondayAutomationActionHandlers } from "./runtime-automation.ts";
import { mondayCollaborationActionHandlers } from "./runtime-collaboration.ts";
import { mondayApiUrl, mondayApiVersion, validateMondayCredential } from "./runtime-common.ts";
import { mondayDiscoveryActionHandlers } from "./runtime-discovery.ts";
import { mondayEnterpriseActionHandlers } from "./runtime-enterprise.ts";
import { mondayFormsActionHandlers } from "./runtime-forms.ts";
import { mondayItemActionHandlers } from "./runtime-items.ts";
import { mondayStructureActionHandlers } from "./runtime-structure.ts";
import { getMondayAuthorizationScopes, parseMondayScopeString } from "./scopes.ts";

const service = "monday";

interface MondayActionContext {
  apiKey: string;
  fetcher: ProviderFetch;
}

const runtimeActionHandlers: Record<string, MondayActionHandler> = {
  ...mondayAutomationActionHandlers,
  ...mondayCollaborationActionHandlers,
  ...mondayDiscoveryActionHandlers,
  ...mondayEnterpriseActionHandlers,
  ...mondayFormsActionHandlers,
  ...mondayStructureActionHandlers,
  ...mondayItemActionHandlers,
};

const actionHandlers = Object.fromEntries(
  Object.entries(runtimeActionHandlers).map(([actionName, handler]) => [
    actionName,
    (input: Record<string, unknown>, context: MondayActionContext) =>
      handler(
        {
          apiKey: context.apiKey,
          actionName,
          input,
        },
        context.fetcher,
      ),
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<MondayActionContext>({
  service,
  handlers: actionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<MondayActionContext> {
    const credential = await requireBearerCredential(context, service);
    return {
      apiKey: credential.accessToken,
      fetcher,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireBearerCredential(context, service);
    const url = createProviderProxyUrl(new URL(mondayApiUrl).origin, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", credential.accessToken);
    headers.set("api-version", mondayApiVersion);
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

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `monday request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "monday request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateMondayCredential({ apiKey: input.apiKey }, fetcher);
  },
  async oauth2(input, { fetcher }) {
    const grantedScopes = parseMondayScopeString(input.metadata.scope);
    return validateMondayCredential({ apiKey: input.accessToken }, fetcher, {
      grantedScopes: grantedScopes.length > 0 ? grantedScopes : getMondayAuthorizationScopes(),
    });
  },
};
