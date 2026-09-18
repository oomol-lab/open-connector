import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "appcircle" as const;

const positiveIntegerSchema = (description: string) => s.integer(description, { minimum: 1 });
const profileSchema = s.looseObject("An Appcircle profile returned by the selected module.");
const profileListInputSchema = s.object(
  "Pagination and search filters for an Appcircle profile list.",
  {
    page: positiveIntegerSchema("The one-based result page."),
    size: positiveIntegerSchema("The number of profiles to request per page."),
    search: s.string("A profile name search term."),
  },
  { optional: ["page", "size", "search"] },
);
const profileListOutputSchema = s.requiredObject("An Appcircle profile list response.", {
  profiles: s.array("The Appcircle profiles returned by the module.", profileSchema),
  page: s.nullable(s.integer("The current result page when supplied by Appcircle.")),
  size: s.nullable(s.integer("The result page size when supplied by Appcircle.")),
  totalCount: s.nullable(s.integer("The total matching profile count when supplied by Appcircle.")),
});

const organizationSchema = s.looseRequiredObject("An Appcircle organization.", {
  id: s.optional(s.string("The unique organization identifier when supplied by Appcircle.")),
  name: s.string("The organization name."),
});

export const appcircleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List Appcircle organizations available to the connected API key.",
    inputSchema: s.object(
      "Pagination and search filters for Appcircle organizations.",
      {
        page: positiveIntegerSchema("The one-based result page."),
        perPage: positiveIntegerSchema("The number of organizations to request per page."),
        search: s.string("An organization name search term."),
      },
      { optional: ["page", "perPage", "search"] },
    ),
    outputSchema: s.requiredObject("A page of Appcircle organizations.", {
      organizations: s.array("The organizations available to the connected API key.", organizationSchema),
      page: s.nullable(s.integer("The current result page when supplied by Appcircle.")),
      perPage: s.nullable(s.integer("The number of organizations per page when supplied by Appcircle.")),
      total: s.nullable(s.integer("The total matching organization count when supplied by Appcircle.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_build_profiles",
    operationType: "read",
    description: "List Appcircle Build profiles for the connected organization.",
    inputSchema: profileListInputSchema,
    outputSchema: profileListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_distribution_profiles",
    operationType: "read",
    description: "List Appcircle Testing Distribution profiles for the connected organization.",
    inputSchema: profileListInputSchema,
    outputSchema: profileListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_enterprise_store_profiles",
    operationType: "read",
    description: "List Appcircle Enterprise App Store profiles for the connected organization.",
    inputSchema: profileListInputSchema,
    outputSchema: profileListOutputSchema,
  }),
];

export type AppcircleActionName =
  | "list_organizations"
  | "list_build_profiles"
  | "list_distribution_profiles"
  | "list_enterprise_store_profiles";
