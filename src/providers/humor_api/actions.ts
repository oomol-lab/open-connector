import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const rating = s.number("Minimum content rating from 0 to 10.", { minimum: 0, maximum: 10 });
const pagination = {
  offset: s.integer("Number of results to skip, from 0 to 1000.", { minimum: 0, maximum: 1000 }),
  number: s.integer("Number of results to return, from 0 to 10.", { minimum: 0, maximum: 10 }),
};
const jokeFilters = {
  "include-tags": s.string("Comma-separated tags that jokes should have."),
  "exclude-tags": s.string("Comma-separated tags that jokes must not have."),
  "min-rating": rating,
  "max-length": s.integer("Maximum joke length in letters."),
};
const memeFilters = {
  "keywords": s.string("Comma-separated words that must occur in the meme."),
  "keywords-in-image": s.boolean("Whether keywords must occur in the image."),
  "media-type": s.string("Media type such as image, video, jpg, png, or gif."),
  "min-rating": rating,
  "max-age-days": s.integer("Maximum meme age in days."),
};
const joke = s.looseObject("A joke returned by Humor API.", {
  id: s.integer("Joke identifier."),
  joke: s.string("Joke text."),
});
const meme = s.looseObject("A meme returned by Humor API.", {
  id: s.integer("Meme identifier."),
  url: s.string("URL of the meme media."),
  type: s.string("Media MIME type."),
});
export const humorApiActions: readonly ActionDefinition[] = [
  defineProviderAction("humor_api", {
    name: "search_jokes",
    description: "Search jokes by keywords, tags, rating, and length with offset pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Joke search parameters.",
      {
        keywords: s.string("Comma-separated words that must occur in the joke."),
        ...jokeFilters,
        ...pagination,
      },
      { optional: ["keywords", ...Object.keys(jokeFilters), ...Object.keys(pagination)] },
    ),
    outputSchema: s.looseObject("Joke search results.", {
      jokes: s.array("Matching jokes.", joke),
      available: s.integer("Total matching jokes available."),
    }),
  }),
  defineProviderAction("humor_api", {
    name: "random_joke",
    description: "Get a random joke filtered by tags, minimum rating, and maximum length.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("Random joke filters.", jokeFilters, {
      optional: Object.keys(jokeFilters),
    }),
    outputSchema: joke,
  }),
  defineProviderAction("humor_api", {
    name: "search_memes",
    description: "Search memes by keywords, media type, rating, and age with offset pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Meme search parameters.",
      { ...memeFilters, ...pagination },
      {
        optional: [...Object.keys(memeFilters), ...Object.keys(pagination)],
      },
    ),
    outputSchema: s.looseObject("Meme search results.", {
      memes: s.array("Matching memes.", meme),
      available: s.integer("Total matching memes available."),
    }),
  }),
  defineProviderAction("humor_api", {
    name: "random_meme",
    description: "Get a random meme filtered by keywords, media type, rating, and age.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("Random meme filters.", memeFilters, {
      optional: Object.keys(memeFilters),
    }),
    outputSchema: meme,
  }),
  defineProviderAction("humor_api", {
    name: "search_gifs",
    description: "Search reaction GIFs and return their URLs and dimensions.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "GIF search parameters.",
      {
        query: s.nonEmptyString("Search query."),
        number: pagination.number,
      },
      { optional: ["number"] },
    ),
    outputSchema: s.looseObject("GIF search results.", {
      images: s.array(
        "Matching GIF images.",
        s.looseObject("A GIF search result.", {
          url: s.string("GIF image URL."),
          width: s.integer("Image width in pixels."),
          height: s.integer("Image height in pixels."),
        }),
      ),
    }),
  }),
];
