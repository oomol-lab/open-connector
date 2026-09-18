import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chargeblast";

const pageSchema = s.nonNegativeInteger(
  "The Chargeblast page number to request. Alerts, orders, and deflection logs start at page 0; merchants default to page 1 in the official API.",
);
const perSchema = s.positiveInteger("The number of Chargeblast records to request per page.");
const idSchema = s.nonEmptyString("The Chargeblast resource identifier.");
const rawObjectSchema = s.looseObject("The raw Chargeblast object returned by the API.");
const rawValueSchema = s.unknown("The raw Chargeblast response value returned by the API.");
const alertReasonCodeSchema = s.stringEnum("The Chargeblast reason code used to action an alert.", [
  "Resolved",
  "ResolvedPartial",
  "ResolvedCancelled",
  "AccountCancelled",
  "CancellationProcessed",
  "UnmatchedGeneral",
  "UnmatchedCannotFindTransaction",
  "Duplicate",
  "MIDLost",
  "AlreadyRefunded",
  "AlreadyChargeback",
  "Ineligible",
  "TDS",
  "CannotCancel",
  "MatchedWillShip",
  "EscalateChargeback",
  "ContactedShipper",
  "WIP",
  "Error",
  "None",
  "NotMyDescriptor",
  "Unactioned",
  "",
]);

const alertSchema = s.requiredObject(
  "A normalized Chargeblast alert with stable top-level fields and the original payload.",
  {
    id: s.string("The Chargeblast alert identifier."),
    alertType: s.nullableString("The Chargeblast alert type, such as FRAUD or DISPUTE."),
    subprovider: s.nullableString("The Chargeblast alert network or sub-provider."),
    amount: s.nullableNumber("The transaction amount represented in major currency units."),
    currency: s.nullableString("The transaction currency code."),
    createdAt: s.nullableString("The date and time when the alert was created."),
    transactionDate: s.nullableString("The date and time when the transaction took place."),
    merchantId: s.nullableString("The Chargeblast merchant identifier related to the alert."),
    reasonCode: s.nullableString("The alert reason code when returned by Chargeblast."),
    customerEmail: s.nullableString("The customer email address associated with the alert."),
    descriptor: s.nullableString("The billing descriptor shown on the card statement."),
    card: s.nullableString("The redacted card number returned by Chargeblast."),
    cardBrand: s.nullableString("The card network returned by Chargeblast."),
    arn: s.nullableString("The acquirer reference number returned by Chargeblast."),
    resolvedDate: s.nullableString("The date and time when the alert was resolved."),
    resolvedByApi: s.nullableBoolean("Whether the alert was resolved through the API."),
    raw: rawObjectSchema,
  },
);

const paginationOutputSchema = {
  page: s.integer("The page number returned by Chargeblast."),
  per: s.nullable(s.integer("The page size returned by Chargeblast when present.")),
  total: s.integer("The total number of records returned by Chargeblast."),
};

const merchantSchema = s.requiredObject("A normalized Chargeblast merchant list item.", {
  id: s.string("The unique Chargeblast merchant identifier."),
  name: s.string("The merchant name set during Chargeblast onboarding."),
  raw: rawObjectSchema,
});

const deflectionLogSchema = s.requiredObject("A Chargeblast deflection log entry with request and response details.", {
  request: rawObjectSchema,
  response: rawObjectSchema,
  raw: rawObjectSchema,
});

