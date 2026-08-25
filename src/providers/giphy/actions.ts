import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "giphy";

const optionalContextFields = {
  randomId: s.string("The random ID for personalization."),
  rating: s.string("The content rating filter."),
  countryCode: s.string("The two-letter country code.", { minLength: 2, maxLength: 2 }),
  region: s.nonEmptyString("The region code."),
};

const optionalContextFieldNames = ["randomId", "rating", "countryCode", "region"];
const optionalListFieldNames = ["limit", "offset", "bundle", "removeLowContrast"];

const paginationFields = {
  limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 50 }),
  offset: s.integer("The offset in the result set.", { minimum: 0 }),
};

const giphyUserSchema = s.looseObject(
  {
    avatar_url: s.string("The user avatar URL."),
    banner_url: s.nullableString("The user banner URL."),
    profile_url: s.string("The user profile URL."),
    username: s.string("The username."),
    display_name: s.string("The display name."),
    description: s.nullableString("The user description."),
    instagram_url: s.nullableString("The user Instagram URL."),
    website_url: s.nullableString("The user website URL."),
    is_verified: s.boolean("Whether the user is verified."),
  },
  { description: "A GIPHY user profile." },
);

const giphyImageVariantSchema = s.looseObject(
  {
    url: s.string("The image URL."),
    width: s.string("The image width in pixels."),
    height: s.string("The image height in pixels."),
    size: s.string("The file size in bytes."),
    mp4: s.string("The MP4 video URL."),
    mp4_size: s.string("The MP4 file size in bytes."),
    webp: s.string("The WebP image URL."),
    webp_size: s.string("The WebP file size in bytes."),
    frames: s.string("The number of frames."),
    hash: s.string("The image hash."),
  },
  { description: "A GIPHY image rendition variant." },
);

const giphyGifSchema = s.looseObject(
  {
    type: s.string("The object type."),
    id: s.nonEmptyString("The unique GIF identifier."),
    url: s.string("The GIF URL."),
    slug: s.string("The GIF slug."),
    bitly_gif_url: s.string("The Bitly-shortened GIF URL."),
    bitly_url: s.string("The Bitly-shortened URL."),
    embed_url: s.string("The embeddable GIF URL."),
    username: s.string("The uploader username."),
    source: s.string("The original source URL."),
    title: s.string("The GIF title."),
    rating: s.string("The content rating."),
    content_url: s.string("The content URL."),
    source_tld: s.string("The top-level domain of the source."),
    source_post_url: s.string("The source post URL."),
    alt_text: s.string("The alternative text."),
    is_sticker: s.integer("Whether the item is a sticker."),
    import_datetime: s.string("The import timestamp."),
    trending_datetime: s.string("The trending timestamp."),
    images: s.record(giphyImageVariantSchema, {
      description: "The image rendition variants keyed by name.",
    }),
    user: giphyUserSchema,
    analytics_response_payload: s.string("The analytics response payload."),
    analytics: s.looseObject("The analytics data."),
  },
  { description: "A GIPHY GIF object." },
);

const paginationSchema = s.object("The GIPHY pagination metadata.", {
  total_count: s.integer("The total number of results."),
  count: s.integer("The number of results in the current page."),
  offset: s.integer("The current offset in the result set."),
});

const tagSchema = s.object("A GIPHY search term.", {
  name: s.string("The tag or term name."),
});

const subcategorySchema = s.looseObject(
  {
    name: s.string("The subcategory name."),
    name_encoded: s.string("The URL-encoded subcategory name."),
    gif: giphyGifSchema,
  },
  { description: "A GIPHY content subcategory." },
);

const categorySchema = s.looseObject(
  {
    name: s.string("The category name."),
    name_encoded: s.string("The URL-encoded category name."),
    subcategories: s.array("The subcategories within this category.", subcategorySchema),
    gif: giphyGifSchema,
  },
  { description: "A GIPHY content category." },
);

const listGifOutputSchema = s.actionOutput(
  {
    gifs: s.array("The GIFs returned by GIPHY.", giphyGifSchema),
    pagination: paginationSchema,
  },
  "A GIPHY GIF list response.",
);

const listStickerOutputSchema = s.actionOutput(
  {
    stickers: s.array("The stickers returned by GIPHY.", giphyGifSchema),
    pagination: paginationSchema,
  },
  "A GIPHY sticker list response.",
);

function emptyInput(): JsonSchema {
  return s.object("The input payload for this action.", {});
}

function listInput(properties: Record<string, JsonSchema> = {}, optional: string[] = []): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      ...properties,
      ...paginationFields,
      bundle: s.string("The rendition bundle to include."),
      removeLowContrast: s.boolean("Whether to remove low-contrast results."),
      ...optionalContextFields,
    },
    { optional: [...optional, ...optionalListFieldNames, ...optionalContextFieldNames] },
  );
}

