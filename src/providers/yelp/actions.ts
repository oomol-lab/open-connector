import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "yelp";

const latitudeSchema = s.number("Latitude in decimal degrees.", { minimum: -90, maximum: 90 });
const longitudeSchema = s.number("Longitude in decimal degrees.", { minimum: -180, maximum: 180 });
const localeSchema = s.nonEmptyString("Locale used by Yelp for localized response text, such as en_US.");
const coordinateSchema = s.object("Geographic coordinates returned by Yelp.", {
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});
const categorySchema = s.object("One Yelp business category.", {
  alias: s.string("Yelp category alias."),
  title: s.string("Human-readable Yelp category title."),
});
const locationSchema = s.object(
  "Normalized business location.",
  {
    address1: s.string("Primary street address line."),
    address2: s.string("Secondary street address line."),
    address3: s.string("Tertiary street address line."),
    city: s.string("City name."),
    state: s.string("State or region code."),
    zipCode: s.string("Postal code."),
    country: s.string("Country code."),
    displayAddress: s.array("Formatted address lines for the business.", s.string("One formatted address line.")),
  },
  { optional: ["address1", "address2", "address3", "city", "state", "zipCode", "country", "displayAddress"] },
);

const businessSummaryProperties = {
  id: s.string("Yelp business identifier."),
  alias: s.string("Yelp business alias."),
  name: s.string("Business display name."),
  imageUrl: s.url("Primary business image URL."),
  isClosed: s.boolean("Whether the business is permanently closed."),
  url: s.url("Yelp listing URL for the business."),
  reviewCount: s.integer("Total Yelp review count."),
  categories: s.array("Business categories returned by Yelp.", categorySchema),
  rating: s.number("Average Yelp rating."),
  coordinates: coordinateSchema,
  transactions: s.array(
    "Supported transaction modes such as pickup or delivery.",
    s.string("One supported transaction mode."),
  ),
  price: s.string("Displayed price tier."),
  location: locationSchema,
  phone: s.string("Phone number in E.164 format."),
  displayPhone: s.string("Human-readable phone number."),
  distance: s.number("Distance from the search anchor in meters."),
};

const businessSummaryOptionalFields = [
  "imageUrl",
  "reviewCount",
  "categories",
  "rating",
  "coordinates",
  "transactions",
  "price",
  "location",
  "phone",
  "displayPhone",
  "distance",
];

const businessSummarySchema = s.object("Normalized Yelp business summary.", businessSummaryProperties, {
  optional: businessSummaryOptionalFields,
});

const businessHourEntrySchema = s.object("One Yelp business opening-hours entry.", {
  isOvernight: s.boolean("Whether the hours entry continues into the next day."),
  start: s.string("Opening time in HHMM 24-hour format."),
  end: s.string("Closing time in HHMM 24-hour format."),
  day: s.integer("Day of week where 0 is Monday.", { minimum: 0, maximum: 6 }),
});

const businessHoursSchema = s.object("One Yelp business hours block.", {
  open: s.array("Opening-hours entries returned by Yelp.", businessHourEntrySchema),
  hoursType: s.string("Hours type such as REGULAR."),
  isOpenNow: s.boolean("Whether the business is open at the current time."),
});

const businessDetailSchema = s.object(
  "Normalized Yelp business details.",
  {
    ...businessSummaryProperties,
    photos: s.array("Photo URLs returned by Yelp.", s.url("One photo URL returned by Yelp.")),
    hours: s.array("Business opening-hours blocks returned by Yelp.", businessHoursSchema),
  },
  {
    optional: [...businessSummaryOptionalFields, "photos", "hours"],
  },
);

const searchBusinessesInputSchema: JsonSchema = {
  ...s.object(
    "Input for Yelp business search.",
    {
      term: s.nonEmptyString("Search term such as coffee or sushi."),
      location: s.nonEmptyString("Location text such as a city, neighborhood, or postal code."),
      latitude: latitudeSchema,
      longitude: longitudeSchema,
      categories: s.stringArray("Category aliases used to filter business results.", {
        minItems: 1,
        itemDescription: "One Yelp category alias.",
      }),
      limit: s.integer("Maximum number of businesses to return.", { minimum: 1, maximum: 50 }),
      offset: s.integer("Pagination offset used for business search.", { minimum: 0 }),
      radius: s.integer("Search radius in meters.", { minimum: 1, maximum: 40000 }),
      sortBy: s.stringEnum("Sort order used by Yelp business search.", [
        "best_match",
        "rating",
        "review_count",
        "distance",
      ]),
      openNow: s.boolean("Whether to return businesses that are open now."),
      openAt: s.integer("Unix timestamp used to filter businesses open at a specific time.", { exclusiveMinimum: 0 }),
      locale: localeSchema,
      attributes: s.stringArray("Yelp attribute filters to apply.", {
        minItems: 1,
        itemDescription: "One Yelp attribute filter.",
      }),
      priceTiers: s.array(
        "Price tiers to include in the search.",
        s.stringEnum("One Yelp price tier filter.", ["1", "2", "3", "4"]),
        { minItems: 1 },
      ),
    },
    {
      optional: [
        "term",
        "location",
        "latitude",
        "longitude",
        "categories",
        "limit",
        "offset",
        "radius",
        "sortBy",
        "openNow",
        "openAt",
        "locale",
        "attributes",
        "priceTiers",
      ],
    },
  ),
  oneOf: [{ required: ["location"] }, { required: ["latitude", "longitude"] }],
};

export const yelpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_businesses",
    description: "Search Yelp businesses by keyword and geographic anchor.",
    inputSchema: searchBusinessesInputSchema,
    outputSchema: s.object(
      "Normalized output payload for Yelp business search.",
      {
        businesses: s.array("Businesses returned by the Yelp business search endpoint.", businessSummarySchema),
        total: s.integer("Total number of matching businesses."),
        region: s.object("Search region metadata returned by Yelp.", { center: coordinateSchema }),
      },
      { optional: ["region"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_businesses_by_phone",
    description: "Find Yelp businesses by exact phone number.",
    inputSchema: s.actionInput(
      { phone: s.nonEmptyString("Business phone number in E.164 format, including the leading plus sign.") },
      ["phone"],
      "Input for Yelp business phone search.",
    ),
    outputSchema: s.actionOutput(
      {
        businesses: s.array("Businesses returned by the Yelp business phone search endpoint.", businessSummarySchema),
        total: s.integer("Total number of matching businesses."),
      },
      "Normalized output payload for Yelp business phone search.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_business_details",
    description: "Get Yelp business details for one business identifier or alias.",
    inputSchema: s.object(
      "Input for Yelp business details.",
      {
        businessId: s.nonEmptyString("Yelp business identifier or alias returned by a previous search result."),
        locale: localeSchema,
      },
      { optional: ["locale"] },
    ),
    outputSchema: s.actionOutput(
      {
        business: businessDetailSchema,
      },
      "Normalized output payload for Yelp business details.",
    ),
  }),
];
