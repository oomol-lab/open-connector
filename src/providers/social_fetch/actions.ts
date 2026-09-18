import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "social_fetch" as const;

export const socialFetchProfilePlatforms = [
  "tiktok",
  "instagram",
  "twitter",
  "threads",
  "bluesky",
  "telegram",
  "github",
  "soundcloud",
  "linktree",
] as const;

const requestMetaSchema = s.object(
  "Metadata returned with a Social Fetch API response.",
  {
    requestId: s.nonEmptyString("The request identifier used for support and tracing."),
    creditsCharged: s.integer("The number of Social Fetch credits charged for the request.", {
      minimum: 0,
    }),
    version: s.stringEnum("The Social Fetch API version that served the request.", ["v1"]),
    cached: s.boolean("Whether Social Fetch served the response from its shared cache."),
  },
  { optional: ["cached"] },
);

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  operationType: "read",
  description: "Get the Social Fetch user associated with the connected API key.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading the authenticated Social Fetch account.", {}),
  outputSchema: s.object("The authenticated Social Fetch account response.", {
    user: s.object("The authenticated Social Fetch user.", {
      id: s.string("The internal Social Fetch user identifier."),
      name: s.nullableString("The user's display name when available."),
      email: s.nullableString("The user's email address when available."),
    }),
    meta: requestMetaSchema,
  }),
});

const getBalanceAction = defineProviderAction(service, {
  name: "get_balance",
  operationType: "read",
  description: "Get the remaining Social Fetch credit balance and billing state.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading the Social Fetch credit balance.", {}),
  outputSchema: s.object("The Social Fetch credit balance response.", {
    balance: s.integer("The total spendable Social Fetch credit balance.", { minimum: 0 }),
    payg: s.integer("The total pay-as-you-go credit bucket, including grace credits.", {
      minimum: 0,
    }),
    paygSpendable: s.integer("The pay-as-you-go credits currently available to spend.", {
      minimum: 0,
    }),
    graceDebtCredits: s.integer("The grace credits used during the current refill episode.", {
      minimum: 0,
    }),
    refillState: s.nullable(
      s.stringEnum("The automatic refill state when auto-refill is enabled.", ["healthy", "grace", "exhausted"]),
    ),
    billingAlert: s.stringEnum("The current billing alert state.", ["none", "payment_action_required", "suspended"]),
    subscriptionIncludedRemaining: s.integer("The subscription credits remaining in the current period.", {
      minimum: 0,
    }),
    subscriptionIncludedTotal: s.integer("The subscription credits granted for the current period.", { minimum: 0 }),
    subscription: s.nullable(
      s.object("The active subscription summary for subscribed accounts.", {
        tier: s.string("The subscription tier."),
        status: s.string("The subscription status."),
        periodEnd: s.string("The ISO 8601 end time of the current subscription period."),
      }),
    ),
    collectionStatus: s.stringEnum("The subscription collection state.", ["current", "base_past_due", "suspended"]),
    meta: requestMetaSchema,
  }),
});

const getProfileAction = defineProviderAction(service, {
  name: "get_profile",
  operationType: "read",
  description: "Get a public profile or channel by handle from a supported social platform.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for a Social Fetch profile lookup.", {
    platform: s.stringEnum("The social platform containing the public profile.", socialFetchProfilePlatforms),
    handle: s.nonWhitespaceString("The public profile handle, with or without a leading at sign.", {
      maxLength: 253,
    }),
  }),
  outputSchema: s.object("The normalized Social Fetch profile lookup response.", {
    lookupStatus: s.stringEnum("The outcome reported by Social Fetch for the lookup.", [
      "found",
      "private",
      "restricted",
      "not_found",
    ]),
    profile: s.nullable(s.looseObject("The platform-specific profile or channel returned by Social Fetch.")),
    metrics: s.nullable(s.looseObject("The platform-specific profile metrics returned by Social Fetch.")),
    raw: s.looseObject("The complete platform-specific data object returned by Social Fetch."),
    meta: requestMetaSchema,
  }),
});

export const socialFetchActions: ActionDefinition[] = [getAccountAction, getBalanceAction, getProfileAction];
