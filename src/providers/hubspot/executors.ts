import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { defineOAuthProviderExecutors } from "../provider-runtime.ts";
import { executeHubspotAction, fetchHubspotCurrentAccount } from "./runtime.ts";

const service = "hubspot";

type HubspotActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

export const hubspotActionHandlers: ProviderActionHandlers<"hubspot", HubspotActionHandler> = {
  search_crm_objects(input, context) {
    return executeHubspotAction(
      { actionName: "search_crm_objects", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_crm_objects(input, context) {
    return executeHubspotAction(
      { actionName: "get_crm_objects", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  manage_crm_objects(input, context) {
    return executeHubspotAction(
      { actionName: "manage_crm_objects", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  search_contacts(input, context) {
    return executeHubspotAction(
      { actionName: "search_contacts", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_contact(input, context) {
    return executeHubspotAction(
      { actionName: "get_contact", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  create_contact(input, context) {
    return executeHubspotAction(
      { actionName: "create_contact", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  update_contact(input, context) {
    return executeHubspotAction(
      { actionName: "update_contact", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  search_companies(input, context) {
    return executeHubspotAction(
      { actionName: "search_companies", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_company(input, context) {
    return executeHubspotAction(
      { actionName: "get_company", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  create_company(input, context) {
    return executeHubspotAction(
      { actionName: "create_company", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  update_company(input, context) {
    return executeHubspotAction(
      { actionName: "update_company", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  search_deals(input, context) {
    return executeHubspotAction(
      { actionName: "search_deals", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_deal(input, context) {
    return executeHubspotAction({ actionName: "get_deal", input, accessToken: context.accessToken }, context.fetcher);
  },
  create_deal(input, context) {
    return executeHubspotAction(
      { actionName: "create_deal", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  update_deal(input, context) {
    return executeHubspotAction(
      { actionName: "update_deal", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  list_properties(input, context) {
    return executeHubspotAction(
      { actionName: "list_properties", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_property(input, context) {
    return executeHubspotAction(
      { actionName: "get_property", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  search_properties(input, context) {
    return executeHubspotAction(
      { actionName: "search_properties", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_properties(input, context) {
    return executeHubspotAction(
      { actionName: "get_properties", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  search_owners(input, context) {
    return executeHubspotAction(
      { actionName: "search_owners", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_campaign_contacts_by_type(input, context) {
    return executeHubspotAction(
      { actionName: "get_campaign_contacts_by_type", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_campaign_analytics(input, context) {
    return executeHubspotAction(
      { actionName: "get_campaign_analytics", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_campaign_asset_types(input, context) {
    return executeHubspotAction(
      { actionName: "get_campaign_asset_types", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_campaign_asset_metrics(input, context) {
    return executeHubspotAction(
      { actionName: "get_campaign_asset_metrics", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  submit_feedback(input, context) {
    return executeHubspotAction(
      { actionName: "submit_feedback", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
  get_user_details(input, context) {
    return executeHubspotAction(
      { actionName: "get_user_details", input, accessToken: context.accessToken },
      context.fetcher,
    );
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, hubspotActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const profile = await fetchHubspotCurrentAccount(input.accessToken, fetcher, signal);
    return {
      profile: {
        accountId: profile.providerAccountId,
        displayName: profile.accountLabel,
      },
      grantedScopes: ["mcp:tools"],
      metadata: profile.providerMetadata,
    };
  },
};
