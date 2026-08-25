import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sherpa";

const tripDateTimeSchema = s.object(
  "Arrival or departure details for one Sherpa travel node.",
  {
    date: s.string("Travel date in YYYY-MM-DD format.", { format: "date" }),
    time: s.string("Local travel time in HH:MM format."),
    flightNumber: s.nonEmptyString("Optional flight number without spaces, including the carrier code."),
    travelMode: s.stringEnum("Travel mode used for this itinerary segment.", ["AIR"]),
  },
  { optional: ["flightNumber"] },
);

const travelNodeSchema = s.object(
  "One origin, destination, or transit point in the itinerary.",
  {
    type: s.stringEnum("Role of this point in the itinerary.", ["ORIGIN", "DESTINATION", "TRANSIT"]),
    locationCode: s.nonEmptyString("ISO 3166-1 alpha-3 territory code, supported region code, or IATA airport code."),
    airportCode: s.nonEmptyString("Optional IATA airport code for this travel node."),
    departure: tripDateTimeSchema,
    arrival: tripDateTimeSchema,
  },
  { optional: ["airportCode", "departure", "arrival"] },
);

const tripInputSchema = s.object(
  "Traveller and itinerary details used to retrieve personalized Sherpa travel requirements.",
  {
    locale: s.nonEmptyString("Locale for returned travel requirement content, such as en-US."),
    currency: s.stringEnum("Currency used for visa and ETA prices.", ["USD", "CAD", "GBP", "EUR"]),
    passports: s.array(
      "ISO 3166-1 alpha-3 codes for the traveller's passports.",
      s.nonEmptyString("One traveller passport territory code."),
      { minItems: 1 },
    ),
    travelNodes: s.array("Ordered origin, transit, and destination points.", travelNodeSchema, {
      minItems: 2,
    }),
  },
  { optional: ["locale", "currency"] },
);

const tripResponseSchema = s.looseObject("Sherpa JSON:API trip response.", {
  data: s.looseObject("Personalized trip requirements and information group references."),
  included: s.array(
    "Expanded restrictions, procedures, locations, and products referenced by the trip.",
    s.looseObject("One expanded Sherpa resource."),
  ),
  meta: s.looseObject("Sherpa response metadata."),
  links: s.looseObject("Sherpa response links."),
});

const summaryResponseSchema = s.object("Token-efficient Sherpa travel requirement summary.", {
  meta: s.looseRequiredObject("Metadata for the generated travel requirement summary.", {
    generatedAt: s.string("ISO 8601 timestamp when Sherpa generated the summary."),
    locale: s.string("Locale used for the summary."),
    LlmModel: s.string("Model identifier reported by Sherpa."),
  }),
  data: s.looseRequiredObject("Sherpa's Markdown travel requirement content and confidence metadata.", {
    contentConfidence: s.number("Confidence score reported for the summary content."),
    contentType: s.string("Media type of the summary content."),
    content: s.string("Token-efficient travel requirement summary in Markdown."),
  }),
});

export const sherpaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_trip_details",
    description: "Retrieve comprehensive personalized travel restrictions and document requirements for an itinerary.",
    requiredScopes: [],
    inputSchema: tripInputSchema,
    outputSchema: tripResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_trip_summary",
    description: "Retrieve a concise Markdown summary of personalized travel and visa requirements for an itinerary.",
    requiredScopes: [],
    inputSchema: tripInputSchema,
    outputSchema: summaryResponseSchema,
  }),
];
