import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const service = "referralhero";
const campaignId = s.nonEmptyString("The ReferralHero campaign UUID, such as MF078d000987.");
const subscriberId = s.nonEmptyString("The unique ReferralHero subscriber ID.");
const page = s.positiveInteger("The page number to retrieve. ReferralHero starts pagination at 1.");
const loose = (description: string) => s.looseObject(description);
const array = (description: string, item: string) => s.array(description, loose(item));
const pagination = s.looseObject("ReferralHero pagination metadata.", {
  total_pages: s.integer("The total number of result pages."),
  current_page: s.integer("The current result page."),
  per_page: s.integer("The maximum objects returned per page."),
  total_objects: s.integer("The total matching objects."),
});
const metadata = {
  callsLeft: s.nullable(s.integer("The remaining hourly API calls.")),
  timestamp: s.nullable(s.integer("The response timestamp.")),
};
const campaign = s.object("A ReferralHero campaign selector.", { campaignId });
const subscriber = s.object("A campaign and subscriber selector.", { campaignId, subscriberId });
const identifiers = {
  email: s.email("The subscriber email address."),
  phoneNumber: s.nonEmptyString("The subscriber phone number."),
  cryptoWalletAddress: s.nonEmptyString("The subscriber wallet address."),
  otherIdentifierValue: s.nonEmptyString("The custom subscriber identifier."),
};
const identifierNames = ["email", "phoneNumber", "cryptoWalletAddress", "otherIdentifierValue"];
const mutation = {
  ...identifiers,
  name: s.nonEmptyString("The subscriber name."),
  extraField: s.string("The first extra field."),
  extraField2: s.string("The second extra field."),
  extraField3: s.string("The third extra field."),
  extraField4: s.string("The fourth extra field."),
  points: s.integer("The subscriber point total."),
  stripeCustomerId: s.nonEmptyString("The Stripe customer ID."),
  tags: s.array("Tags assigned to the subscriber.", s.nonEmptyString("One subscriber tag.")),
  address: s.string("The street address."),
  city: s.string("The city."),
  country: s.string("The country."),
};
const optionalMutation = [
  ...identifierNames,
  "name",
  "extraField",
  "extraField2",
  "extraField3",
  "extraField4",
  "points",
  "stripeCustomerId",
  "tags",
  "address",
  "city",
  "country",
];
const response = (description: string) =>
  s.object(description, { data: loose("The normalized data returned by ReferralHero."), ...metadata });
