import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tripadvisor";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const latitudeSchema = s.number("Latitude in decimal degrees.", { minimum: -90, maximum: 90 });
const longitudeSchema = s.number("Longitude in decimal degrees.", { minimum: -180, maximum: 180 });
const locationCategorySchema = s.stringEnum("Tripadvisor location category filter.", [
  "hotels",
  "attractions",
  "restaurants",
  "geos",
]);
const radiusUnitSchema = s.stringEnum("Distance unit used for radius filtering.", ["km", "mi", "m"]);
const locationIdSchema = s.anyOf("Tripadvisor location identifier.", [
  s.positiveInteger("Positive Tripadvisor location identifier."),
  nonEmptyString("Tripadvisor location identifier returned by a previous action."),
]);

const imageVariantSchema = s.object("One Tripadvisor image size variant.", {
  url: s.string("Direct image URL for this size variant."),
  width: s.integer("Image width in pixels."),
  height: s.integer("Image height in pixels."),
});
const userAvatarSchema = s.looseObject("Reviewer avatar URLs returned by Tripadvisor.", {
  small: s.string("Small avatar URL."),
  medium: s.string("Medium avatar URL."),
  large: s.string("Large avatar URL."),
  thumbnail: s.string("Thumbnail avatar URL."),
  original: s.string("Original avatar URL."),
});
const addressObjSchema = s.object(
  "Normalized Tripadvisor address object.",
  {
    street1: s.string("Primary street address line."),
    street2: s.string("Secondary street address line."),
    city: s.string("City name."),
    state: s.string("State or region name."),
    country: s.string("Country name."),
    postalCode: s.string("Postal code."),
    addressString: s.string("Formatted address string."),
  },
  { optional: ["street1", "street2", "city", "state", "country", "postalCode", "addressString"] },
);
const locationSummarySchema = s.object(
  "Normalized Tripadvisor location summary.",
  {
    locationId: s.string("Normalized Tripadvisor location identifier."),
    name: s.string("Location display name."),
    distance: s.string("Distance text returned by Tripadvisor."),
    bearing: s.string("Bearing text returned by Tripadvisor."),
    addressObj: addressObjSchema,
  },
  { optional: ["distance", "bearing", "addressObj"] },
);
const locationDetailsSchema = s.object(
  "Normalized Tripadvisor location details.",
  {
    locationId: s.string("Normalized Tripadvisor location identifier."),
    name: s.string("Location display name."),
    description: s.string("Location description returned by Tripadvisor."),
    webUrl: s.string("Tripadvisor listing URL for the location."),
    website: s.string("Official website URL for the location."),
    phone: s.string("Location phone number."),
    email: s.string("Location email address."),
    rating: s.number("Average Tripadvisor rating."),
    numReviews: s.integer("Total number of Tripadvisor reviews."),
    latitude: s.number("Latitude coordinate of the location."),
    longitude: s.number("Longitude coordinate of the location."),
    timezone: s.string("Timezone of the location."),
    addressObj: addressObjSchema,
  },
  {
    optional: [
      "name",
      "description",
      "webUrl",
      "website",
      "phone",
      "email",
      "rating",
      "numReviews",
      "latitude",
      "longitude",
      "timezone",
      "addressObj",
    ],
  },
);
const reviewerLocationSchema = s.object(
  "Reviewer location metadata returned by Tripadvisor.",
  {
    id: s.string("Reviewer location identifier."),
    name: s.string("Reviewer location name."),
  },
  { optional: ["id", "name"] },
);
const photoUserSchema = s.object(
  "Normalized Tripadvisor photo uploader metadata.",
  {
    username: s.string("Photo uploader display name."),
    reviewCount: s.integer("Number of reviews written by the uploader."),
    reviewerBadge: s.string("Reviewer badge label returned by Tripadvisor."),
    userLocation: reviewerLocationSchema,
    avatar: userAvatarSchema,
  },
  { optional: ["username", "reviewCount", "reviewerBadge", "userLocation", "avatar"] },
);
const photoSourceSchema = s.object(
  "Photo source metadata returned by Tripadvisor.",
  {
    name: s.string("Photo source name."),
    localizedName: s.string("Localized photo source name."),
  },
  { optional: ["name", "localizedName"] },
);
const photoImagesSchema = s.looseObject("Normalized Tripadvisor photo image variants.", {
  thumbnail: imageVariantSchema,
  small: imageVariantSchema,
  medium: imageVariantSchema,
  large: imageVariantSchema,
  original: imageVariantSchema,
});
const photoSchema = s.object(
  "Normalized Tripadvisor photo.",
  {
    id: s.integer("Tripadvisor photo identifier."),
    album: s.string("Photo album label."),
    caption: s.string("Photo caption text."),
    isBlessed: s.boolean("Whether Tripadvisor marks the photo as blessed."),
    publishedDate: s.string("Photo published date returned by Tripadvisor."),
    images: photoImagesSchema,
    source: photoSourceSchema,
    user: photoUserSchema,
  },
  { optional: ["album", "caption", "isBlessed", "publishedDate", "source", "user"] },
);
const pagingSchema = s.object(
  "Normalized Tripadvisor paging metadata.",
  {
    next: s.string("Next page URL returned by Tripadvisor."),
    previous: s.string("Previous page URL returned by Tripadvisor."),
    results: s.integer("Number of items in the current page."),
    skipped: s.integer("Number of skipped items for this page."),
    totalResults: s.integer("Total number of available items."),
  },
  { optional: ["next", "previous", "results", "skipped", "totalResults"] },
);

