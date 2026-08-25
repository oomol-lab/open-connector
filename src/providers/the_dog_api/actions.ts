import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "the_dog_api" as const;

const trimmedString = (description: string) => s.string(description, { minLength: 1 });

const imageIdSchema = trimmedString("The Dog API image identifier.");
const breedIdSchema = trimmedString("The Dog API breed identifier.");
const breedQuerySchema = trimmedString("The breed name search query.");
const favouriteIdSchema = trimmedString("The Dog API favourite identifier.");
const voteIdSchema = trimmedString("The Dog API vote identifier.");
const subIdSchema = trimmedString("A custom user identifier stored by The Dog API.");

const imageSizeSchema = s.stringEnum("The image size preset requested from The Dog API.", ["small", "med", "full"]);

const imageFormatSchema = s.stringEnum("The response format requested from The Dog API.", ["json", "src"]);

const imageMimeTypesSchema = s.string(
  "Comma-separated MIME type filters accepted by The Dog API, such as jpg,png or gif.",
  { minLength: 1 },
);

const orderSchema = s.stringEnum("The Dog API result order.", ["RANDOM", "ASC", "DESC"]);

const breedSchema = s.looseObject("A dog breed object returned by The Dog API.", {
  id: s.string("The breed identifier."),
  name: s.string("The breed display name."),
  temperament: s.string("The breed temperament summary."),
  origin: s.string("The breed origin country or region."),
  description: s.string("The breed description."),
});

const categorySchema = s.looseObject("An image category object returned by The Dog API.", {
  id: s.string("The category identifier."),
  name: s.string("The category display name."),
});

const imageSchema = s.object("A normalized dog image returned by The Dog API.", {
  id: s.string("The image identifier."),
  url: s.string("The image URL."),
  width: s.nullable(s.integer("The image width in pixels when returned.")),
  height: s.nullable(s.integer("The image height in pixels when returned.")),
  breeds: s.array("The breeds associated with this image.", breedSchema),
  categories: s.array("The categories associated with this image.", categorySchema),
  raw: s.looseObject("The raw image object returned by The Dog API."),
});

const favouriteSchema = s.looseObject("A favourite image record returned by The Dog API.", {
  id: s.integer("The favourite identifier."),
  image_id: s.string("The favourited image identifier."),
  sub_id: s.string("The custom user identifier attached to the favourite."),
});

const voteSchema = s.looseObject("A vote record returned by The Dog API.", {
  id: s.integer("The vote identifier."),
  image_id: s.string("The voted image identifier."),
  sub_id: s.string("The custom user identifier attached to the vote."),
  value: s.integer("The vote value."),
});

const mutationResultSchema = s.looseObject("A mutation response returned by The Dog API.", {
  id: s.integer("The created resource identifier when returned."),
  message: s.string("The provider mutation status message when returned."),
});

