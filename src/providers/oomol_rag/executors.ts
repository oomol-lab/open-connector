import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OomolRagContext } from "./request.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { createProviderFetch, requiredInputString } from "../provider-runtime.ts";
import { oomolRagActions } from "./actions.ts";
import { provider } from "./definition.ts";
import { requestOomolRag } from "./request.ts";
import { executeOomolRagAction } from "./runtime.ts";

export const executors: ProviderExecutors = defineProviderExecutors<OomolRagContext>({
  service: provider.service,
  handlers: mapProviderActionHandlers(
    "oomol_rag",
    oomolRagActions,
    (_action, name) => (input: Record<string, unknown>, context: OomolRagContext) =>
      executeOomolRagAction(name, input, context),
  ),
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, provider.service);
    return {
      apiKey: credential.apiKey,
      teamId: requiredInputString(credential.values.teamId, "teamId"),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "OOMOL RAG request failed",
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const teamId = requiredInputString(input.values.teamId, "teamId");
    await requestOomolRag(
      {
        apiKey: input.apiKey,
        teamId,
        signal,
        fetcher: createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      },
      { path: "/v1/articles", query: { limit: 1 } },
    );
    return {
      profile: { accountId: teamId, displayName: provider.displayName },
      metadata: { teamId },
    };
  },
};