function randomInput(includeRandomId: boolean): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      tag: s.string("The optional tag filter."),
      rating: optionalContextFields.rating,
      countryCode: optionalContextFields.countryCode,
      region: optionalContextFields.region,
      randomId: optionalContextFields.randomId,
    },
    {
      optional: includeRandomId
        ? ["tag", "rating", "countryCode", "region", "randomId"]
        : ["tag", "rating", "countryCode", "region"],
    },
  );
}

export const giphyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_gifs",
    description: "Search GIPHY GIFs by query text.",
    requiredScopes: [],
    inputSchema: listInput(
      {
        query: s.nonEmptyString("The search query text."),
        lang: s.string("The language code for results."),
      },
      ["lang"],
    ),
    outputSchema: listGifOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_trending_gifs",
    description: "List trending GIPHY GIFs.",
    requiredScopes: [],
    inputSchema: listInput(),
    outputSchema: listGifOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_stickers",
    description: "Search GIPHY stickers by query text.",
    requiredScopes: [],
    inputSchema: listInput(
      {
        query: s.nonEmptyString("The search query text."),
        lang: s.string("The language code for results."),
      },
      ["lang"],
    ),
    outputSchema: listStickerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_trending_stickers",
    description: "List trending GIPHY stickers.",
    requiredScopes: [],
    inputSchema: listInput(),
    outputSchema: listStickerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "translate_gif",
    description: "Translate a phrase into a single best-match GIPHY GIF.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        query: s.nonEmptyString("The phrase to translate."),
        weirdness: s.integer("The weirdness factor for results.", { minimum: 0, maximum: 10 }),
        rating: optionalContextFields.rating,
        countryCode: optionalContextFields.countryCode,
        region: optionalContextFields.region,
      },
      { optional: ["weirdness", "rating", "countryCode", "region"] },
    ),
    outputSchema: giphyGifSchema,
  }),
  defineProviderAction(service, {
    name: "translate_sticker",
    description: "Translate a phrase into a single best-match GIPHY sticker.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        query: s.nonEmptyString("The phrase to translate."),
        rating: optionalContextFields.rating,
        countryCode: optionalContextFields.countryCode,
        region: optionalContextFields.region,
        randomId: optionalContextFields.randomId,
      },
      { optional: ["rating", "countryCode", "region", "randomId"] },
    ),
    outputSchema: giphyGifSchema,
  }),
  defineProviderAction(service, {
    name: "get_random_gif",
    description: "Fetch a random GIPHY GIF, optionally filtered by tag.",
    requiredScopes: [],
    inputSchema: randomInput(true),
    outputSchema: giphyGifSchema,
  }),
  defineProviderAction(service, {
    name: "get_random_sticker",
    description: "Fetch a random GIPHY sticker, optionally filtered by tag.",
    requiredScopes: [],
    inputSchema: randomInput(true),
    outputSchema: giphyGifSchema,
  }),
  defineProviderAction(service, {
    name: "get_gif",
    description: "Get a GIPHY GIF by GIF Object id. This is not the random_id value.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        gifId: s.nonEmptyString("The GIF ID to retrieve."),
        ...optionalContextFields,
      },
      { optional: optionalContextFieldNames },
    ),
    outputSchema: giphyGifSchema,
  }),
  defineProviderAction(service, {
    name: "list_gifs_by_ids",
    description: "Fetch multiple GIPHY GIFs by id.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        gifIds: s.stringArray("The list of GIF IDs to fetch.", {
          minItems: 1,
          itemDescription: "A GIF ID.",
        }),
        ...optionalContextFields,
      },
      { optional: optionalContextFieldNames },
    ),
    outputSchema: s.actionOutput(
      {
        gifs: s.array("The matching GIFs.", giphyGifSchema),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_tags",
    description: "Autocomplete GIPHY tags for a partial query.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        query: s.nonEmptyString("The partial search query."),
        ...paginationFields,
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.actionOutput(
      {
        tags: s.array("The matching tag suggestions.", tagSchema),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_trending_tags",
    description: "List trending search terms on GIPHY.",
    requiredScopes: [],
    inputSchema: emptyInput(),
    outputSchema: s.actionOutput(
      {
        tags: s.array("The list of trending tags.", s.string("A trending tag.")),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_related_tags",
    description: "List GIPHY tags related to a term.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for this action.", {
      term: s.nonEmptyString("The term to find related tags for."),
    }),
    outputSchema: s.actionOutput(
      {
        tags: s.array("The related tags.", tagSchema),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List GIPHY content categories.",
    requiredScopes: [],
    inputSchema: emptyInput(),
    outputSchema: s.actionOutput(
      {
        categories: s.array("The list of categories.", categorySchema),
        pagination: paginationSchema,
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_random_id",
    description: "Create a GIPHY random_id value for personalization across requests.",
    requiredScopes: [],
    inputSchema: emptyInput(),
    outputSchema: s.actionOutput(
      {
        randomId: s.string("The generated random ID for personalization."),
      },
      "The output payload for this action.",
    ),
  }),
];
