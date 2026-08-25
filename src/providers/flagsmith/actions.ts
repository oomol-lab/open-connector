import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "flagsmith";

function metadataSchema(description: string): JsonSchema {
  return s.looseObject(description);
}

const featureNameSchema = s.nonEmptyString("The Flagsmith feature name.");
const identityIdentifierSchema = s.nonEmptyString("The Flagsmith identity identifier.");

const traitValueSchema = s.anyOf("A Flagsmith trait value.", [
  s.string("A string trait value."),
  s.number("A numeric trait value."),
  s.boolean("A boolean trait value."),
  { type: "null", description: "A null trait value." },
]);

const traitInputSchema = s.object("A Flagsmith identity trait to set.", {
  trait_key: s.nonEmptyString("The Flagsmith trait key."),
  trait_value: traitValueSchema,
});

const featureStateValueSchema = s.anyOf("The value attached to a Flagsmith feature state.", [
  s.string("A string feature value."),
  s.number("A numeric feature value."),
  s.boolean("A boolean feature value."),
  s.looseObject("An object feature value."),
  s.array("An array feature value.", s.unknown("One array feature value.")),
  { type: "null", description: "A null feature value." },
]);

const flagSchema = s.object(
  "A Flagsmith feature flag state.",
  {
    feature: s.object(
      "The Flagsmith feature metadata.",
      {
        id: s.integer("The Flagsmith feature id."),
        name: featureNameSchema,
        type: s.nonEmptyString("The Flagsmith feature type."),
      },
      {
        optional: ["id", "type"],
        additionalProperties: true,
      },
    ),
    enabled: s.boolean("Whether the feature is enabled."),
    feature_state_value: featureStateValueSchema,
    featurestate_uuid: s.nonEmptyString("The Flagsmith feature state UUID."),
    multivariate_feature_state_values: s.array(
      "Multivariate feature values returned by Flagsmith.",
      s.looseObject("One multivariate feature value returned by Flagsmith."),
    ),
    metadata: metadataSchema("Flagsmith metadata attached to this feature state."),
    raw: s.looseObject("The raw Flagsmith feature state object."),
  },
  {
    optional: [
      "feature",
      "enabled",
      "feature_state_value",
      "featurestate_uuid",
      "multivariate_feature_state_values",
      "metadata",
      "raw",
    ],
    additionalProperties: true,
  },
);

const traitOutputSchema = s.object(
  "A Flagsmith identity trait returned by the API.",
  {
    trait_key: s.nonEmptyString("The Flagsmith trait key."),
    trait_value: traitValueSchema,
    raw: s.looseObject("The raw Flagsmith trait object."),
  },
  {
    optional: ["trait_key", "trait_value", "raw"],
    additionalProperties: true,
  },
);

const identitySchema = s.object(
  "A Flagsmith identity response.",
  {
    identifier: identityIdentifierSchema,
    identity_uuid: s.nonEmptyString("The Flagsmith identity UUID."),
    django_id: s.integer("The Flagsmith identity database id."),
    flags: s.array("Flags evaluated for this identity.", flagSchema),
    traits: s.array("Traits returned for this identity.", traitOutputSchema),
    raw: s.looseObject("The raw Flagsmith identity response."),
  },
  {
    optional: ["identifier", "identity_uuid", "django_id", "flags", "traits", "raw"],
    additionalProperties: true,
  },
);

const listFlagsInputSchema = s.object(
  "Input parameters for listing Flagsmith flags.",
  {
    feature: featureNameSchema,
  },
  {
    optional: ["feature"],
  },
);

const listFlagsOutputSchema = s.object("The Flagsmith flag list response.", {
  flags: s.array("Feature flags returned by Flagsmith.", flagSchema),
  raw: s.array("Raw Flagsmith feature state objects.", s.looseObject("One raw feature state.")),
});

const getFeatureFlagInputSchema = s.object("Input parameters for retrieving one Flagsmith flag.", {
  feature: featureNameSchema,
});

const getFeatureFlagOutputSchema = s.object("The Flagsmith single flag response.", {
  flag: flagSchema,
  raw: s.looseObject("The raw Flagsmith feature state object."),
});

const getIdentityFlagsInputSchema = s.object("Input parameters for retrieving Flagsmith identity flags.", {
  identifier: identityIdentifierSchema,
});

const identityOutputSchema = s.object("The Flagsmith identity result.", {
  identity: identitySchema,
  raw: s.looseObject("The raw Flagsmith identity response."),
});

const identifyIdentityInputSchema = s.object(
  "Input parameters for identifying a Flagsmith identity and setting traits.",
  {
    identifier: identityIdentifierSchema,
    traits: s.array("Traits to set for this identity.", traitInputSchema),
  },
  {
    optional: ["traits"],
  },
);

export const flagsmithActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_flags",
    description: "List feature flags for the connected Flagsmith environment.",
    inputSchema: listFlagsInputSchema,
    outputSchema: listFlagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_feature_flag",
    description: "Retrieve one feature flag by feature name from the connected environment.",
    inputSchema: getFeatureFlagInputSchema,
    outputSchema: getFeatureFlagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_identity_flags",
    description: "Retrieve evaluated flags and traits for a Flagsmith identity.",
    inputSchema: getIdentityFlagsInputSchema,
    outputSchema: identityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "identify_identity",
    description: "Identify a Flagsmith user, optionally set traits, and return evaluated flags.",
    inputSchema: identifyIdentityInputSchema,
    outputSchema: identityOutputSchema,
  }),
];
