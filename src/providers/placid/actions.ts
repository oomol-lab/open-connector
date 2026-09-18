import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "placid";

const layerSchema = s.looseRequiredObject("One dynamic template layer returned by Placid.", {
  name: s.nonEmptyString("The layer name used when filling data into the template."),
  type: s.nonEmptyString("The dynamic layer type returned by Placid."),
});

const templateSchema = s.looseRequiredObject(
  "One Placid template summary.",
  {
    uuid: s.nonEmptyString("The Placid template UUID."),
    title: s.nonEmptyString("The template title."),
    thumbnail: s.nullable(s.url("The thumbnail URL when Placid has generated one.")),
    tags: s.stringArray("The tags assigned to the template."),
    layers: s.array("The dynamic layers available on the template.", layerSchema),
    raw: s.looseObject("The raw template object returned by Placid."),
  },
  { optional: ["thumbnail", "tags", "layers", "raw"] },
);

const imageSchema = s.looseRequiredObject(
  "One Placid image generation object.",
  {
    id: s.positiveInteger("The unique Placid image identifier."),
    status: s.stringEnum("The current Placid image generation status.", ["queued", "finished", "error"]),
    image_url: s.nullable(s.url("The generated image URL when the render has finished.")),
    polling_url: s.nullable(s.url("The Placid polling URL for retrieving the image status.")),
    raw: s.looseObject("The raw image object returned by Placid."),
  },
  { optional: ["image_url", "polling_url", "raw"] },
);

const paginationLinksSchema = s.actionOutput({
  first: s.nullable(s.url("The first page URL when Placid returns one.")),
  last: s.nullable(s.url("The last page URL when Placid returns one.")),
  prev: s.nullable(s.url("The previous page URL when Placid returns one.")),
  next: s.nullable(s.url("The next page URL when Placid returns one.")),
});

const templateListMetaSchema = s.looseRequiredObject(
  "The pagination metadata returned by the Placid template list endpoint.",
  {
    path: s.nullable(s.url("The API path echoed by Placid when available.")),
    per_page: s.nullableInteger("The number of templates included per page when Placid returns it."),
    raw: s.looseObject("The raw pagination metadata returned by Placid."),
  },
  { optional: ["path", "per_page", "raw"] },
);

const imageModificationsSchema = s.object(
  "Optional export modifications for the generated image.",
  {
    width: s.positiveInteger("The requested output width in pixels."),
    height: s.positiveInteger("The requested output height in pixels."),
    filename: s.nonEmptyString("The output filename to use for the generated image."),
    image_format: s.stringEnum("The output image format.", ["auto", "jpg", "png", "webp"]),
    dpi: s.integer("The output DPI used by Placid when supported."),
    color_mode: s.stringEnum("The output color mode.", ["rgb", "cmyk"]),
  },
  { optional: ["width", "height", "filename", "image_format", "dpi", "color_mode"] },
);

const imageTransferSchema = s.looseRequiredObject(
  "Optional transfer settings used to copy the generated image into external storage.",
  {
    to: s.nonEmptyString("The transfer target type such as `s3`."),
    key: s.nonEmptyString("The storage access key."),
    secret: s.nonEmptyString("The storage secret key."),
    region: s.nonEmptyString("The storage region."),
    bucket: s.nonEmptyString("The destination bucket name."),
    visibility: s.stringEnum("The transferred object visibility.", ["public", "private"]),
    path: s.nonEmptyString("The destination file path including filename."),
    endpoint: s.url("The custom storage endpoint URL when one is required."),
    token: s.nonEmptyString("The optional temporary security token."),
  },
  { optional: ["to", "key", "secret", "region", "bucket", "visibility", "path", "endpoint", "token"] },
);

export const placidActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description:
      "List Placid templates for the connected project with optional collection, title, tag, ordering, or next-page URL filters.",
    inputSchema: s.actionInput({
      collection_id: s.nonEmptyString("Optional collection UUID used to filter templates."),
      title_filter: s.nonEmptyString("Optional title filter applied by Placid."),
      tag: s.nonEmptyString("Optional tag filter applied by Placid."),
      order_by: s.nonEmptyString("Optional sort string such as `created_at-asc`, `updated_at-desc`, or `title-asc`."),
      page_url: s.url(
        "Optional pagination URL previously returned by Placid links; when provided it overrides the base list path.",
      ),
    }),
    outputSchema: s.actionOutput({
      templates: s.array("The templates returned by Placid.", templateSchema),
      links: paginationLinksSchema,
      meta: templateListMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    operationType: "read",
    description:
      "Get one Placid template by UUID and return its dynamic layer metadata for downstream image generation.",
    inputSchema: s.actionInput({ template_uuid: s.nonEmptyString("The Placid template UUID to retrieve.") }, [
      "template_uuid",
    ]),
    outputSchema: s.actionOutput({ template: templateSchema }),
  }),
  defineProviderAction(service, {
    name: "create_image",
    operationType: "write",
    description:
      "Queue one Placid image generation request from a template UUID and dynamic layer payload, then return the image handle for polling.",
    inputSchema: s.actionInput(
      {
        template_uuid: s.nonEmptyString("The Placid template UUID to render."),
        webhook_success: s.url("Optional webhook URL that Placid should call after the image is generated."),
        create_now: s.boolean("Whether Placid should try to render the image immediately instead of queueing it."),
        passthrough: s.union([
          s.string("A string passthrough value."),
          s.array(s.unknown("One passthrough item.")),
          s.looseObject("An object passthrough value."),
        ]),
        errors: s.stringArray("Optional error handling flags forwarded to Placid."),
        layers: s.looseObject("The dynamic layer values keyed by template layer name and forwarded to Placid as-is."),
        modifications: imageModificationsSchema,
        transfer: imageTransferSchema,
      },
      ["template_uuid"],
    ),
    outputSchema: s.actionOutput({ image: imageSchema }),
    asyncLifecycle: { startActionId: "placid.create_image", statusActionId: "placid.get_image" },
  }),
  defineProviderAction(service, {
    name: "get_image",
    operationType: "read",
    description:
      "Get the current Placid image generation status for one image identifier and return the finished image URL when available.",
    inputSchema: s.actionInput(
      { image_id: s.positiveInteger("The Placid image identifier returned by create_image.") },
      ["image_id"],
    ),
    outputSchema: s.actionOutput({ image: imageSchema }),
    asyncLifecycle: { startActionId: "placid.create_image", statusActionId: "placid.get_image" },
  }),
  defineProviderAction(service, {
    name: "delete_image",
    operationType: "destructive",
    description: "Delete one Placid image request by identifier and return whether the delete succeeded.",
    inputSchema: s.actionInput({ image_id: s.positiveInteger("The Placid image identifier to delete.") }, ["image_id"]),
    outputSchema: s.actionOutput({ deleted: s.boolean("Whether the delete succeeded.") }),
  }),
];
