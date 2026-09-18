import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "logo_dev";

const imageFormatSchema = s.stringEnum("The requested output image format.", ["jpg", "png", "webp"]);
const imageThemeSchema = s.stringEnum("The logo theme to request from Logo.dev.", ["auto", "light", "dark"]);
const imageFallbackSchema = s.stringEnum("The fallback behavior when the brand logo is unavailable.", [
  "monogram",
  "404",
]);

const imageOptionsShape: Record<string, JsonSchema> = {
  token: s.nonEmptyString("The publishable Logo.dev token used to build the image URL."),
  size: s.positiveInteger("The requested logo size in pixels."),
  format: imageFormatSchema,
  theme: imageThemeSchema,
  greyscale: s.boolean("Whether the logo should be rendered in greyscale."),
  retina: s.boolean("Whether to request a retina-quality image variant."),
  fallback: imageFallbackSchema,
};

const imageOptionsOptional = ["size", "format", "theme", "greyscale", "retina", "fallback"];

const imageRequestSchema = s.object("The normalized image request options.", imageOptionsShape, {
  required: ["token"],
  optional: imageOptionsOptional,
});

const imageLookupOutputSchema = s.object("The normalized output payload for a Logo.dev image lookup.", {
  lookupType: s.stringEnum("The identifier type used to build the logo URL.", [
    "domain",
    "name",
    "ticker",
    "crypto",
    "isin",
  ]),
  lookupValue: s.string("The original identifier value used for the lookup."),
  logoUrl: s.url("The fully qualified Logo.dev image URL."),
  requested: imageRequestSchema,
});

const imageLookupDescription =
  "Return a ready-to-use Logo.dev image URL using the requested identifier and image options.";

const brandSchema = s.object(
  "One matching brand candidate.",
  {
    name: s.string("The brand name."),
    domain: s.string("The primary brand domain."),
    logoUrl: s.url("The ready-to-use Logo.dev image URL."),
  },
  { optional: ["logoUrl"] },
);

export type LogoDevActionName =
  | "get_logo_by_domain"
  | "get_logo_by_name"
  | "get_logo_by_ticker"
  | "get_logo_by_crypto"
  | "get_logo_by_isin"
  | "search_brands"
  | "describe_brand";

export const logoDevActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_logo_by_domain",
    operationType: "read",
    description: "Build a Logo.dev image URL for a company domain.",
    inputSchema: s.object(
      "The input payload for building a logo URL from a domain.",
      {
        domain: s.nonEmptyString("The company domain to look up, for example openai.com."),
        ...imageOptionsShape,
      },
      { required: ["domain", "token"], optional: imageOptionsOptional },
    ),
    outputSchema: { ...imageLookupOutputSchema, description: imageLookupDescription },
  }),
  defineProviderAction(service, {
    name: "get_logo_by_name",
    operationType: "read",
    description: "Build a Logo.dev image URL for a brand name.",
    inputSchema: s.object(
      "The input payload for building a logo URL from a brand name.",
      {
        brandName: s.nonEmptyString("The brand name to look up."),
        ...imageOptionsShape,
      },
      { required: ["brandName", "token"], optional: imageOptionsOptional },
    ),
    outputSchema: { ...imageLookupOutputSchema, description: imageLookupDescription },
  }),
  defineProviderAction(service, {
    name: "get_logo_by_ticker",
    operationType: "read",
    description: "Build a Logo.dev image URL for a stock ticker.",
    inputSchema: s.object(
      "The input payload for building a logo URL from a stock ticker.",
      {
        ticker: s.nonEmptyString("The stock ticker symbol to look up."),
        ...imageOptionsShape,
      },
      { required: ["ticker", "token"], optional: imageOptionsOptional },
    ),
    outputSchema: { ...imageLookupOutputSchema, description: imageLookupDescription },
  }),
  defineProviderAction(service, {
    name: "get_logo_by_crypto",
    operationType: "read",
    description: "Build a Logo.dev image URL for a crypto symbol.",
    inputSchema: s.object(
      "The input payload for building a logo URL from a crypto symbol.",
      {
        symbol: s.nonEmptyString("The crypto symbol to look up."),
        ...imageOptionsShape,
      },
      { required: ["symbol", "token"], optional: imageOptionsOptional },
    ),
    outputSchema: { ...imageLookupOutputSchema, description: imageLookupDescription },
  }),
  defineProviderAction(service, {
    name: "get_logo_by_isin",
    operationType: "read",
    description: "Build a Logo.dev image URL for an ISIN identifier.",
    inputSchema: s.object(
      "The input payload for building a logo URL from an ISIN identifier.",
      {
        isin: s.nonEmptyString("The ISIN identifier to look up."),
        ...imageOptionsShape,
      },
      { required: ["isin", "token"], optional: imageOptionsOptional },
    ),
    outputSchema: { ...imageLookupOutputSchema, description: imageLookupDescription },
  }),
  defineProviderAction(service, {
    name: "search_brands",
    operationType: "read",
    description: "Search Logo.dev brands by query text and return candidate brands.",
    inputSchema: s.object(
      "The input payload for searching brands.",
      {
        query: s.nonEmptyString("The brand query text to search for."),
        strategy: s.stringEnum("The Logo.dev search strategy to apply.", ["typeahead", "match"]),
      },
      { required: ["query"], optional: ["strategy"] },
    ),
    outputSchema: s.object("The normalized output payload for a Logo.dev brand search.", {
      brands: s.array("The matching brand candidates.", brandSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "describe_brand",
    operationType: "read",
    description: "Fetch structured Logo.dev brand metadata for a domain.",
    inputSchema: s.object("The input payload for describing a brand.", {
      domain: s.nonEmptyString("The company domain to describe."),
    }),
    outputSchema: s.object(
      "The normalized output payload for a Logo.dev brand description.",
      {
        name: s.string("The brand name."),
        domain: s.string("The brand domain."),
        description: s.string("The brand description."),
        socials: s.unknown("The brand social profile payload."),
        blurhash: s.string("The blurhash for the brand logo."),
        colors: s.unknown("The brand color palette payload."),
        logoUrl: s.url("The ready-to-use Logo.dev image URL."),
      },
      { optional: ["name", "description", "socials", "blurhash", "colors", "logoUrl"] },
    ),
  }),
];
