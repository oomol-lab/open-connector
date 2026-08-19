import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ticketmaster";

const rawObject = s.unknownObject("A raw Ticketmaster object returned by the upstream API.");
const page = s.looseObject("Ticketmaster pagination metadata.", {
  size: s.number("The number of items returned in the current page."),
  totalElements: s.number("The total number of items available."),
  totalPages: s.number("The total number of pages available."),
  number: s.number("The zero-based page index."),
});
const image = s.looseObject("A Ticketmaster image.", {
  url: s.string("The image URL."),
  ratio: s.nullableString("The image ratio."),
  width: s.nullableNumber("The image width in pixels."),
  height: s.nullableNumber("The image height in pixels."),
  fallback: s.nullableBoolean("Whether this is a fallback image."),
  attribution: s.nullableString("The image attribution."),
});
const entity = s.looseObject("A Ticketmaster entity reference.", {
  id: s.string("The entity identifier."),
  name: s.nullableString("The entity display name."),
  type: s.nullableString("The entity type."),
});
const event = s.looseObject("A normalized Ticketmaster event.", {
  id: s.string("The event identifier."),
  name: s.nullableString("The event name."),
  images: s.array("The event images.", image),
  venues: s.array("Embedded venue references.", entity),
  attractions: s.array("Embedded attraction references.", entity),
  raw: rawObject,
});
const attraction = s.looseObject("A normalized Ticketmaster attraction.", {
  id: s.string("The attraction identifier."),
  name: s.nullableString("The attraction name."),
  images: s.array("The attraction images.", image),
  raw: rawObject,
});
const venue = s.looseObject("A normalized Ticketmaster venue.", {
  id: s.string("The venue identifier."),
  name: s.nullableString("The venue name."),
  cityName: s.nullableString("The venue city name."),
  countryCode: s.nullableString("The venue country code."),
  raw: rawObject,
});
const classification = s.looseObject("A normalized Ticketmaster classification.", {
  id: s.string("The classification identifier."),
  name: s.nullableString("The classification name."),
  raw: rawObject,
});

const stringField = (description: string) => s.string(description);
const requiredStringField = (description: string) => s.nonEmptyString(description);
const idLookupInput = s.object(
  "Input for reading one Ticketmaster entity.",
  {
    id: requiredStringField("The Ticketmaster entity identifier."),
    locale: stringField("The locale filter."),
    domain: stringField("The region or domain filter."),
  },
  { optional: ["locale", "domain"] },
);
const searchInput = s.looseObject("Ticketmaster search filters forwarded as query parameters.");
const sectionMapInput = s.object(
  "Input for retrieving a Ticketmaster section-map image.",
  {
    eventId: requiredStringField("The Ticketmaster event identifier."),
    systemId: s.stringEnum("The upstream system identifier.", ["HOST", "MFX"]),
    placeId: stringField("The place identifier."),
    sectionNames: s.stringArray("Section names to highlight."),
    domain: stringField("The MFX domain value."),
    width: s.positiveInteger("The rendered image width in pixels."),
    pinWidth: s.positiveInteger("The pin width in pixels."),
    showLabels: s.boolean("Whether to render section labels."),
  },
  { optional: ["placeId", "sectionNames", "domain", "width", "pinWidth", "showLabels"] },
);
const seasonTicketingInput = s.object(
  "Input for executing a Ticketmaster Season Ticketing command.",
  {
    product: stringField("The Season Ticketing product path segment."),
    header: s.looseObject("The Season Ticketing request header."),
    command: s.looseObject("The Season Ticketing command payload."),
    cookies: s.record("Cookie values to send while polling.", s.string("A cookie value.")),
    maxPollAttempts: s.integer("Maximum polling attempts.", { minimum: 1, maximum: 20 }),
    pollDelayMs: s.integer("Delay between polling attempts in milliseconds.", {
      minimum: 0,
      maximum: 10_000,
    }),
  },
  { required: ["header", "command"] },
);

