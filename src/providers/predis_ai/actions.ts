import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "predis_ai";

const mediaTypes = ["single_image", "carousel", "video"];
const postTypes = ["generic", "meme", "quotes"];
const modelVersions = ["2", "4"];
const videoDurations = ["short", "long"];
const colorPaletteTypes = ["brand", "ai_suggested"];
const aspectRatios = ["square", "portrait", "landscape", "all"];
const supportedLanguages = [
  "malay",
  "chinese (traditional)",
  "croatian",
  "english",
  "dutch",
  "indonesian",
  "vietnamese",
  "portuguese_br",
  "finnish",
  "french",
  "german",
  "italian",
  "norwegian",
  "polish",
  "romanian",
  "czech",
  "spanish",
  "swedish",
  "turkish",
  "danish",
  "hungarian",
];

const rawObjectSchema = s.looseObject("The raw Predis.ai object for forward-compatible fields.");
const errorSchema = s.looseObject("A Predis.ai error object returned by the API.");
const brandIdSchema = s.nonEmptyString("The Predis.ai brand ID to use for the request.");
const paginationInputFields = {
  pageNumber: s.positiveInteger("The one-based page number to request."),
  itemsPerPage: s.positiveInteger("The number of items to request per page.", { maximum: 20 }),
};
const mediaTypeSchema = s.stringEnum("The Predis.ai media type to filter or generate.", mediaTypes);
const postTypeSchema = s.stringEnum("The Predis.ai post type to filter or generate.", postTypes);

const listTemplatesInputSchema = s.object(
  "Input for listing Predis.ai system and brand templates.",
  {
    brandId: brandIdSchema,
    mediaType: mediaTypeSchema,
    postType: postTypeSchema,
    aspectRatio: s.stringEnum("The template aspect ratio to filter by.", aspectRatios),
    ...paginationInputFields,
  },
  { optional: ["mediaType", "postType", "aspectRatio", "pageNumber", "itemsPerPage"] },
);

const listPostsInputSchema = s.object(
  "Input for listing generated Predis.ai posts.",
  {
    brandId: brandIdSchema,
    mediaType: mediaTypeSchema,
    ...paginationInputFields,
  },
  { optional: ["mediaType", "pageNumber", "itemsPerPage"] },
);

const createContentInputSchema = {
  ...s.object(
    "Input for creating Predis.ai content.",
    {
      brandId: brandIdSchema,
      text: s.string("The topic for the post. Predis.ai recommends at least 20 characters and at least 3 words.", {
        minLength: 20,
      }),
      postType: postTypeSchema,
      modelVersion: s.stringEnum("The Predis.ai model version to use.", modelVersions),
      postsCount: s.integer("The number of posts to generate in a single request.", {
        minimum: 1,
        maximum: 10,
      }),
      inputLanguage: s.stringEnum("The language of the input text.", supportedLanguages),
      outputLanguage: s.stringEnum("The language to generate the post in.", supportedLanguages),
      mediaType: mediaTypeSchema,
      videoDuration: s.stringEnum("The video duration when generating video content.", videoDurations),
      templateIds: s.array("Specific Predis.ai template IDs to use.", s.nonEmptyString("A template ID.")),
      author: s.nonEmptyString("The quote author when generating quote posts."),
      mediaUrls: s.array(
        "Image or video URLs that Predis.ai should use in the generated post.",
        s.url("A publicly reachable media URL."),
      ),
      colorPaletteType: s.stringEnum("The color palette source Predis.ai should use.", colorPaletteTypes),
      brandDetails: s.looseObject("Brand details to guide Predis.ai generation."),
      headlines: s.array(
        "Headlines or text overrides for generated creatives.",
        s.unknown("A Predis.ai headline override item."),
      ),
    },
    {
      optional: [
        "postType",
        "modelVersion",
        "postsCount",
        "inputLanguage",
        "outputLanguage",
        "mediaType",
        "videoDuration",
        "templateIds",
        "author",
        "mediaUrls",
        "colorPaletteType",
        "brandDetails",
        "headlines",
      ],
    },
  ),
  anyOf: [{ required: ["mediaType"] }, { required: ["templateIds"] }],
} satisfies JsonSchema;

const templateSchema = s.requiredObject("A normalized Predis.ai template.", {
  templateId: s.nullableString("The Predis.ai template ID."),
  mediaType: s.nullableString("The media type returned for the template."),
  raw: rawObjectSchema,
});
const postSchema = s.requiredObject("A normalized Predis.ai generated post.", {
  postId: s.nullableString("The Predis.ai post ID."),
  urls: s.array("Generated media URLs for the post.", s.string("A generated media URL.")),
  caption: s.nullableString("The generated post caption."),
  mediaType: s.nullableString("The media type returned for the post."),
  raw: rawObjectSchema,
});
const listTemplatesOutputSchema = s.requiredObject("The Predis.ai templates response.", {
  templates: s.array("Predis.ai templates.", templateSchema),
  totalPages: s.nullable(s.integer("The total number of pages returned by Predis.ai.")),
  errors: s.array("Predis.ai errors returned with the response.", errorSchema),
  raw: rawObjectSchema,
});
const listPostsOutputSchema = s.requiredObject("The Predis.ai posts response.", {
  posts: s.array("Generated Predis.ai posts.", postSchema),
  totalPages: s.nullable(s.integer("The total number of pages returned by Predis.ai.")),
  errors: s.array("Predis.ai errors returned with the response.", errorSchema),
  raw: rawObjectSchema,
});
const createContentOutputSchema = s.requiredObject("The Predis.ai create content response.", {
  postIds: s.array("Predis.ai post IDs submitted for generation.", s.string("A Predis.ai post ID.")),
  postStatus: s.nullableString("The immediate Predis.ai generation status."),
  errors: s.array("Predis.ai errors returned with the response.", errorSchema),
  raw: rawObjectSchema,
});

export const predisAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description:
      "List Predis.ai system templates and the brand's custom templates with optional media, post type, aspect ratio, and pagination filters.",
    requiredScopes: [],
    inputSchema: listTemplatesInputSchema,
    outputSchema: listTemplatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_posts",
    operationType: "read",
    description: "List generated Predis.ai posts for a brand with optional media type and pagination filters.",
    requiredScopes: [],
    inputSchema: listPostsInputSchema,
    outputSchema: listPostsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_content",
    operationType: "write",
    description:
      "Submit a Predis.ai content generation request and return the created post IDs and immediate generation status.",
    requiredScopes: [],
    inputSchema: createContentInputSchema,
    outputSchema: createContentOutputSchema,
  }),
];
