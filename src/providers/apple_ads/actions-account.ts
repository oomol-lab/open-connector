import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { paymentModels } from "./actions-campaigns.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  identifierInput,
  looseResource,
  manageOrgRoles,
  nonEmptyString,
  nullableEnum,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

const advertiserResourceTypes = ["CONTENT_PROVIDER", "BUSINESS_BRAND"];
const productFeatures = ["APPSTORE_APP_MANUAL", "BUSINESS_BRAND_MANUAL"];
const accountCurrencies = [
  "USD",
  "RMB",
  "AUD",
  "CAD",
  "EUR",
  "GBP",
  "JPY",
  "MXN",
  "NZD",
  "RUB",
  "CNY",
  "INR",
  "BRL",
  "IDR",
];
const accountSystemStatuses = ["ACTIVE", "INACTIVE"];

const delegationResource = looseResource(
  "A delegated advertiser resource that links an ad account to a content provider or a brand.",
  {
    resourceId: s.nullableString(
      "Identifier of the delegated resource: the Content Provider ID (CPID) for CONTENT_PROVIDER, or the Brand ID for BUSINESS_BRAND.",
    ),
    resourceType: nullableEnum("Kind of delegated resource.", advertiserResourceTypes),
    resourceName: s.nullableString(
      "Display name of the delegated resource: the brand name for BUSINESS_BRAND, or the App Store Connect provider name for CONTENT_PROVIDER.",
    ),
  },
);

const delegationsInput = (description: string) =>
  s.array(
    description,
    s.object(
      "A single advertiser resource delegation.",
      {
        resourceId: identifierInput(
          "Identifier of the resource to delegate: the Content Provider ID (CPID) for CONTENT_PROVIDER, or the Brand ID for BUSINESS_BRAND. Get Advertiser Resources lists the identifiers available to the organization.",
        ),
        resourceType: s.stringEnum(
          "Kind of resource to delegate. Every delegation on one ad account must share the same resourceType, and it has to match the account's productFeatures.",
          advertiserResourceTypes,
        ),
      },
      { required: ["resourceId", "resourceType"] },
    ),
  );

const adAccountResource = resourceObject(
  "An ad account, the container that owns campaigns and carries the advertising settings inherited from its organization.",
  "System-assigned identifier for the ad account.",
  {
    name: s.nullableString("Name of the ad account, unique within the parent organization."),
    orgId: s.nullableInteger("Identifier of the parent organization. It can never change."),
    timezone: s.nullableString(
      "Time zone of the ad account, inherited from the parent organization, for example America/New_York.",
    ),
    currency: nullableEnum("Currency of the ad account, inherited from the parent organization.", accountCurrencies),
    paymentModel: nullableEnum(
      "Payment model inherited from the parent organization. LOC is line of credit, invoiced monthly and required for budget orders; PAYG is pay as you go, charged per campaign spend.",
      paymentModels,
    ),
    systemStatus: nullableEnum(
      "Whether the ad account is operational. An INACTIVE account cannot run campaigns.",
      accountSystemStatuses,
    ),
    systemStatusReasons: s.nullable(
      s.stringArray("Reasons the ad account is INACTIVE, empty while it is ACTIVE.", {
        itemDescription:
          "A reason code such as TAX_VERIFICATION_PENDING, NO_PAYMENT_METHOD_ON_FILE, ORG_NO_PAYMENT_METHOD_ON_FILE, PAYMENT_DECLINED, LOC_EXHAUSTED or POLICY_VIOLATION.",
      }),
    ),
    delegations: s.nullable(s.array("Advertiser resources delegated to this ad account.", delegationResource)),
    productFeatures: s.nullable(
      s.stringArray("Advertising surface the ad account is authorized for.", {
        itemDescription:
          "APPSTORE_APP_MANUAL for App Store advertising, or BUSINESS_BRAND_MANUAL for Apple Maps advertising.",
      }),
    ),
    creationTime: appleAdsDateTimeOutput("When the ad account was created."),
    modificationTime: appleAdsDateTimeOutput("When the ad account was last modified."),
  },
);

const orgResource = resourceObject(
  "An organization, the top-level entity that owns ad accounts, users and the billing relationship.",
  "System-assigned identifier for the organization.",
  {
    name: s.nullableString("Name of the organization."),
    currency: nullableEnum("Currency the organization reports amounts in.", accountCurrencies),
    timezone: s.nullableString("Time zone of the organization."),
    paymentModel: nullableEnum(
      "Payment model of the organization. LOC is line of credit, invoiced monthly and required for budget orders; PAYG is pay as you go, charged per campaign spend.",
      paymentModels,
    ),
    systemStatus: nullableEnum(
      "Whether the organization is operational. While it is INACTIVE no campaign under it serves.",
      accountSystemStatuses,
    ),
    systemStatusReasons: s.nullable(
      s.stringArray("Reasons the organization is INACTIVE, empty while it is ACTIVE.", {
        itemDescription:
          "A reason code such as TAX_VERIFICATION_PENDING, NO_PAYMENT_METHOD_ON_FILE, PAYMENT_DECLINED, MSA_EXPIRED, LOC_EXHAUSTED or POLICY_VIOLATION.",
      }),
    ),
  },
);

const meResource = looseResource("Identity of the API user the access token authenticates.", {
  userId: s.nullableInteger("Identifier of the authenticated API user."),
  orgId: s.nullableInteger(
    "Identifier of the organization the access token is bound to. A token reaches exactly one organization.",
  ),
});

