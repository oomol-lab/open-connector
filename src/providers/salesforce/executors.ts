import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-executors.ts";

import { optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { createSalesforceContext } from "./context.ts";
import { salesforceAnalyticsHandlers } from "./runtime-analytics.ts";
import { salesforceApprovalHandlers } from "./runtime-approvals.ts";
import { salesforceAutomationHandlers } from "./runtime-automation.ts";
import { salesforceBaseHandlers } from "./runtime-base.ts";
import { salesforceBulkHandlers } from "./runtime-bulk.ts";
import { salesforceChatterHandlers } from "./runtime-chatter.ts";
import { salesforceDataHandlers } from "./runtime-data.ts";
import { salesforceFileHandlers } from "./runtime-files.ts";
import { salesforceKnowledgeHandlers } from "./runtime-knowledge.ts";
import { salesforceLeadHandlers } from "./runtime-leads.ts";
import { salesforcePlatformHandlers } from "./runtime-platform.ts";
import { readSalesforceError, salesforceOrigin, salesforceRequest } from "./transport.ts";
export { oauth } from "./oauth.ts";
const handlers: Record<string, (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>> =
  {};
for (const [name, handler] of Object.entries({
  ...salesforceApprovalHandlers,
  ...salesforceChatterHandlers,
  ...salesforceKnowledgeHandlers,
  ...salesforceLeadHandlers,
  ...salesforcePlatformHandlers,
  ...salesforceBaseHandlers,
  ...salesforceDataHandlers,
  ...salesforceAnalyticsHandlers,
  ...salesforceAutomationHandlers,
  ...salesforceFileHandlers,
  ...salesforceBulkHandlers,
})) {
  handlers[name] = (input, context) => handler(input, createSalesforceContext(context, input));
}
export const executors: ProviderExecutors = defineOAuthProviderExecutors("salesforce", handlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "salesforce",
  async baseUrl(context, service) {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "oauth2") throw providerInputError("Salesforce requires OAuth2");
    return salesforceOrigin(requiredInputString(credential.providerSecret?.instanceUrl, "instanceUrl"), "instanceUrl");
  },
  auth: { type: "oauth_bearer" },
  readError: readSalesforceError,
});
export const credentialValidators: CredentialValidators = {
  async oauth2(credential, { fetcher, signal }) {
    const metadata = credential.providerSecret;
    if (!metadata) throw providerInputError("Salesforce connection metadata is missing");
    const url = new URL(requiredInputString(metadata?.identityUrl, "identityUrl"));
    salesforceOrigin(url.origin, "identityUrl");
    const body = requiredResponseRecord(
      (
        await salesforceRequest(
          url,
          { headers: { authorization: `Bearer ${credential.accessToken}` } },
          fetcher,
          signal,
        )
      ).body,
      "Salesforce identity",
    );
    if (body.organization_id !== metadata?.organizationId || body.user_id !== metadata?.userId)
      throw providerResponseError("Salesforce identity does not match the token response");
    return {
      profile: {
        accountId: `${metadata.organizationId}:${metadata.userId}`,
        displayName: optionalString(body.display_name) ?? optionalString(body.username),
      },
      metadata: { instanceUrl: metadata.instanceUrl },
      grantedScopes: optionalString(credential.metadata.scope)?.split(" ").filter(Boolean),
    };
  },
};