const searchImagesInputSchema = s.object(
  "Input parameters for searching The Dog API images.",
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
    includeBreeds: s.boolean("Whether The Dog API should include breed objects in image results."),
    includeCategories: s.boolean("Whether The Dog API should include category objects in image results."),
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

const searchImagesOutputSchema = s.object("The response returned when searching dog images.", {
  images: s.array("The dog images returned by The Dog API.", imageSchema),
});

const getImageInputSchema = s.object("Input parameters for reading one dog image.", {
  imageId: imageIdSchema,
});

const getImageOutputSchema = s.object("The response returned when reading one dog image.", {
  image: imageSchema,
});

const listBreedsInputSchema = s.object(
  "Input parameters for listing dog breeds.",
  {
    limit: s.integer("The number of breeds to return.", { minimum: 1, maximum: 100 }),
    page: s.nonNegativeInteger("The zero-based result page number."),
  },
  { optional: ["limit", "page"] },
);

const listBreedsOutputSchema = s.object("The response returned when listing dog breeds.", {
  breeds: s.array("The dog breeds returned by The Dog API.", breedSchema),
});

const searchBreedsInputSchema = s.object("Input parameters for searching dog breeds.", {
  query: breedQuerySchema,
});

const searchBreedsOutputSchema = s.object("The response returned when searching dog breeds.", {
  breeds: s.array("The matching dog breeds returned by The Dog API.", breedSchema),
});

const getBreedInputSchema = s.object("Input parameters for reading one dog breed.", {
  breedId: breedIdSchema,
});

const getBreedOutputSchema = s.object("The response returned when reading one dog breed.", {
  breed: breedSchema,
});

const listAccountRecordsInputSchema = s.object(
  "Input parameters for listing account records.",
  {
    limit: s.integer("The number of records to return.", { minimum: 1, maximum: 100 }),
    page: s.nonNegativeInteger("The zero-based result page number."),
    subId: subIdSchema,
  },
  { optional: ["limit", "page", "subId"] },
);

const listFavouritesOutputSchema = s.object("The response returned when listing favourites.", {
  favourites: s.array("The favourite records returned by The Dog API.", favouriteSchema),
});

const createFavouriteInputSchema = s.object(
  "Input parameters for creating one favourite.",
  {
    imageId: imageIdSchema,
    subId: subIdSchema,
  },
  { optional: ["subId"] },
);

const mutationResultOutputSchema = s.object("The response returned for a mutation request.", {
  result: mutationResultSchema,
});

const deleteFavouriteInputSchema = s.object("Input parameters for deleting one favourite.", {
  favouriteId: favouriteIdSchema,
});

const listVotesOutputSchema = s.object("The response returned when listing votes.", {
  votes: s.array("The vote records returned by The Dog API.", voteSchema),
});

const createVoteInputSchema = s.object(
  "Input parameters for creating one vote.",
  {
    imageId: imageIdSchema,
    value: s.integer("The vote value accepted by The Dog API, where 1 is upvote and -1 is downvote.", {
      minimum: -1,
      maximum: 1,
    }),
    subId: subIdSchema,
  },
  { optional: ["subId"] },
);

const deleteVoteInputSchema = s.object("Input parameters for deleting one vote.", {
  voteId: voteIdSchema,
});

export const theDogApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_images",
    description: "Search for dog images with optional breed, category, type, size, and paging filters.",
    requiredScopes: [],
    inputSchema: searchImagesInputSchema,
    outputSchema: searchImagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_image",
    description: "Get one dog image by its The Dog API image identifier.",
    requiredScopes: [],
    inputSchema: getImageInputSchema,
    outputSchema: getImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_breeds",
    description: "List dog breeds supported by The Dog API.",
    requiredScopes: [],
    inputSchema: listBreedsInputSchema,
    outputSchema: listBreedsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_breeds",
    description: "Search dog breeds by breed name.",
    requiredScopes: [],
    inputSchema: searchBreedsInputSchema,
    outputSchema: searchBreedsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_breed",
    description: "Get one dog breed by its The Dog API breed identifier.",
    requiredScopes: [],
    inputSchema: getBreedInputSchema,
    outputSchema: getBreedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_favourites",
    description: "List favourite dog images for the connected The Dog API account.",
    requiredScopes: [],
    inputSchema: listAccountRecordsInputSchema,
    outputSchema: listFavouritesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_favourite",
    description: "Create one favourite dog image record.",
    requiredScopes: [],
    inputSchema: createFavouriteInputSchema,
    outputSchema: mutationResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_favourite",
    description: "Delete one favourite dog image record.",
    requiredScopes: [],
    inputSchema: deleteFavouriteInputSchema,
    outputSchema: mutationResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_votes",
    description: "List dog image votes for the connected The Dog API account.",
    requiredScopes: [],
    inputSchema: listAccountRecordsInputSchema,
    outputSchema: listVotesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_vote",
    description: "Create one dog image vote.",
    requiredScopes: [],
    inputSchema: createVoteInputSchema,
    outputSchema: mutationResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_vote",
    description: "Delete one dog image vote.",
    requiredScopes: [],
    inputSchema: deleteVoteInputSchema,
    outputSchema: mutationResultOutputSchema,
  }),
];