export const ticketmasterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_events",
    description: "Search Discovery API events with Ticketmaster filters.",
    inputSchema: searchInput,
    outputSchema: s.object("Ticketmaster event search output.", {
      events: s.array("The events returned by the search.", event),
      page: s.nullable(page),
      links: rawObject,
      spellcheck: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_event_details",
    description: "Get the details for a specific Ticketmaster event by ID.",
    inputSchema: idLookupInput,
    outputSchema: s.object({ event }),
  }),
  defineProviderAction(service, {
    name: "get_event_images",
    description: "Get the image set for a specific Ticketmaster event.",
    inputSchema: idLookupInput,
    outputSchema: s.object({
      eventId: s.string("The Ticketmaster event identifier."),
      images: s.array("The event images.", image),
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_attractions",
    description: "Search Discovery API attractions.",
    inputSchema: searchInput,
    outputSchema: s.object({
      attractions: s.array("The attractions returned by the search.", attraction),
      page: s.nullable(page),
      links: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_attraction_details",
    description: "Get the details for a specific Ticketmaster attraction by ID.",
    inputSchema: idLookupInput,
    outputSchema: s.object({ attraction }),
  }),
  defineProviderAction(service, {
    name: "get_venues",
    description: "Search Discovery API venues.",
    inputSchema: searchInput,
    outputSchema: s.object({
      venues: s.array("The venues returned by the search.", venue),
      page: s.nullable(page),
      links: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_venue_details",
    description: "Get the details for a specific Ticketmaster venue by ID.",
    inputSchema: idLookupInput,
    outputSchema: s.object({ venue }),
  }),
  defineProviderAction(service, {
    name: "get_suggestions",
    description: "Retrieve Ticketmaster search suggestions.",
    inputSchema: searchInput,
    outputSchema: s.object({
      events: s.array("Suggested events.", event),
      attractions: s.array("Suggested attractions.", attraction),
      venues: s.array("Suggested venues.", venue),
      page: s.nullable(page),
      links: rawObject,
      spellcheck: rawObject,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_classifications",
    description: "Search Ticketmaster classifications.",
    inputSchema: searchInput,
    outputSchema: s.object({
      classifications: s.array("The classifications returned by the search.", classification),
      page: s.nullable(page),
      links: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_classification_details",
    description: "Get a Ticketmaster classification by ID.",
    inputSchema: idLookupInput,
    outputSchema: s.object({ classification }),
  }),
  defineProviderAction(service, {
    name: "get_segment_details",
    description: "Get a Ticketmaster segment by ID.",
    inputSchema: idLookupInput,
    outputSchema: s.object({ segment: classification }),
  }),
  defineProviderAction(service, {
    name: "get_genre_details",
    description: "Get a Ticketmaster genre by ID.",
    inputSchema: idLookupInput,
    outputSchema: s.object({ genre: classification }),
  }),
  defineProviderAction(service, {
    name: "get_subgenre_details",
    description: "Get a Ticketmaster sub-genre by ID.",
    inputSchema: idLookupInput,
    outputSchema: s.object({ subGenre: classification }),
  }),
  defineProviderAction(service, {
    name: "get_section_map_image",
    description: "Retrieve a Ticketmaster section-map image as base64.",
    inputSchema: sectionMapInput,
    outputSchema: s.object({
      imageAvailable: s.boolean("Whether the section-map image was returned."),
      contentType: s.nullableString("The returned image content type."),
      imageBase64: s.nullableString("The base64-encoded image content."),
    }),
  }),
  defineProviderAction(service, {
    name: "execute_season_ticketing_command",
    description: "Execute a Ticketmaster Season Ticketing command.",
    inputSchema: seasonTicketingInput,
    outputSchema: s.object({
      statusCode: s.number("The upstream HTTP status code."),
      queued: s.boolean("Whether the command is still queued upstream."),
      status: s.nullableString("The upstream command status."),
      message: s.nullableString("The upstream message."),
      errorCode: s.nullableString("The upstream error code."),
      cookies: s.record("Cookies returned by the upstream API.", s.string("A cookie value.")),
      data: s.nullable(rawObject),
      raw: rawObject,
    }),
  }),
];
