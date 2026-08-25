import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "freepik";

const resourceIdSchema = s.anyOf("The Freepik resource ID.", [
  s.nonEmptyString("The Freepik resource ID as a string."),
  s.integer("The Freepik resource ID as a number."),
]);
const flagSchema = (description: string): JsonSchema => s.integer(description, { minimum: 0, maximum: 1 });
const languageSchema = s.nonEmptyString(
  "Optional Accept-Language value such as en-US, used by Magnific for localized search processing.",
);
const rawObjectSchema = s.unknownObject("Raw object returned by the Magnific API.");

const searchFilterSchema = s.object(
  "Advanced Magnific resource filters mapped to the official filters deepObject query parameter. ids is incompatible with other filters.",
  {
    orientation: s.object(
      "Resource orientation flags. Set a value to 1 to enable the filter.",
      {
        landscape: flagSchema("Whether to include only landscape resources."),
        portrait: flagSchema("Whether to include only portrait resources."),
        square: flagSchema("Whether to include only square resources."),
        panoramic: flagSchema("Whether to include only panoramic resources."),
      },
      { optional: ["landscape", "portrait", "square", "panoramic"] },
    ),
    contentType: s.object(
      "Resource content type flags. Set a value to 1 to enable the filter.",
      {
        photo: flagSchema("Whether to include only photo resources."),
        psd: flagSchema("Whether to include only PSD resources."),
        vector: flagSchema("Whether to include only vector resources."),
      },
      { optional: ["photo", "psd", "vector"] },
    ),
    license: s.object(
      "Resource license flags. Set a value to 1 to enable the filter.",
      {
        freemium: flagSchema("Whether to include only freemium resources."),
        premium: flagSchema("Whether to include only premium resources."),
      },
      { optional: ["freemium", "premium"] },
    ),
    people: s.object(
      "People-related resource filters.",
      {
        include: flagSchema("Whether resources should include people."),
        exclude: flagSchema("Whether resources should exclude people."),
        number: s.stringEnum("The number of people shown in the resource.", ["1", "2", "3", "more_than_three"]),
        age: s.stringEnum("The age group of people shown in the resource.", [
          "infant",
          "child",
          "teen",
          "young-adult",
          "adult",
          "senior",
          "elder",
        ]),
        gender: s.stringEnum("The gender of people shown in the resource.", ["male", "female"]),
        ethnicity: s.stringEnum("The ethnicity of people shown in the resource.", [
          "south-asian",
          "middle-eastern",
          "east-asian",
          "black",
          "hispanic",
          "indian",
          "white",
          "multiracial",
          "southeast-asian",
        ]),
      },
      { optional: ["include", "exclude", "number", "age", "gender", "ethnicity"] },
    ),
    period: s.stringEnum("Filter by the period in which resources were added.", [
      "last-month",
      "last-quarter",
      "last-semester",
      "last-year",
    ]),
    color: s.stringEnum("Filter by the predominant resource color.", [
      "black",
      "blue",
      "gray",
      "green",
      "orange",
      "red",
      "white",
      "yellow",
      "purple",
      "cyan",
      "pink",
    ]),
    author: s.number("Filter resources by a specific author ID."),
    aiGenerated: s.object(
      "AI-generated resource filters mapped to the upstream ai-generated filter.",
      {
        excluded: flagSchema("Whether to exclude AI-generated resources."),
        only: flagSchema("Whether to include only AI-generated resources."),
      },
      { optional: ["excluded", "only"] },
    ),
    vector: s.object(
      "Vector-specific filters.",
      {
        type: s.stringEnum("Vector file type.", ["jpg", "ai", "eps", "svg"]),
        style: s.stringEnum("Vector style type.", [
          "watercolor",
          "flat",
          "cartoon",
          "geometric",
          "gradient",
          "isometric",
          "3d",
          "hand-drawn",
        ]),
      },
      { optional: ["type", "style"] },
    ),
    psd: s.object(
      "PSD-specific filters.",
      {
        type: s.stringEnum("PSD file type.", ["jpg", "psd"]),
      },
      { optional: ["type"] },
    ),
    ids: s.nonEmptyString("Comma-separated resource IDs. This upstream filter is incompatible with other filters."),
  },
  {
    optional: [
      "orientation",
      "contentType",
      "license",
      "people",
      "period",
      "color",
      "author",
      "aiGenerated",
      "vector",
      "psd",
      "ids",
    ],
  },
);

const resourceFormatSchema = s.stringEnum("The requested resource download format.", [
  "psd",
  "ai",
  "eps",
  "atn",
  "fonts",
  "resources",
  "png",
  "jpg",
  "3d-render",
  "svg",
  "mockup",
]);

const searchResourcesOutputSchema = s.object("A page of Magnific stock resources.", {
  resources: s.array("Resources returned by Magnific.", rawObjectSchema),
  meta: rawObjectSchema,
  raw: rawObjectSchema,
});

const getResourceOutputSchema = s.object("A Magnific resource detail response.", {
  resource: rawObjectSchema,
  raw: rawObjectSchema,
});

const downloadResourceOutputSchema = s.object("A Magnific resource download response.", {
  filename: s.nonEmptyString("The downloaded file name returned by Magnific."),
  url: s.url("The CDN URL for downloading the resource."),
  signedUrl: s.nullable(s.url("The signed preview URL returned by Magnific when available.")),
  prompt: s.nullableString("The prompt used to create the AI resource when returned by Magnific."),
  raw: rawObjectSchema,
});

export const freepikActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_resources",
    description: "Search Magnific stock images and templates through the resources API.",
    inputSchema: s.object(
      "Input parameters for searching Magnific stock resources.",
      {
        page: s.integer("Page number. The official API requires 1 through 100.", {
          minimum: 1,
          maximum: 100,
        }),
        limit: s.positiveInteger("Maximum number of resources to return. The official API requires > 0."),
        order: s.stringEnum("Sort order for search results.", ["relevance", "recent"]),
        term: s.nonEmptyString("Search term used to find resources."),
        acceptLanguage: languageSchema,
        filters: searchFilterSchema,
      },
      { optional: ["page", "limit", "order", "term", "acceptLanguage", "filters"] },
    ),
    outputSchema: searchResourcesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_resource",
    description: "Get detailed metadata for a Magnific stock resource by ID.",
    inputSchema: s.object(
      "Input parameters for retrieving a Magnific resource.",
      {
        resourceId: resourceIdSchema,
        acceptLanguage: languageSchema,
      },
      { optional: ["acceptLanguage"] },
    ),
    outputSchema: getResourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "download_resource",
    description: "Create a Magnific stock resource download URL through the resources API.",
    inputSchema: s.object(
      "Input parameters for downloading a Magnific resource. format and imageSize cannot be used together.",
      {
        resourceId: resourceIdSchema,
        format: resourceFormatSchema,
        imageSize: s.nonEmptyString(
          "Optional photo resize value for the generic download endpoint, such as small, medium, large, original, or a pixel value like 2000px.",
        ),
        acceptLanguage: languageSchema,
      },
      { optional: ["format", "imageSize", "acceptLanguage"] },
    ),
    outputSchema: downloadResourceOutputSchema,
  }),
];
