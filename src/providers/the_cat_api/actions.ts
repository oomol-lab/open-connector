import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "the_cat_api" as const;

const trimmedString = (description: string) => s.nonEmptyString(description);

const imageIdSchema = trimmedString("The Cat API image identifier.");
const breedIdSchema = trimmedString("The Cat API breed identifier.");
const breedQuerySchema = trimmedString("The breed name search query.");

const imageSizeSchema = s.stringEnum("The image size preset requested from The Cat API.", ["small", "med", "full"]);

const imageFormatSchema = s.stringEnum("The response format requested from The Cat API.", ["json", "src"]);

const imageMimeTypesSchema = s.string(
  "Comma-separated MIME type filters accepted by The Cat API, such as jpg,png or gif.",
  { minLength: 1 },
);

const orderSchema = s.stringEnum("The Cat API result order.", ["RANDOM", "ASC", "DESC"]);

const breedSchema = s.looseObject("A cat breed object returned by The Cat API.", {
  id: s.string("The breed identifier."),
  name: s.string("The breed display name."),
  temperament: s.string("The breed temperament summary."),
  origin: s.string("The breed origin country or region."),
  description: s.string("The breed description."),
});

const categorySchema = s.looseObject("An image category object returned by The Cat API.", {
  id: s.integer("The category identifier."),
  name: s.string("The category display name."),
});

const imageSchema = s.object("A normalized cat image returned by The Cat API.", {
  id: s.string("The image identifier."),
  url: s.string("The image URL."),
  width: s.nullable(s.integer("The image width in pixels when returned.")),
  height: s.nullable(s.integer("The image height in pixels when returned.")),
  breeds: s.array("The breeds associated with this image.", breedSchema),
  categories: s.array("The categories associated with this image.", categorySchema),
  raw: s.looseObject("The raw image object returned by The Cat API."),
});

const searchImagesInputSchema = s.object(
  "Input parameters for searching The Cat API images.",
  {
    limit: s.integer("The number of images to return.", { minimum: 1, maximum: 25 }),
    page: s.nonNegativeInteger("The zero-based result page number."),
    order: orderSchema,
    size: imageSizeSchema,
    mimeTypes: imageMimeTypesSchema,
    hasBreeds: s.boolean("Whether to only return images that have breed information attached."),
    breedIds: s.string("Comma-separated breed identifiers used to filter image results.", {
      minLength: 1,
    }),
    categoryIds: s.string("Comma-separated category identifiers used to filter image results.", {
      minLength: 1,
    }),
    includeBreeds: s.boolean("Whether The Cat API should include breed objects in image results."),
    includeCategories: s.boolean("Whether The Cat API should include category objects in image results."),
    format: imageFormatSchema,
  },
  {
    optional: [
      "limit",
      "page",
      "order",
      "size",
      "mimeTypes",
      "hasBreeds",
      "breedIds",
      "categoryIds",
      "includeBreeds",
      "includeCategories",
      "format",
    ],
  },
);

const searchImagesOutputSchema = s.object("The response returned when searching cat images.", {
  images: s.array("The cat images returned by The Cat API.", imageSchema),
});

const getImageInputSchema = s.object("Input parameters for reading one cat image.", {
  imageId: imageIdSchema,
});

const getImageOutputSchema = s.object("The response returned when reading one cat image.", {
  image: imageSchema,
});

const listBreedsInputSchema = s.object(
  "Input parameters for listing cat breeds.",
  {
    limit: s.integer("The number of breeds to return.", { minimum: 1, maximum: 100 }),
    page: s.nonNegativeInteger("The zero-based result page number."),
  },
  { optional: ["limit", "page"] },
);

const listBreedsOutputSchema = s.object("The response returned when listing cat breeds.", {
  breeds: s.array("The cat breeds returned by The Cat API.", breedSchema),
});

const searchBreedsInputSchema = s.object("Input parameters for searching cat breeds.", {
  query: breedQuerySchema,
});

const searchBreedsOutputSchema = s.object("The response returned when searching cat breeds.", {
  breeds: s.array("The matching cat breeds returned by The Cat API.", breedSchema),
});

const getBreedInputSchema = s.object("Input parameters for reading one cat breed.", {
  breedId: breedIdSchema,
});

const getBreedOutputSchema = s.object("The response returned when reading one cat breed.", {
  breed: breedSchema,
});

function defineAction(
  input: Omit<Parameters<typeof defineProviderAction>[1], "name"> & { service?: string; name: string },
): ActionDefinition {
  const { service: _service, ...action } = input;
  return defineProviderAction(service, action);
}

export const theCatApiActions: ActionDefinition[] = [
  defineAction({
    service,
    name: "search_images",
    description: "Search for cat images with optional breed, category, type, size, and paging filters.",
    requiredScopes: [],
    inputSchema: searchImagesInputSchema,
    outputSchema: searchImagesOutputSchema,
  }),
  defineAction({
    service,
    name: "get_image",
    description: "Get one cat image by its The Cat API image identifier.",
    requiredScopes: [],
    inputSchema: getImageInputSchema,
    outputSchema: getImageOutputSchema,
  }),
  defineAction({
    service,
    name: "list_breeds",
    description: "List cat breeds supported by The Cat API.",
    requiredScopes: [],
    inputSchema: listBreedsInputSchema,
    outputSchema: listBreedsOutputSchema,
  }),
  defineAction({
    service,
    name: "search_breeds",
    description: "Search cat breeds by breed name.",
    requiredScopes: [],
    inputSchema: searchBreedsInputSchema,
    outputSchema: searchBreedsOutputSchema,
  }),
  defineAction({
    service,
    name: "get_breed",
    description: "Get one cat breed by its The Cat API breed identifier.",
    requiredScopes: [],
    inputSchema: getBreedInputSchema,
    outputSchema: getBreedOutputSchema,
  }),
];