export const tripadvisorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_locations",
    operationType: "read",
    description: "Search Tripadvisor locations by text with optional geographic and category filters.",
    inputSchema: s.object(
      "Input parameters for Tripadvisor location search.",
      {
        searchQuery: nonEmptyString("Text used to search Tripadvisor locations by name."),
        category: locationCategorySchema,
        phone: nonEmptyString("Phone number used to filter search results."),
        address: nonEmptyString("Address text used to filter search results."),
        latitude: latitudeSchema,
        longitude: longitudeSchema,
        radius: s.number("Radius length used when latitude and longitude are provided.", { exclusiveMinimum: 0 }),
        radiusUnit: radiusUnitSchema,
        language: nonEmptyString("Supported Tripadvisor language code."),
      },
      { optional: ["category", "phone", "address", "latitude", "longitude", "radius", "radiusUnit", "language"] },
    ),
    outputSchema: s.object("Normalized Tripadvisor location search response.", {
      locations: s.array("Location summaries returned by Tripadvisor location search.", locationSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_nearby_locations",
    operationType: "read",
    description: "Search Tripadvisor locations near a latitude and longitude coordinate pair.",
    inputSchema: s.object(
      "Input parameters for Tripadvisor nearby location search.",
      {
        latitude: latitudeSchema,
        longitude: longitudeSchema,
        category: locationCategorySchema,
        phone: nonEmptyString("Phone number used to filter nearby results."),
        address: nonEmptyString("Address text used to filter nearby results."),
        radius: s.number("Radius length used to constrain the nearby search.", { exclusiveMinimum: 0 }),
        radiusUnit: radiusUnitSchema,
        language: nonEmptyString("Supported Tripadvisor language code."),
      },
      { optional: ["category", "phone", "address", "radius", "radiusUnit", "language"] },
    ),
    outputSchema: s.object("Normalized Tripadvisor nearby location response.", {
      locations: s.array("Location summaries returned by Tripadvisor nearby search.", locationSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_location_details",
    operationType: "read",
    description: "Get detailed Tripadvisor information for one location.",
    inputSchema: s.object(
      "Input parameters for retrieving Tripadvisor location details.",
      {
        locationId: locationIdSchema,
        language: nonEmptyString("Supported Tripadvisor language code."),
        currency: nonEmptyString("ISO 4217 currency code used for localized fields."),
      },
      { optional: ["language", "currency"] },
    ),
    outputSchema: s.object("Normalized Tripadvisor location details response.", {
      location: locationDetailsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_location_photos",
    operationType: "read",
    description: "Get Tripadvisor photos for one location with optional paging and source filters.",
    inputSchema: s.object(
      "Input parameters for retrieving Tripadvisor location photos.",
      {
        locationId: locationIdSchema,
        language: nonEmptyString("Supported Tripadvisor language code."),
        limit: s.integer("Maximum number of photos to return, up to 5.", { minimum: 1, maximum: 5 }),
        offset: s.nonNegativeInteger("Zero-based pagination offset for photo results."),
        sources: s.array(
          "Allowed Tripadvisor photo sources to include in the response.",
          s.stringEnum("Allowed Tripadvisor photo source filter.", ["Expert", "Management", "Traveler"]),
          { minItems: 1 },
        ),
      },
      { optional: ["language", "limit", "offset", "sources"] },
    ),
    outputSchema: s.object(
      "Normalized Tripadvisor location photos response.",
      {
        photos: s.array("Photos returned by Tripadvisor.", photoSchema),
        paging: pagingSchema,
      },
      { optional: ["paging"] },
    ),
  }),
];
