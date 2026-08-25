import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "foursquare";

const latitudeSchema = s.number("The latitude coordinate in decimal degrees.", {
  minimum: -90,
  maximum: 90,
});

const longitudeSchema = s.number("The longitude coordinate in decimal degrees.", {
  minimum: -180,
  maximum: 180,
});

const fieldsSchema = s.stringArray("The Foursquare response fields to request.", {
  minItems: 1,
  itemDescription: "One Foursquare field name to include in the response.",
});

const sortSchema = s.stringEnum("The ordering applied to photos or tips.", ["popular", "newest"]);

const photoClassificationSchema = s.stringEnum("One Foursquare photo classification filter.", [
  "food",
  "indoor",
  "menu",
  "outdoor",
]);

const categorySchema = s.looseObject("One Foursquare category.", {
  id: s.anyOf("The category identifier.", [
    s.string("A string category identifier."),
    s.number("A numeric category identifier."),
  ]),
  name: s.string("The category display name."),
  shortName: s.string("The short category name."),
  pluralName: s.string("The plural category name."),
  icon: s.looseObject("The category icon metadata.", {
    prefix: s.string("The icon URL prefix."),
    suffix: s.string("The icon URL suffix."),
  }),
});

const locationSchema = s.looseObject("The normalized place location object.", {
  address: s.string("The street address of the place."),
  addressExtended: s.string("The extended address line of the place."),
  country: s.string("The country code or country name of the place."),
  crossStreet: s.string("The cross street of the place."),
  formattedAddress: s.string("The human-readable formatted address of the place."),
  locality: s.string("The locality or city of the place."),
  postcode: s.string("The postal code of the place."),
  region: s.string("The state or region of the place."),
});

const coordinateSchema = s.requiredObject("One geographic coordinate.", {
  latitude: s.number("The latitude of the coordinate."),
  longitude: s.number("The longitude of the coordinate."),
});

const geocodesSchema = s.looseObject("The normalized geocodes object.", {
  main: coordinateSchema,
});

const hoursSchema = s.looseObject("The place opening hours.", {
  display: s.string("The display string for the opening hours."),
  openNow: s.boolean("Whether the place is open right now."),
  regular: s.array("The regular opening-hour entries returned by Foursquare.", s.looseObject({})),
});

const statsSchema = s.looseObject("The place statistics counters.", {
  totalPhotos: s.integer("The total number of photos."),
  totalRatings: s.integer("The total number of ratings."),
  totalTips: s.integer("The total number of tips."),
});

const tipSchema = s.looseObject("One normalized Foursquare tip.", {
  id: s.string("The tip identifier."),
  createdAt: s.string("The creation timestamp of the tip."),
  text: s.string("The tip text."),
  lang: s.string("The language code of the tip."),
  url: s.string("The canonical URL of the tip."),
  agreeCount: s.integer("The number of agreements on the tip."),
  disagreeCount: s.integer("The number of disagreements on the tip."),
});

const photoSchema = s.looseRequiredObject(
  "One normalized Foursquare photo.",
  {
    id: s.string("The photo identifier."),
    createdAt: s.string("The creation timestamp of the photo."),
    prefix: s.string("The URL prefix of the photo."),
    suffix: s.string("The URL suffix of the photo."),
    width: s.number("The maximum width of the photo."),
    height: s.number("The maximum height of the photo."),
    classifications: s.array("The photo classifications returned by Foursquare.", s.string("A photo classification.")),
    tip: tipSchema,
  },
  {
    optional: ["createdAt", "prefix", "suffix", "width", "height", "classifications", "tip"],
  },
);

const placeSchema = s.looseRequiredObject(
  "One normalized Foursquare place.",
  {
    fsqId: s.string("The Foursquare place identifier."),
    name: s.string("The place name."),
    categories: s.array("The categories of the place.", categorySchema),
    chains: s.array(
      "The chain metadata of the place.",
      s.looseObject("One place chain.", {
        id: s.anyOf("The chain identifier.", [
          s.string("A string chain identifier."),
          s.number("A numeric chain identifier."),
        ]),
        name: s.string("The chain display name."),
      }),
    ),
    dateClosed: s.string("The closure date of the place."),
    description: s.string("The description of the place."),
    distance: s.integer("The distance to the place in meters."),
    email: s.string("The primary contact email of the place."),
    fax: s.string("The fax number of the place."),
    features: s.looseObject("The feature flags of the place."),
    geocodes: geocodesSchema,
    hours: hoursSchema,
    link: s.string("The Foursquare detail link of the place."),
    location: locationSchema,
    menu: s.string("The menu URL of the place."),
    photos: s.array("The embedded place photos.", photoSchema),
    popularity: s.number("The popularity score of the place."),
    price: s.integer("The price tier of the place."),
    rating: s.number("The rating score of the place."),
    socialMedia: s.looseObject("The social media metadata of the place."),
    stats: statsSchema,
    tastes: s.array("The tastes associated with the place.", s.string("A place taste.")),
    tel: s.string("The telephone number of the place."),
    tips: s.array("The embedded tips of the place.", tipSchema),
    timezone: s.string("The timezone of the place."),
    website: s.string("The website URL of the place."),
  },
  {
    optional: [
      "categories",
      "chains",
      "dateClosed",
      "description",
      "distance",
      "email",
      "fax",
      "features",
      "geocodes",
      "hours",
      "link",
      "location",
      "menu",
      "photos",
      "popularity",
      "price",
      "rating",
      "socialMedia",
      "stats",
      "tastes",
      "tel",
      "tips",
      "timezone",
      "website",
    ],
  },
);

