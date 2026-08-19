import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "brandfetch";

const brandfetchFormatSchema = s.object(
  "One asset format returned by Brandfetch.",
  {
    src: s.string("The source URL for the asset format."),
    format: s.string("The asset file format, such as `svg` or `png`."),
    width: s.number("The asset width in pixels."),
    height: s.number("The asset height in pixels."),
    size: s.number("The asset size in bytes."),
    background: s.string("The background hint returned for the asset."),
  },
  { optional: ["width", "height", "size", "background"] },
);

const brandfetchLogoSchema = s.object(
  "One logo variant returned by Brandfetch.",
  {
    type: s.string("The logo type, such as `icon` or `logo`."),
    theme: s.string("The logo theme, such as `dark` or `light`."),
    formats: s.array("The available logo formats.", brandfetchFormatSchema),
  },
  { optional: ["theme"] },
);

const brandfetchImageSchema = s.object("One brand image variant returned by Brandfetch.", {
  type: s.string("The image type returned by Brandfetch."),
  formats: s.array("The available image formats.", brandfetchFormatSchema),
});

const brandfetchColorSchema = s.object(
  "One brand color returned by Brandfetch.",
  {
    hex: s.string("The HEX color value."),
    type: s.string("The color role returned by Brandfetch."),
    brightness: s.number("The brightness score returned by Brandfetch."),
  },
  { optional: ["brightness"] },
);

const brandfetchFontSchema = s.object(
  "One font descriptor returned by Brandfetch.",
  {
    name: s.string("The font name."),
    type: s.string("The font usage type, such as `title` or `body`."),
    origin: s.string("The font origin system."),
    originId: s.string("The font origin identifier."),
  },
  { optional: ["name", "origin", "originId"] },
);

const brandfetchLinkSchema = s.object("One external link returned by Brandfetch.", {
  name: s.string("The social or link target name."),
  url: s.string("The linked URL."),
});

const companySchema = s.record(
  "The company metadata block returned by Brandfetch.",
  s.unknown("Any company metadata value returned by Brandfetch."),
);

const brandfetchBrandSchema = s.object(
  "The normalized Brandfetch brand profile.",
  {
    id: s.string("The Brandfetch brand identifier."),
    urn: s.string("The Brandfetch URN for the brand profile."),
    name: s.nullable(s.string("The canonical brand name.")),
    domain: s.string("The primary brand domain."),
    claimed: s.boolean("Whether the brand profile is claimed on Brandfetch."),
    description: s.nullable(s.string("The short brand description.")),
    longDescription: s.nullable(s.string("The long-form brand description.")),
    qualityScore: s.number("The Brandfetch quality score for the brand."),
    isNsfw: s.boolean("Whether the brand profile is flagged as NSFW."),
    logos: s.array("The logos returned by Brandfetch.", brandfetchLogoSchema),
    colors: s.array("The brand colors.", brandfetchColorSchema),
    fonts: s.array("The brand fonts.", brandfetchFontSchema),
    images: s.array("The brand images.", brandfetchImageSchema),
    links: s.array("The external links for the brand.", brandfetchLinkSchema),
    company: companySchema,
  },
  {
    optional: [
      "id",
      "urn",
      "name",
      "domain",
      "claimed",
      "description",
      "longDescription",
      "qualityScore",
      "isNsfw",
      "logos",
      "colors",
      "fonts",
      "images",
      "links",
      "company",
    ],
  },
);

export const brandfetchActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_brand",
    description: "Fetch a Brandfetch brand profile from a domain, Brand ID, ISIN, or stock ticker identifier.",
    inputSchema: s.object("The input payload for fetching a Brandfetch brand profile.", {
      identifier: s.nonEmptyString("The identifier to look up, such as a domain, Brand ID, ISIN, or stock ticker."),
    }),
    outputSchema: brandfetchBrandSchema,
  }),
  defineProviderAction(service, {
    name: "get_transaction_info",
    description: "Resolve a raw transaction label into the corresponding Brandfetch merchant brand profile.",
    inputSchema: s.object("The input payload for resolving Brandfetch transaction information.", {
      transactionLabel: s.nonEmptyString("The raw merchant label from a payment or card statement."),
      countryCode: s.string({
        description: "The ISO 3166-1 alpha-2 country code for the transaction.",
        minLength: 2,
        maxLength: 2,
      }),
    }),
    outputSchema: brandfetchBrandSchema,
  }),
];
