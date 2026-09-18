import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  adAccountIdInput,
  appleAdsDateTime,
  appleAdsDateTimeOutput,
  deletedOutput,
  emailString,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  moneyInput,
  moneyOutput,
  nonEmptyString,
  nullableEnum,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
  resourceObject,
} from "./schemas.ts";

export const budgetSystemStatuses: readonly string[] = ["ACTIVE", "INACTIVE"];
export const budgetSystemStatusReasons: readonly string[] = [
  "CANCELED",
  "CAMPAIGN_BUDGET_UNASSIGNED",
  "DELETED_BY_USER",
  "EXHAUSTED",
  "PROCESSING",
  "SCHEDULE_EXPIRED",
  "SCHEDULE_PENDING",
];
const budgetOrderFilterFields = ["deleted"];
const budgetOrderSortFields = ["name", "deleted"];

const adAccountIdsInput = s.array(
  "Ad account that can draw from this budget order. Apple Ads allows exactly one ad account per budget order and rejects requests that send more than one.",
  identifierInput("An ad account identifier."),
  { minItems: 1, maxItems: 1 },
);

const invoiceDetailCreateInput = s.object(
  "Invoice and billing contact details. Apple Ads requires them because budget orders are only available on Line of Credit (LOC) accounts.",
  {
    primaryBuyerName: nonEmptyString("Name of the primary buyer."),
    primaryBuyerEmail: emailString("Email address of the primary buyer."),
    billingEmail: emailString("Billing email address."),
    clientName: nonEmptyString("Advertiser or product this invoice identifies."),
    orderNumber: nonEmptyString("Purchase order number."),
  },
  { optional: ["clientName", "orderNumber"] },
);

const invoiceDetailUpdateInput = s.object(
  "New invoice and billing contact details. Every field is optional, so send only the ones you want to change.",
  {
    primaryBuyerName: nonEmptyString("Name of the primary buyer."),
    primaryBuyerEmail: emailString("Email address of the primary buyer."),
    billingEmail: emailString("Billing email address."),
    clientName: nonEmptyString("Advertiser or product this invoice identifies."),
    orderNumber: nonEmptyString("Purchase order number."),
  },
  {
    optional: ["primaryBuyerName", "primaryBuyerEmail", "billingEmail", "clientName", "orderNumber"],
  },
);

const budgetOrderResource = resourceObject(
  "A budget order, a spending cap that the campaigns assigned to it draw from over a scheduled period. It is available only on ad accounts with the LOC (Line of Credit) payment model.",
  "System-assigned identifier for the budget order.",
  {
    orgId: s.nullableInteger("Organization that owns the budget order."),
    name: s.nullableString("Advertiser-given budget order name."),
    startTime: appleAdsDateTimeOutput("When the budget order becomes active."),
    endTime: appleAdsDateTimeOutput("When the budget order expires, or null when it is open-ended."),
    value: moneyOutput("Total amount the assigned campaigns can spend against this budget order."),
    adAccountIds: s.nullable(
      s.array("Ad accounts whose campaigns can draw from this budget order.", s.integer("An ad account identifier.")),
    ),
    systemStatus: nullableEnum(
      "System-computed state telling whether campaigns can currently draw spend against the budget order.",
      budgetSystemStatuses,
    ),
    systemStatusReasons: s.nullable(
      s.array(
        "Reasons behind the current system status.",
        s.stringEnum("A system status reason.", budgetSystemStatusReasons),
      ),
    ),
    invoiceDetail: s.nullable(
      looseResource("Invoice and billing contact details. Apple Ads populates it only for Line of Credit accounts.", {
        clientName: s.nullableString("Advertiser or product this invoice identifies."),
        primaryBuyerName: s.nullableString("Name of the primary buyer."),
        primaryBuyerEmail: s.nullableString("Email address of the primary buyer."),
        orderNumber: s.nullableString("Purchase order number."),
        billingEmail: s.nullableString("Billing email address."),
      }),
    ),
    creationTime: appleAdsDateTimeOutput("When the budget order was created."),
    modificationTime: appleAdsDateTimeOutput("When the budget order was last modified."),
    deleted: s.nullableBoolean("Whether the budget order has been soft-deleted."),
  },
);

export const appleAdsBudgetOrderActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_budget_orders",
    operationType: "read",
    description:
      "Search the budget orders of one ad account with filters, sorting and offset pagination. Soft-deleted budget orders are excluded unless a filter on deleted asks for them.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing budget orders in one ad account.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: budgetOrderFilterFields,
          filterFieldDescription:
            "Budget order field to filter on. Apple Ads documents deleted as the filterable field, with the EQUALS operator; filter deleted EQUALS true to return soft-deleted budget orders.",
          sortFields: budgetOrderSortFields,
          sortFieldDescription: "Budget order field to sort on. Apple Ads documents name and deleted as sortable.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "budgetOrders",
      budgetOrderResource,
      "Budget orders matching the query on this page.",
      "A page of budget orders.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_budget_order",
    operationType: "read",
    description:
      "Read one budget order by identifier, including its amount, active date range, assigned ad account and invoice details.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the budget order to read.",
      {
        budgetOrderId: identifierInput("Identifier of the budget order."),
        adAccountId: adAccountIdInput,
      },
      { required: ["budgetOrderId"] },
    ),
    outputSchema: s.actionOutput({ budgetOrder: budgetOrderResource }, "The requested budget order."),
  }),
  defineProviderAction(service, {
    name: "create_budget_order",
    operationType: "write",
    description:
      "Create a budget order for the ad account this request is scoped to, then cap the total spend of a group of campaigns by assigning them to it. The ad account must be on the LOC (Line of Credit) payment model, which is why invoice details are required.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The budget order to create.",
      {
        adAccountId: adAccountIdInput,
        name: nonEmptyString("Budget order name."),
        startTime: appleAdsDateTime(
          "When the budget order becomes active. It must be midnight UTC of tomorrow or later; Apple Ads rejects today.",
        ),
        endTime: appleAdsDateTime(
          "When the budget order expires. It must be after startTime. Omit it for an open-ended budget order.",
        ),
        value: moneyInput(
          "Total amount the assigned campaigns can spend against this budget order. The currency must match the currency of the ad account.",
        ),
        invoiceDetail: invoiceDetailCreateInput,
      },
      { required: ["name", "startTime", "value", "invoiceDetail"] },
    ),
    outputSchema: s.actionOutput({ budgetOrder: budgetOrderResource }, "The created budget order."),
  }),
  defineProviderAction(service, {
    name: "update_budget_order",
    operationType: "destructive",
    description:
      "Change the mutable fields of one budget order. Only the fields you pass are changed. On a budget order that is already active, an end date can only be shortened, never extended, and passing endTime as null removes the expiration date entirely.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The budget order changes to apply.",
      {
        budgetOrderId: identifierInput("Identifier of the budget order to update."),
        adAccountId: adAccountIdInput,
        name: nonEmptyString("New budget order name."),
        startTime: appleAdsDateTime(
          "New start of the budget order. It must be midnight UTC of tomorrow or later; Apple Ads rejects today.",
        ),
        endTime: s.nullable(
          appleAdsDateTime(
            "New end of the budget order, or null to remove the expiration date and make it open-ended.",
          ),
        ),
        value: moneyInput(
          "New total amount for the budget order. Raise value.amount to extend a budget order that is close to exhaustion.",
        ),
        adAccountIds: adAccountIdsInput,
        invoiceDetail: invoiceDetailUpdateInput,
      },
      { required: ["budgetOrderId"] },
    ),
    outputSchema: s.actionOutput({ budgetOrder: budgetOrderResource }, "The updated budget order."),
  }),
  defineProviderAction(service, {
    name: "delete_budget_order",
    operationType: "destructive",
    description:
      "Soft-delete one budget order. Apple Ads rejects the deletion with 400 while any campaign is still assigned to the budget order, and also once it has started, expired, been exhausted or been canceled. A soft-deleted budget order cannot be restored; create a new one instead.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the budget order to delete.",
      {
        budgetOrderId: identifierInput("Identifier of the budget order to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["budgetOrderId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted budget order."),
      "Confirmation that the budget order was soft-deleted.",
    ),
  }),
];