const searchContextSchema = s.looseObject("The normalized Foursquare search context.", {
  geoBounds: s.looseObject("The normalized geographic bounds of the search context.", {
    circle: s.looseObject("The circle bounds of the search area.", {
      center: coordinateSchema,
      radius: s.integer("The radius of the search area in meters."),
    }),
  }),
});

const openAtSchema = s.string("The local day and time filter in `DOWTHHMM` format.", {
  pattern: "^[0-6]T([01][0-9]|2[0-3])[0-5][0-9]$",
});

const searchPlacesInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for Foursquare place search.",
    {
      query: s.nonEmptyString("The free-form place query."),
      near: s.nonEmptyString("The locality text used for search biasing."),
      latitude: latitudeSchema,
      longitude: longitudeSchema,
      radius: s.positiveInteger("The search radius in meters.", { maximum: 100000 }),
      limit: s.positiveInteger("The maximum number of results to return.", { maximum: 50 }),
      fields: fieldsSchema,
      openNow: s.boolean("Whether to restrict results to places currently open."),
      openAt: openAtSchema,
      minPrice: s.integer("The minimum Foursquare price tier.", { minimum: 1, maximum: 4 }),
      maxPrice: s.integer("The maximum Foursquare price tier.", { minimum: 1, maximum: 4 }),
      excludeAllChains: s.boolean("Whether to exclude all known chain places from the response."),
    },
    {
      optional: [
        "query",
        "near",
        "latitude",
        "longitude",
        "radius",
        "limit",
        "fields",
        "openNow",
        "openAt",
        "minPrice",
        "maxPrice",
        "excludeAllChains",
      ],
    },
  ),
  anyOf: [{ required: ["query"] }, { required: ["near"] }, { required: ["latitude", "longitude"] }],
};

const nearbyPlacesInputSchema = s.object(
  "Input parameters for Foursquare nearby place discovery.",
  {
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    hacc: s.positiveInteger("The horizontal accuracy radius in meters."),
    altitude: s.integer("The altitude in meters."),
    limit: s.positiveInteger("The maximum number of nearby places to return.", { maximum: 50 }),
    fields: fieldsSchema,
  },
  { optional: ["hacc", "altitude", "limit", "fields"] },
);

const fsqIdSchema = s.nonEmptyString("The unique Foursquare place identifier.");

const getPlaceInputSchema = s.object(
  "Input parameters for retrieving one Foursquare place.",
  {
    fsqId: fsqIdSchema,
    fields: fieldsSchema,
  },
  { optional: ["fields"] },
);

const placePhotosInputSchema = s.object(
  "Input parameters for retrieving Foursquare place photos.",
  {
    fsqId: fsqIdSchema,
    sort: sortSchema,
    limit: s.positiveInteger("The maximum number of photos to return.", { maximum: 50 }),
    classifications: s.array("The photo classifications used to filter the response.", photoClassificationSchema, {
      minItems: 1,
    }),
  },
  { optional: ["sort", "limit", "classifications"] },
);

const placeTipsInputSchema = s.object(
  "Input parameters for retrieving Foursquare place tips.",
  {
    fsqId: fsqIdSchema,
    sort: sortSchema,
    limit: s.positiveInteger("The maximum number of tips to return.", { maximum: 50 }),
    fields: fieldsSchema,
  },
  { optional: ["sort", "limit", "fields"] },
);

export const foursquareActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_places",
    description: "Search for places with the Foursquare Places Search endpoint.",
    requiredScopes: [],
    inputSchema: searchPlacesInputSchema,
    outputSchema: s.object(
      "The normalized Foursquare place search response.",
      {
        context: searchContextSchema,
        results: s.array("The normalized place search results.", placeSchema),
      },
      { optional: ["context"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_nearby_places",
    description: "Retrieve nearby places around a latitude and longitude with Foursquare.",
    requiredScopes: [],
    inputSchema: nearbyPlacesInputSchema,
    outputSchema: s.requiredObject("The normalized Foursquare nearby places response.", {
      results: s.array("The normalized nearby place results.", placeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_place",
    description: "Retrieve one place by Foursquare place ID.",
    requiredScopes: [],
    inputSchema: getPlaceInputSchema,
    outputSchema: placeSchema,
  }),
  defineProviderAction(service, {
    name: "get_place_photos",
    description: "Retrieve photos for one Foursquare place.",
    requiredScopes: [],
    inputSchema: placePhotosInputSchema,
    outputSchema: s.requiredObject("The normalized Foursquare place photos response.", {
      photos: s.array("The normalized place photos.", photoSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_place_tips",
    description: "Retrieve tips for one Foursquare place.",
    requiredScopes: [],
    inputSchema: placeTipsInputSchema,
    outputSchema: s.requiredObject("The normalized Foursquare place tips response.", {
      tips: s.array("The normalized place tips.", tipSchema),
    }),
  }),
];