export const chargeblastActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_alerts",
    operationType: "read",
    description: "List Chargeblast alerts with optional alert-network filtering and pagination.",
    inputSchema: s.object(
      "Input parameters for listing Chargeblast alerts.",
      {
        filter: s.nonEmptyString(
          "The type of alerts to filter for. Official examples include RDR, CDRN, Ethoca, TC40, and SAFE.",
        ),
        page: pageSchema,
        per: perSchema,
      },
      { optional: ["filter", "page", "per"] },
    ),
    outputSchema: s.requiredObject("The Chargeblast alerts response.", {
      alerts: s.array("The alerts returned by Chargeblast.", alertSchema),
      ...paginationOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_alert",
    operationType: "read",
    description: "Fetch one Chargeblast alert by identifier.",
    inputSchema: s.requiredObject("Input parameters for fetching one Chargeblast alert.", {
      id: idSchema,
    }),
    outputSchema: s.requiredObject("The Chargeblast alert response.", {
      alert: alertSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_alert",
    operationType: "write",
    description: "Action one Chargeblast alert with an official reason code and optional expiration-time handling.",
    inputSchema: s.object(
      "Input parameters for updating a Chargeblast alert.",
      {
        id: idSchema,
        result: alertReasonCodeSchema,
        actionAtExpiration: s.boolean(
          "Whether Chargeblast should action the alert at expiration instead of immediately. Chargeblast ignores this when result is Resolved.",
        ),
      },
      { optional: ["actionAtExpiration"] },
    ),
    outputSchema: s.requiredObject("The Chargeblast update alert response.", {
      payload: rawValueSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_credit_request",
    operationType: "write",
    description: "Create a Chargeblast credit request for a rejected alert.",
    inputSchema: s.object(
      "Input parameters for creating a Chargeblast credit request.",
      {
        alertId: s.nonEmptyString("The rejected Chargeblast alert identifier."),
        comments: s.nonEmptyString("Optional comments to include with the credit request."),
      },
      { optional: ["comments"] },
    ),
    outputSchema: s.requiredObject("The Chargeblast credit request response.", {
      payload: rawValueSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_merchants",
    operationType: "read",
    description: "List merchants in a Chargeblast account.",
    inputSchema: s.object(
      "Input parameters for listing Chargeblast merchants.",
      {
        page: pageSchema,
        per: perSchema,
      },
      { optional: ["page", "per"] },
    ),
    outputSchema: s.requiredObject("The Chargeblast merchants response.", {
      merchants: s.array("The merchants returned by Chargeblast.", merchantSchema),
      page: s.integer("The page number returned by Chargeblast."),
      total: s.integer("The total number of merchants returned by Chargeblast."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List Chargeblast order identifiers with pagination.",
    inputSchema: s.object(
      "Input parameters for listing Chargeblast orders.",
      {
        page: pageSchema,
        per: perSchema,
      },
      { optional: ["page", "per"] },
    ),
    outputSchema: s.requiredObject("The Chargeblast orders response.", {
      orders: s.array(
        "The Chargeblast order identifiers returned by the API.",
        s.string("A Chargeblast order identifier."),
      ),
      ...paginationOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Fetch one Chargeblast order by identifier, including receipt and eligibility data.",
    inputSchema: s.requiredObject("Input parameters for fetching one Chargeblast order.", {
      id: idSchema,
    }),
    outputSchema: s.requiredObject("The Chargeblast order response.", {
      order: rawObjectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_deflection_logs",
    operationType: "read",
    description: "List Chargeblast digital receipt and deflection lookup logs.",
    inputSchema: s.object(
      "Input parameters for listing Chargeblast deflection logs.",
      {
        page: pageSchema,
        per: perSchema,
        filter: s.object(
          "Optional Chargeblast deflection log filters.",
          {
            startDate: s.dateTime("The ISO8601 start date for deflection logs."),
            endDate: s.dateTime("The ISO8601 end date for deflection logs."),
            gateway: s.nonEmptyString("The gateway for matched transactions."),
            status: s.nonEmptyString("The deflection log status to filter for."),
          },
          { optional: ["startDate", "endDate", "gateway", "status"] },
        ),
      },
      { optional: ["page", "per", "filter"] },
    ),
    outputSchema: s.requiredObject("The Chargeblast deflection logs response.", {
      logs: s.array("The deflection logs returned by Chargeblast.", deflectionLogSchema),
      ...paginationOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
];
