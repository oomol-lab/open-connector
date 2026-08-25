import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "haveibeenpwned";

const breachSchema = s.object("Full breach model returned by Have I Been Pwned.", {
  Name: s.nonEmptyString("Stable breach name returned by HIBP."),
  Title: s.nonEmptyString("Display title of the breach returned by HIBP."),
  Domain: s.nonEmptyString("Primary domain associated with the breach."),
  BreachDate: s.date("Date when the breach occurred in YYYY-MM-DD format."),
  AddedDate: s.dateTime("Timestamp when the breach was added to HIBP."),
  ModifiedDate: s.dateTime("Timestamp when the breach was last modified in HIBP."),
  PwnCount: s.nonNegativeInteger("Number of breached accounts loaded into HIBP."),
  Description: s.nonEmptyString("HTML description of the breach returned by HIBP."),
  DataClasses: s.stringArray("Alphabetically ordered list of compromised data classes.", {
    itemDescription: "One compromised data class returned by HIBP.",
  }),
  IsVerified: s.boolean("Whether HIBP marks the breach as verified."),
  IsFabricated: s.boolean("Whether HIBP marks the breach as fabricated."),
  IsSensitive: s.boolean("Whether HIBP marks the breach as sensitive."),
  IsRetired: s.boolean("Whether HIBP marks the breach as retired."),
  IsSpamList: s.boolean("Whether HIBP marks the breach as a spam list."),
  IsMalware: s.boolean("Whether HIBP marks the breach as malware-sourced."),
  IsSubscriptionFree: s.boolean("Whether HIBP marks the breach as subscription-free."),
  IsStealerLog: s.boolean("Whether HIBP marks the breach as sourced from stealer logs."),
  LogoPath: s.nonEmptyString("Logo URI or asset path returned by HIBP for the breached service."),
  Attribution: s.nullableString("Optional attribution string returned by HIBP."),
});

const pasteSchema = s.object("Paste model returned by Have I Been Pwned.", {
  Source: s.nonEmptyString("Paste service name returned by HIBP."),
  Id: s.nonEmptyString("Paste identifier returned by the source service."),
  Title: s.nullableString("Paste title returned by HIBP when present."),
  Date: s.nullable(s.dateTime("Paste timestamp returned by HIBP when present.")),
  EmailCount: s.nonNegativeInteger("Number of emails found in the paste."),
});

const subscriptionSchema = s.object("Subscription status returned by Have I Been Pwned.", {
  SubscriptionName: s.nonEmptyString("Current HIBP subscription name."),
  Description: s.nonEmptyString("Human-readable description of the current subscription."),
  SubscribedUntil: s.dateTime("Timestamp when the current subscription expires."),
  Rpm: s.nonNegativeInteger("Allowed requests per minute for breach search APIs."),
  DomainSearchMaxBreachedAccounts: s.nonNegativeInteger(
    "Largest domain search size supported by the current subscription.",
  ),
  MaxBreachedDomains: s.nullableInteger("Maximum number of breached domains allowed, or null when unlimited.", {
    minimum: 0,
  }),
  IncludesStealerLogs: s.boolean("Whether the subscription includes stealer log APIs."),
  IncludesBulkDomainAdd: s.boolean("Whether the subscription includes bulk domain add APIs."),
  IncludesAutoSubdomainVerification: s.boolean("Whether the subscription includes automatic subdomain verification."),
  IncludesCustomerDomains: s.boolean("Whether the subscription allows adding customer domains."),
  IncludesKAnon: s.boolean("Whether the subscription includes the k-anonymity breach search API."),
});

const emailAddressSchema = s.email("Email address to search in Have I Been Pwned.");

export const haveibeenpwnedActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_breaches",
    description: "List breaches in Have I Been Pwned and optionally filter by domain or spam-list flag.",
    inputSchema: s.actionInput(
      {
        domain: s.nonEmptyString("Optional domain filter passed to the HIBP breaches endpoint."),
        isSpamList: s.boolean("Optional spam-list filter passed to the HIBP breaches endpoint."),
      },
      [],
      "Input parameters for listing breaches from Have I Been Pwned.",
    ),
    outputSchema: s.actionOutput(
      {
        breaches: s.array("Breaches returned by Have I Been Pwned.", breachSchema),
      },
      "Breach catalogue entries returned by Have I Been Pwned.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_breach",
    description: "Get one breach by its stable HIBP Name value.",
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("Stable breach Name value to retrieve from HIBP."),
      },
      ["name"],
      "Input parameters for retrieving one HIBP breach.",
    ),
    outputSchema: s.actionOutput({ breach: breachSchema }, "Single breach returned by Have I Been Pwned."),
  }),
  defineProviderAction(service, {
    name: "get_latest_breach",
    description: "Get the most recently added breach in Have I Been Pwned.",
    inputSchema: s.actionInput({}, [], "Input parameters for retrieving the latest HIBP breach."),
    outputSchema: s.actionOutput({ breach: breachSchema }, "Most recently added breach returned by Have I Been Pwned."),
  }),
  defineProviderAction(service, {
    name: "list_data_classes",
    description: "List all data classes currently used by breaches in Have I Been Pwned.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing HIBP data classes."),
    outputSchema: s.actionOutput(
      {
        dataClasses: s.stringArray("Alphabetically ordered HIBP data classes.", {
          itemDescription: "One data class returned by HIBP.",
        }),
      },
      "Data classes returned by Have I Been Pwned.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_breached_account",
    description:
      "Search full HIBP breach models for an email address, with optional domain and unverified-breach filters.",
    inputSchema: s.actionInput(
      {
        emailAddress: emailAddressSchema,
        domain: s.nonEmptyString("Optional domain filter applied to the breached account search."),
        includeUnverified: s.boolean("Whether to include breaches flagged as unverified in the HIBP account search."),
      },
      ["emailAddress"],
      "Input parameters for searching breaches for one email address in HIBP.",
    ),
    outputSchema: s.actionOutput(
      {
        breaches: s.array("Full breach models returned by HIBP for the requested email address.", breachSchema),
      },
      "Breach search results returned by Have I Been Pwned.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_pastes_for_account",
    description: "List paste exposures for an email address from Have I Been Pwned.",
    inputSchema: s.actionInput(
      {
        emailAddress: s.email("Email address to search for paste exposures in HIBP."),
      },
      ["emailAddress"],
      "Input parameters for listing HIBP paste exposures for one email address.",
    ),
    outputSchema: s.actionOutput(
      {
        pastes: s.array("Paste exposures returned by HIBP for the requested email address.", pasteSchema),
      },
      "Paste exposures returned by Have I Been Pwned.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription_status",
    description: "Get the current subscription details for the connected HIBP API key.",
    inputSchema: s.actionInput({}, [], "Input parameters for retrieving the current HIBP subscription status."),
    outputSchema: s.actionOutput(
      { subscription: subscriptionSchema },
      "Subscription details returned by Have I Been Pwned.",
    ),
  }),
];