const userAclResource = looseResource(
  "One access control entry: an ad account the API user can reach, and the roles held on it.",
  {
    adAccount: s.nullable(
      looseResource("The ad account this entry covers.", {
        id: s.nullableInteger("Identifier of the ad account. Use it as the adAccountId input."),
        name: s.nullableString("Name of the ad account."),
        orgId: s.nullableInteger("Identifier of the organization the ad account belongs to."),
      }),
    ),
    roles: s.nullable(
      s.stringArray("Roles the API user holds on this ad account.", {
        itemDescription:
          "A role name: Admin, API Account Manager, API Account Read Only, Limited Access: API Read & Write, or Limited Access: API Read Only. Roles are assigned in the Apple Ads UI and cannot be changed through the API.",
      }),
    ),
  },
);

export const appleAdsAccountActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    operationType: "read",
    description:
      "Read the user and organization the access token belongs to. It is the cheapest way to confirm the credential works and to learn the orgId the other account actions need.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object("No input: the endpoint describes the API user behind the connection.", {}),
    outputSchema: s.actionOutput({ me: meResource }, "Identity of the authenticated API user."),
  }),
  defineProviderAction(service, {
    name: "get_user_acls",
    operationType: "read",
    description:
      "List every ad account the access token can reach and the roles the API user holds on each. Start here to discover the adAccountId values the ad-account-scoped actions need.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object("No input: the endpoint lists the access of the API user behind the connection.", {}),
    outputSchema: s.actionOutput(
      {
        acls: s.array(
          "Access control entries, one per ad account the API user can reach. It is empty when the organization has no ad account yet.",
          userAclResource,
        ),
      },
      "Ad accounts the API user can reach, with the roles held on each.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_org",
    operationType: "read",
    description:
      "Read one organization by identifier, including the currency, time zone, payment model and system status its ad accounts inherit.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the organization to read.",
      {
        orgId: identifierInput(
          "Identifier of the organization. Get Me Details returns the orgId bound to the access token.",
        ),
      },
      { required: ["orgId"] },
    ),
    outputSchema: s.actionOutput({ org: orgResource }, "The requested organization."),
  }),
  defineProviderAction(service, {
    name: "get_advertiser_resources",
    operationType: "read",
    description:
      "List the advertiser resources of one type that the organization can delegate to an ad account. Use the returned resourceId values in the delegations of create_ad_account and update_ad_account.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Selects which advertiser resources to list.",
      {
        resourceType: s.stringEnum(
          "Kind of advertiser resource to list. CONTENT_PROVIDER returns the App Store Connect content providers used for App Store advertising; BUSINESS_BRAND returns the brands used for Apple Maps advertising.",
          advertiserResourceTypes,
        ),
      },
      { required: ["resourceType"] },
    ),
    outputSchema: s.actionOutput(
      {
        advertiserResources: s.array(
          "Advertiser resources of the requested type that are visible to the API user.",
          delegationResource,
        ),
      },
      "Advertiser resources available to delegate to an ad account.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_ad_account",
    operationType: "write",
    description:
      "Create an ad account under the organization the access token is bound to. The currency, time zone and payment model are inherited from the organization, and productFeatures is fixed at creation: an account authorized for the App Store can never run Apple Maps campaigns, or the other way around.",
    requiredScopes: [],
    providerPermissions: [...manageOrgRoles],
    inputSchema: s.object(
      "The ad account to create.",
      {
        name: nonEmptyString("Name of the ad account. It must be unique within the organization."),
        productFeatures: s.array(
          "Advertising surface this ad account is authorized for. Pass APPSTORE_APP_MANUAL for App Store advertising or BUSINESS_BRAND_MANUAL for Apple Maps advertising; an account can hold one or the other, so create a second ad account when the organization needs both.",
          s.stringEnum("A product feature.", productFeatures),
          { minItems: 1 },
        ),
        delegations: delegationsInput(
          "Advertiser resources to link to the new account. Pass a CONTENT_PROVIDER delegation for App Store advertising, or a BUSINESS_BRAND delegation for Apple Maps advertising; campaigns cannot go live until the delegation matching productFeatures is in place.",
        ),
      },
      { required: ["name", "productFeatures"] },
    ),
    outputSchema: s.actionOutput(
      { adAccount: adAccountResource },
      "The created ad account. A new account starts INACTIVE when something still blocks it, and systemStatusReasons says what.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ad_account",
    operationType: "read",
    description:
      "Read the full record of one ad account, including its delegated advertiser resources and the reasons it is not operational.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the ad account to read.",
      { adAccountId: adAccountIdInput },
      { optional: ["adAccountId"] },
    ),
    outputSchema: s.actionOutput({ adAccount: adAccountResource }, "The requested ad account."),
  }),
  defineProviderAction(service, {
    name: "update_ad_account",
    operationType: "destructive",
    description:
      "Change the name or the delegated advertiser resources of one ad account. Only the fields you pass are changed, and the delegations array you pass replaces the stored one entirely. The currency, time zone, payment model, organization and productFeatures are fixed and cannot be updated.",
    requiredScopes: [],
    providerPermissions: [...manageOrgRoles],
    inputSchema: s.object(
      "The ad account changes to apply.",
      {
        adAccountId: adAccountIdInput,
        name: nonEmptyString("New name for the ad account. It must be unique within the organization."),
        delegations: delegationsInput(
          "The complete set of advertiser resources the account should end up with. Apple Ads keeps the entries you send and removes every stored delegation you leave out, so read the account first and send the existing delegations plus the new one to add one. Pass an empty array to remove them all.",
        ),
      },
      { optional: ["adAccountId", "name", "delegations"] },
    ),
    outputSchema: s.actionOutput({ adAccount: adAccountResource }, "The updated ad account."),
  }),
];
