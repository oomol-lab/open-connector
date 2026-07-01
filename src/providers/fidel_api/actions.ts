import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fidel_api";

const cursorField = s.string(
  "The opaque cursor string returned as nextCursor by a previous Fidel list action. Pass it back unchanged.",
  { minLength: 1 },
);
const orderField = s.stringEnum("Sort order for the upstream created or datetime field.", ["asc", "desc"]);
const freeformMetadataSchema = s.nullable(
  s.looseObject({}, { description: "The optional metadata object returned by Fidel." }),
);
const responseMetaSchema = {
  resource: s.string("The Fidel API resource path that handled the request."),
  status: s.integer("The upstream HTTP status code returned by Fidel."),
  executionMs: s.nullable(s.number("The upstream execution time in milliseconds when Fidel returned it.")),
};

const brandSchema = s.requiredObject("A Fidel brand record normalized by the connector.", {
  id: s.string("The Fidel brand ID."),
  accountId: s.nullable(s.string("The Fidel account ID that owns the brand.")),
  created: s.nullable(s.string("The ISO timestamp when the brand was created.")),
  updated: s.nullable(s.string("The ISO timestamp when the brand was last updated.")),
  name: s.nullable(s.string("The brand display name.")),
  metadata: freeformMetadataSchema,
  logoUrl: s.nullable(s.string("The brand logo URL when Fidel returned one.")),
  live: s.nullable(s.boolean("Whether the brand belongs to the live environment.")),
  consent: s.nullable(s.boolean("Whether the brand requires cardholder consent.")),
  websiteUrl: s.nullable(s.string("The brand website URL when Fidel returned one.")),
});
const cardSchema = s.requiredObject("A Fidel card record normalized by the connector.", {
  id: s.string("The Fidel card ID."),
  accountId: s.nullable(s.string("The Fidel account ID that owns the card.")),
  countryCode: s.nullable(s.string("The ISO alpha-3 country code for the card.")),
  created: s.nullable(s.string("The ISO timestamp when the card was created.")),
  expYear: s.nullable(s.integer("The card expiration year.")),
  expDate: s.nullable(s.string("The ISO date for the card expiration month.")),
  live: s.nullable(s.boolean("Whether the card belongs to the live environment.")),
  lastNumbers: s.nullable(s.string("The last four card digits.")),
  expMonth: s.nullable(s.integer("The card expiration month.")),
  updated: s.nullable(s.string("The ISO timestamp when the card was last updated.")),
  programId: s.nullable(s.string("The Fidel program ID that owns the card.")),
  firstNumbers: s.nullable(s.string("The first six card digits.")),
  scheme: s.nullable(s.string("The card network reported by Fidel.")),
  type: s.nullable(s.string("The card type reported by Fidel.")),
});
const transactionCardSchema = s.requiredObject("The card snapshot nested inside a Fidel transaction.", {
  id: s.nullable(s.string("The Fidel card ID.")),
  firstNumbers: s.nullable(s.string("The first six card digits.")),
  lastNumbers: s.nullable(s.string("The last four card digits.")),
  scheme: s.nullable(s.string("The card network reported by Fidel.")),
});
const transactionLocationSchema = s.requiredObject("The location snapshot nested inside a Fidel transaction.", {
  id: s.nullable(s.string("The Fidel location ID.")),
  address: s.nullable(s.string("The location street address.")),
  city: s.nullable(s.string("The location city.")),
  countryCode: s.nullable(s.string("The ISO alpha-3 country code for the location.")),
  geolocation: s.nullable(
    s.requiredObject("The optional latitude and longitude returned by Fidel for this location.", {
      latitude: s.nullable(s.number("The latitude coordinate.")),
      longitude: s.nullable(s.number("The longitude coordinate.")),
    }),
  ),
  postcode: s.nullable(s.string("The location postal code.")),
  state: s.nullable(s.string("The location state or region field returned by Fidel.")),
  timezone: s.nullable(s.string("The IANA timezone for the location.")),
  metadata: freeformMetadataSchema,
});
const transactionBrandSchema = s.requiredObject("The brand snapshot nested inside a Fidel transaction.", {
  id: s.nullable(s.string("The Fidel brand ID.")),
  name: s.nullable(s.string("The brand name.")),
  logoUrl: s.nullable(s.string("The brand logo URL when Fidel returned one.")),
  metadata: freeformMetadataSchema,
});
const transactionIdentifiersSchema = s.requiredObject(
  "Network-specific identifiers returned by Fidel for a transaction.",
  {
    amexApprovalCode: s.nullable(s.string("The American Express approval code when Fidel returned one.")),
    mastercardAuthCode: s.nullable(s.string("The Mastercard authorization code when Fidel returned one.")),
    mastercardRefNumber: s.nullable(s.string("The Mastercard reference number when Fidel returned one.")),
    mastercardTransactionSequenceNumber: s.nullable(
      s.string("The Mastercard transaction sequence number when Fidel returned one."),
    ),
    mid: s.nullable(s.string("The merchant identifier returned by Fidel.")),
    visaAuthCode: s.nullable(s.string("The Visa authorization code when Fidel returned one.")),
  },
);
const transactionSchema = s.requiredObject("A Fidel transaction record normalized by the connector.", {
  id: s.string("The Fidel transaction ID."),
  programId: s.nullable(s.string("The Fidel program ID that owns the transaction.")),
  accountId: s.nullable(s.string("The Fidel account ID that owns the transaction.")),
  created: s.nullable(s.string("The ISO timestamp when the transaction was created.")),
  updated: s.nullable(s.string("The ISO timestamp when the transaction was last updated.")),
  amount: s.nullable(s.number("The transaction amount.")),
  currency: s.nullable(s.string("The ISO currency code for the transaction.")),
  authorizationCode: s.nullable(s.string("The normalized authorization or approval code returned by Fidel.")),
  auth: s.nullable(s.boolean("Whether Fidel classified the event as an authorization.")),
  cleared: s.nullable(s.boolean("Whether Fidel classified the event as cleared.")),
  wallet: s.nullable(s.looseObject({}, { description: "The optional wallet object returned by Fidel." })),
  offer: s.nullable(s.looseObject({}, { description: "The optional offer object returned by Fidel." })),
  datetime: s.nullable(s.string("The upstream transaction datetime string returned by Fidel.")),
  card: transactionCardSchema,
  location: transactionLocationSchema,
  brand: transactionBrandSchema,
  identifiers: transactionIdentifiersSchema,
  cardPresent: s.nullable(s.boolean("Whether Fidel marked the transaction as card present.")),
});

