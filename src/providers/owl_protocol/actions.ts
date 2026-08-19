import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "owl_protocol";

const chainIdSchema = s.positiveInteger("The EVM chain identifier for the Owl Protocol project.");

const addressSchema = s.string("The contract address managed by the Owl Protocol project.", {
  pattern: "^0x[a-fA-F0-9]{40}$",
  minLength: 42,
  maxLength: 42,
});

const tokenIdSchema = s.nonEmptyString("The token identifier within the target contract.");

const tokenAttributeSchema = s.object(
  "One NFT attribute entry stored in Owl Protocol.",
  {
    trait_type: s.string("The trait name for the attribute."),
    description: s.string("The optional attribute description."),
    value: s.unknown("The attribute value."),
    max_value: s.number("The maximum numeric value for the attribute when present."),
    display_type: s.string("The NFT display type for the attribute."),
    display_value: s.string("The rendered attribute value string."),
  },
  {
    optional: ["trait_type", "description", "value", "max_value", "display_type", "display_value"],
    additionalProperties: true,
  },
);

const tokenPropertySchema = s.object(
  "One NFT properties entry stored in Owl Protocol.",
  {
    name: s.string("The property display name."),
    description: s.string("The property description."),
    value: s.unknown("The property value."),
    max_value: s.number("The maximum numeric property value when present."),
    display_type: s.string("The NFT display type for the property."),
    display_value: s.string("The rendered property value string."),
  },
  {
    optional: ["name", "description", "value", "max_value", "display_type", "display_value"],
    additionalProperties: true,
  },
);

const tokenLocalizationSchema = s.object(
  "The localization object stored in Owl Protocol metadata.",
  {
    uri: s.string("The localization URI template."),
    default: s.string("The default locale code."),
    locales: s.array("The locale codes available for this token.", s.string("One locale code.")),
  },
  {
    optional: ["uri", "default", "locales"],
    additionalProperties: true,
  },
);

const tokenMetadataProperties = {
  name: s.string("The NFT name."),
  description: s.string("The NFT description."),
  image: s.string("The image URL stored for the NFT."),
  image_data: s.string("The raw image data string stored for the NFT."),
  background_color: s.string("The NFT background color string."),
  animation_url: s.string("The animation URL stored for the NFT."),
  youtube_url: s.string("The YouTube URL stored for the NFT."),
  external_url: s.string("The external URL stored for the NFT."),
  decimals: s.integer("The decimals value stored for the NFT."),
  attributes: s.array("The NFT attributes array stored for the token.", tokenAttributeSchema),
  properties: s.record("The NFT properties map stored for the token.", tokenPropertySchema),
  localization: tokenLocalizationSchema,
} satisfies Record<string, JsonSchema>;

const tokenMetadataSchema = s.object(
  "The NFT metadata object stored for the token in Owl Protocol.",
  tokenMetadataProperties,
  {
    optional: Object.keys(tokenMetadataProperties),
    additionalProperties: true,
  },
);

const projectInfoSchema = s.object(
  "The Owl Protocol project summary returned by the API.",
  {
    slug: s.nonEmptyString("The unique slug for the Owl Protocol project."),
    teamId: s.nonEmptyString("The Owl Protocol team identifier that owns the project."),
    name: s.nonEmptyString("The human-readable Owl Protocol project name."),
    defaultChainId: chainIdSchema,
    description: s.string("The optional Owl Protocol project description."),
    authorizedDomains: s.array(
      "The optional domains authorized for the Owl Protocol project.",
      s.string("One authorized domain."),
    ),
    coverImage: s.string("The optional cover image URL for the Owl Protocol project."),
    projectType: s.string("The optional Owl Protocol project type string."),
    isArchived: s.boolean("Whether the Owl Protocol project is archived."),
    hasPublicUsers: s.boolean("Whether the Owl Protocol project allows public users."),
  },
  {
    optional: ["description", "authorizedDomains", "coverImage", "projectType", "isArchived", "hasPublicUsers"],
  },
);

const projectTokenSchema = s.object(
  "The Owl Protocol token record returned by the API.",
  {
    chainId: chainIdSchema,
    address: addressSchema,
    tokenId: tokenIdSchema,
    metadata: tokenMetadataSchema,
  },
  {
    optional: ["metadata"],
  },
);

const tokenSelectorProperties = {
  chainId: chainIdSchema,
  address: addressSchema,
  tokenId: tokenIdSchema,
} satisfies Record<string, JsonSchema>;

export const owlProtocolActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_project_info",
    description: "Read the connected Owl Protocol project's summary information.",
    inputSchema: s.actionInput({}, [], "No input is required for reading Owl Protocol project info."),
    outputSchema: s.actionOutput(
      {
        project: projectInfoSchema,
      },
      "The normalized Owl Protocol project info response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project_token",
    description: "Read one Owl Protocol token metadata record by chain, contract address, and token id.",
    inputSchema: s.actionInput(
      tokenSelectorProperties,
      Object.keys(tokenSelectorProperties),
      "The input payload for reading an Owl Protocol project token.",
    ),
    outputSchema: s.actionOutput(
      {
        token: projectTokenSchema,
      },
      "The normalized Owl Protocol project token response.",
    ),
  }),
  defineProviderAction(service, {
    name: "patch_project_token",
    description: "Patch one Owl Protocol token metadata record with a JSON metadata object only.",
    inputSchema: s.actionInput(
      {
        ...tokenSelectorProperties,
        metadata: tokenMetadataSchema,
      },
      [...Object.keys(tokenSelectorProperties), "metadata"],
      "The input payload for patching an Owl Protocol project token.",
    ),
    outputSchema: s.actionOutput(
      {
        token: projectTokenSchema,
      },
      "The normalized Owl Protocol patched token response.",
    ),
  }),
];