const oneIdentifier = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  anyOf: identifierNames.map((name) => ({ required: [name] })),
});
export const referralheroActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_list",
    operationType: "write",
    description: "Create a ReferralHero referral campaign with a name and default referral URL.",
    requiredScopes: [],
    inputSchema: s.object("Parameters for creating a campaign.", {
      name: s.nonEmptyString("The campaign name."),
      website: s.url("The default referral URL."),
    }),
    outputSchema: response("The created campaign response."),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List active ReferralHero referral campaigns in the connected account.",
    requiredScopes: [],
    inputSchema: s.object("Pagination for listing campaigns.", { page }, { optional: ["page"] }),
    outputSchema: s.object("A page of campaigns.", {
      lists: array("The active campaigns.", "One campaign."),
      pagination,
      ...metadata,
    }),
  }),
  defineProviderAction(service, {
    name: "get_leaderboard",
    operationType: "read",
    description: "Get the highest-ranked subscribers in a ReferralHero campaign.",
    requiredScopes: [],
    inputSchema: s.object("Parameters for a campaign leaderboard.", {
      campaignId,
      count: s.integer("The subscribers to return, from 10 through 100.", { minimum: 10, maximum: 100 }),
    }),
    outputSchema: s.object("The campaign leaderboard.", {
      ranking: array("The ranked subscribers.", "One ranked subscriber."),
      ...metadata,
    }),
  }),
  defineProviderAction(service, {
    name: "list_rewards",
    operationType: "read",
    description: "List the rewards configured for a ReferralHero campaign.",
    requiredScopes: [],
    inputSchema: campaign,
    outputSchema: s.object("The configured rewards.", {
      rewards: array("The configured rewards.", "One reward."),
      ...metadata,
    }),
  }),
  defineProviderAction(service, {
    name: "add_subscriber",
    operationType: "write",
    description: "Add a subscriber to a ReferralHero campaign using its configured identifier.",
    requiredScopes: [],
    inputSchema: oneIdentifier(
      s.object(
        "Parameters for adding a subscriber.",
        {
          campaignId,
          ...mutation,
          status: s.stringEnum("The initial conversion status.", ["custom_event_pending"]),
          transactionId: s.nonEmptyString("The external transaction ID."),
          conversionCategory: s.string("The conversion category."),
          conversionValue: s.number("The conversion value."),
          device: s.string("The analytics device."),
          source: s.string("The acquisition source."),
          doubleOptin: s.boolean("Whether to send confirmation."),
          referrer: s.nonEmptyString("The referrer identifier."),
          domain: s.url("The referral-link URL."),
          advocateName: s.string("The advocate name."),
        },
        {
          optional: [
            ...optionalMutation,
            "status",
            "transactionId",
            "conversionCategory",
            "conversionValue",
            "device",
            "source",
            "doubleOptin",
            "referrer",
            "domain",
            "advocateName",
          ],
        },
      ),
    ),
    outputSchema: response("The created subscriber response."),
  }),
  defineProviderAction(service, {
    name: "list_subscribers",
    operationType: "read",
    description: "List subscribers in a ReferralHero campaign with pagination and optional sorting.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing subscribers.",
      {
        campaignId,
        page,
        sortBy: s.stringEnum("The subscriber ordering.", [
          "registration_desc",
          "registration_asc",
          "email_asc",
          "email_desc",
          "name_asc",
          "name_desc",
          "position_asc",
          "position_desc",
          "people_referred_asc",
          "people_referred_desc",
          "points_asc",
          "points_desc",
        ]),
        extraField: s.string("Filter by the first extra field."),
        extraField2: s.string("Filter by the second extra field."),
        optionField: s.string("Filter by the option field."),
        stripeCustomerId: s.string("Filter by Stripe customer ID."),
      },
      { optional: ["page", "sortBy", "extraField", "extraField2", "optionField", "stripeCustomerId"] },
    ),
    outputSchema: s.object("A page of subscribers.", {
      subscribers: array("The subscribers.", "One subscriber."),
      pagination,
      ...metadata,
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    operationType: "read",
    description: "Retrieve one verified ReferralHero subscriber by ID.",
    requiredScopes: [],
    inputSchema: subscriber,
    outputSchema: response("The retrieved subscriber response."),
  }),
  defineProviderAction(service, {
    name: "update_subscriber",
    operationType: "write",
    description: "Update fields on one verified ReferralHero subscriber.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for updating a subscriber.",
      { campaignId, subscriberId, ...mutation },
      { optional: optionalMutation },
    ),
    outputSchema: response("The updated subscriber response."),
  }),
  defineProviderAction(service, {
    name: "delete_subscriber",
    operationType: "destructive",
    description: "Delete one subscriber from a ReferralHero campaign.",
    requiredScopes: [],
    inputSchema: subscriber,
    outputSchema: response("The deleted subscriber response."),
  }),
  defineProviderAction(service, {
    name: "track_conversion",
    operationType: "write",
    description: "Track the second conversion event for a two-step or three-step referral campaign.",
    requiredScopes: [],
    inputSchema: oneIdentifier(
      s.object(
        "Parameters for tracking a conversion.",
        {
          campaignId,
          ...identifiers,
          referrer: s.nonEmptyString("The referrer identifier."),
          conversionValue: s.number("The conversion value."),
          stripeCustomerId: s.string("The Stripe customer ID."),
          transactionId: s.string("The transaction ID."),
          productId: s.string("The product ID."),
          tags: s.array("Tags assigned during tracking.", s.nonEmptyString("One tag.")),
        },
        {
          optional: [
            ...identifierNames,
            "referrer",
            "conversionValue",
            "stripeCustomerId",
            "transactionId",
            "productId",
            "tags",
          ],
        },
      ),
    ),
    outputSchema: response("The tracked conversion response."),
  }),
  defineProviderAction(service, {
    name: "confirm_referral",
    operationType: "write",
    description: "Confirm the third conversion event for a verified ReferralHero subscriber.",
    requiredScopes: [],
    inputSchema: subscriber,
    outputSchema: response("The confirmed subscriber response."),
  }),
];
