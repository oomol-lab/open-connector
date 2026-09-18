import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "statamic";

const siteKeySchema = s.nonEmptyString("The Statamic site key.");
const siteNameSchema = s.nonEmptyString("The display name of the Statamic site.");
const domainSchema = s.nonEmptyString("A domain to license for the Statamic site.");
const domainsSchema = s.array(
  "The domains to license for the Statamic site. The first domain is treated as production.",
  domainSchema,
  { minItems: 1 },
);

const siteSchema = s.object("A normalized Statamic site.", {
  name: s.string("The site name returned by Statamic."),
  key: s.string("The site key returned by Statamic."),
  domains: s.array("The licensed domains returned by Statamic.", s.string("One licensed domain.")),
  createdAt: s.nullable(s.string("The site creation timestamp returned by Statamic.")),
  raw: s.looseObject("The raw site object returned by Statamic."),
});

const siteOutputSchema = s.object("The response returned with a Statamic site.", {
  site: siteSchema,
});

export const statamicActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sites",
    operationType: "read",
    description: "List Statamic sites available in the authenticated statamic.com account.",
    inputSchema: s.object("The input payload for listing Statamic sites.", {}),
    outputSchema: s.object("The response returned when listing Statamic sites.", {
      sites: s.array("The Statamic sites returned by the API.", siteSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_site",
    operationType: "write",
    description: "Create a Statamic site license with an optional domain or domains.",
    inputSchema: s.object(
      "The input payload for creating a Statamic site. Provide either domain or domains, not both.",
      {
        name: siteNameSchema,
        domain: domainSchema,
        domains: domainsSchema,
      },
      { optional: ["domain", "domains"] },
    ),
    outputSchema: siteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_site",
    operationType: "destructive",
    description: "Update a Statamic site name or replace its licensed domain list.",
    inputSchema: s.object(
      "The input payload for updating a Statamic site. Provide at least one of name, domain, or domains; provide either domain or domains, not both.",
      {
        key: siteKeySchema,
        name: siteNameSchema,
        domain: domainSchema,
        domains: domainsSchema,
      },
      { optional: ["name", "domain", "domains"] },
    ),
    outputSchema: siteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_site",
    operationType: "destructive",
    description: "Delete a Statamic site by site key.",
    inputSchema: s.object("The input payload for deleting a Statamic site.", {
      key: siteKeySchema,
    }),
    outputSchema: s.object("The response returned when deleting a Statamic site.", {
      message: s.string("The deletion message returned by Statamic."),
    }),
  }),
];
