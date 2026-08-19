import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shorten_rest";

const trimmedNonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });

const aliasNameSchema = s.string("The alias value without a leading slash.", {
  minLength: 1,
  pattern: "^(?!/).+$",
});

const domainNameSchema = s.string("The domain name without http://, https://, or a trailing slash.", {
  minLength: 1,
  pattern: "^(?![Hh][Tt][Tt][Pp][Ss]?://)[^/]+$",
});

const destinationSchema = s.object(
  "A destination URL with optional geo-targeting rules.",
  {
    url: s.url("The destination URL where the alias redirects."),
    country: trimmedNonEmptyString("The ISO alpha-2 country code for this destination."),
    os: trimmedNonEmptyString("The operating system selector for this destination."),
  },
  { optional: ["country", "os"] },
);

const metatagSchema = s.object("A metatag override for an alias.", {
  name: trimmedNonEmptyString("The metatag name."),
  content: trimmedNonEmptyString("The metatag content."),
});

const snippetSchema = s.object(
  "A tracking snippet override for an alias.",
  {
    id: trimmedNonEmptyString("The snippet identifier."),
    parameters: s.record("The snippet parameters as string key-value pairs.", s.string("A parameter value.")),
  },
  { optional: ["parameters"] },
);

const aliasBodyFields = {
  destinations: s.array(
    "The destination URLs for the alias. At least one destination is required when creating an alias.",
    destinationSchema,
    { minItems: 1 },
  ),
  metatags: s.array("The metatag overrides for the alias.", metatagSchema),
  snippets: s.array("The tracking snippet overrides for the alias.", snippetSchema),
};

const createAliasInputSchema = s.object(
  "The input payload for creating a Shorten.REST alias.",
  {
    domainName: domainNameSchema,
    aliasName: aliasNameSchema,
    ...aliasBodyFields,
  },
  { optional: ["domainName", "aliasName", "metatags", "snippets"] },
);

const updateAliasInputSchema = {
  ...s.object(
    "The input payload for updating a Shorten.REST alias.",
    {
      domainName: domainNameSchema,
      aliasName: aliasNameSchema,
      ...aliasBodyFields,
    },
    { optional: ["domainName", "destinations", "metatags", "snippets"] },
  ),
  anyOf: [{ required: ["destinations"] }, { required: ["metatags"] }, { required: ["snippets"] }],
};

const aliasReferenceInputSchema = s.object(
  "The input payload for identifying one Shorten.REST alias.",
  {
    domainName: domainNameSchema,
    aliasName: aliasNameSchema,
  },
  { optional: ["domainName"] },
);

const paginationInputFields = {
  continueFrom: trimmedNonEmptyString("The previous response lastId value used to fetch the next page."),
  limit: s.integer("The maximum number of records to return, from 1 to 1000.", {
    minimum: 1,
    maximum: 1000,
  }),
};

const listAliasesInputSchema = s.object(
  "The input payload for listing Shorten.REST alias names by domain.",
  {
    domainName: domainNameSchema,
    ...paginationInputFields,
  },
  { optional: ["domainName", "continueFrom", "limit"] },
);

const listClicksInputSchema = s.object(
  "The input payload for listing Shorten.REST click records.",
  paginationInputFields,
  { optional: ["continueFrom", "limit"] },
);

const aliasSchema = s.object(
  "A Shorten.REST alias returned by the API.",
  {
    name: s.string("The alias name."),
    domainName: s.string("The domain name for the alias."),
    createdAt: s.integer("The alias creation timestamp in Unix milliseconds."),
    updatedAt: s.integer("The alias update timestamp in Unix milliseconds."),
    destinations: s.array("The destination URLs configured on the alias.", destinationSchema),
    metatags: s.array("The metatag overrides configured on the alias.", metatagSchema),
    snippets: s.array("The tracking snippet overrides configured on the alias.", snippetSchema),
  },
  { optional: ["domainName", "createdAt", "updatedAt", "destinations", "metatags", "snippets"] },
);

const clickSchema = s.object(
  "A Shorten.REST click record.",
  {
    country: s.string("The visitor country code."),
    os: s.string("The visitor operating system."),
    createdAt: s.integer("The click creation timestamp in Unix milliseconds."),
    domain: s.string("The clicked domain."),
    aliasId: s.string("The internal alias identifier."),
    alias: s.string("The clicked alias name."),
    destination: s.string("The resolved destination URL."),
    userAgent: s.string("The visitor user agent."),
    browser: s.string("The visitor browser."),
    referrer: s.string("The referrer URL."),
  },
  {
    optional: [
      "country",
      "os",
      "createdAt",
      "domain",
      "aliasId",
      "alias",
      "destination",
      "userAgent",
      "browser",
      "referrer",
    ],
  },
);

export const shortenRestActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_alias",
    description: "Create a Shorten.REST alias for one or more destination URLs.",
    inputSchema: createAliasInputSchema,
    outputSchema: s.object("The alias created by Shorten.REST.", {
      aliasName: s.string("The generated or requested alias name."),
      domainName: s.string("The domain name for the short URL."),
      shortUrl: s.url("The complete short URL."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_alias",
    description: "Get detailed information for one Shorten.REST alias.",
    inputSchema: aliasReferenceInputSchema,
    outputSchema: s.object("The alias lookup result returned by Shorten.REST.", {
      alias: s.nullable(aliasSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "update_alias",
    description: "Update destinations, metatags, or snippets on an existing Shorten.REST alias.",
    inputSchema: updateAliasInputSchema,
    outputSchema: s.object("The Shorten.REST alias update result.", {
      success: s.boolean("Whether Shorten.REST accepted the update."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_alias",
    description: "Delete one Shorten.REST alias by alias name and optional domain.",
    inputSchema: aliasReferenceInputSchema,
    outputSchema: s.object("The Shorten.REST alias deletion result.", {
      success: s.boolean("Whether Shorten.REST accepted the deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_aliases",
    description: "List Shorten.REST alias names for a domain with official pagination.",
    inputSchema: listAliasesInputSchema,
    outputSchema: s.object(
      "The paginated Shorten.REST alias-name list.",
      {
        aliases: s.array("The alias names returned for the selected domain.", s.string("An alias name.")),
        lastId: s.string("The last alias ID for fetching the next page."),
      },
      { optional: ["lastId"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_clicks",
    description: "List raw Shorten.REST click records with official pagination.",
    inputSchema: listClicksInputSchema,
    outputSchema: s.object(
      "The paginated Shorten.REST click list.",
      {
        clicks: s.array("The click records returned by Shorten.REST.", clickSchema),
        lastId: s.string("The last click ID for fetching the next page."),
      },
      { optional: ["lastId"] },
    ),
  }),
];