export const fidelApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_brands",
    description: "List Fidel brands available to the connected secret API key.",
    inputSchema: s.object(
      "Optional filters for listing Fidel brands.",
      {
        limit: s.integer("The maximum number of brands to return.", { minimum: 1 }),
        start: cursorField,
        order: orderField,
        name: s.string("Filter brands by name.", { minLength: 1 }),
      },
      { optional: ["limit", "start", "order", "name"] },
    ),
    outputSchema: s.requiredObject("The normalized result of listing Fidel brands.", {
      count: s.integer("The number of brands returned by Fidel."),
      brands: s.array("The brand records returned by Fidel.", brandSchema),
      nextCursor: s.nullable(
        s.string("The cursor string to pass back as start in the next list_brands call, or null when absent."),
      ),
      ...responseMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_brand",
    description: "Fetch one Fidel brand by brand ID.",
    inputSchema: s.requiredObject("The Fidel brand lookup input.", {
      brandId: s.string("The Fidel brand ID to fetch.", { minLength: 1 }),
    }),
    outputSchema: s.requiredObject("The normalized result of fetching one Fidel brand.", {
      brand: brandSchema,
      ...responseMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_cards",
    description: "List Fidel cards for one program ID.",
    inputSchema: s.object(
      "The Fidel card list input.",
      {
        programId: s.string("The Fidel program ID whose cards you want to list.", { minLength: 1 }),
        limit: s.integer("The maximum number of cards to return.", { minimum: 1 }),
        start: cursorField,
        order: orderField,
      },
      { required: ["programId"], optional: ["limit", "start", "order"] },
    ),
    outputSchema: s.requiredObject("The normalized result of listing Fidel cards.", {
      count: s.integer("The number of cards returned by Fidel."),
      cards: s.array("The card records returned by Fidel.", cardSchema),
      nextCursor: s.nullable(
        s.string("The cursor string to pass back as start in the next list_cards call, or null when absent."),
      ),
      ...responseMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_card",
    description: "Fetch one Fidel card by card ID.",
    inputSchema: s.requiredObject("The Fidel card lookup input.", {
      cardId: s.string("The Fidel card ID to fetch.", { minLength: 1 }),
    }),
    outputSchema: s.requiredObject("The normalized result of fetching one Fidel card.", {
      card: cardSchema,
      ...responseMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    description: "List Fidel transactions for one program ID.",
    inputSchema: s.object(
      "The Fidel transaction list input.",
      {
        programId: s.string("The Fidel program ID whose transactions you want to list.", { minLength: 1 }),
        limit: s.integer("The maximum number of transactions to return.", { minimum: 1 }),
        start: cursorField,
        order: orderField,
        from: s.string("The inclusive starting ISO date-time filter.", { minLength: 1, format: "date-time" }),
        to: s.string("The inclusive ending ISO date-time filter.", { minLength: 1, format: "date-time" }),
      },
      { required: ["programId"], optional: ["limit", "start", "order", "from", "to"] },
    ),
    outputSchema: s.requiredObject("The normalized result of listing Fidel transactions for one program.", {
      count: s.integer("The number of transactions returned by Fidel."),
      transactions: s.array("The transaction records returned by Fidel.", transactionSchema),
      nextCursor: s.nullable(
        s.string("The cursor string to pass back as start in the next list_transactions call, or null when absent."),
      ),
      ...responseMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_transaction",
    description: "Fetch one Fidel transaction by transaction ID.",
    inputSchema: s.requiredObject("The Fidel transaction lookup input.", {
      transactionId: s.string("The Fidel transaction ID to fetch.", { minLength: 1 }),
    }),
    outputSchema: s.requiredObject("The normalized result of fetching one Fidel transaction.", {
      transaction: transactionSchema,
      ...responseMetaSchema,
    }),
  }),
];

export type FidelApiActionName =
  | "list_brands"
  | "get_brand"
  | "list_cards"
  | "get_card"
  | "list_transactions"
  | "get_transaction";
