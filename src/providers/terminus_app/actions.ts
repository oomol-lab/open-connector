import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const projectIdSchema = s.string("The Terminus project ID, starting with prj_.", {
  minLength: 5,
  pattern: "^prj_",
});
const pageSchema = s.integer("The page number to return.", { minimum: 1 });
const itemsSchema = s.integer("The number of items to return per page.", {
  minimum: 1,
  maximum: 100,
});
const paginationInputProperties = {
  page: s.optional(pageSchema),
  items: s.optional(itemsSchema),
};
const paginationMetaSchema = s.looseObject("Pagination metadata returned by Terminus.", {
  page: s.integer("The current page number."),
  has_more: s.boolean("Whether another page is available."),
});
const projectSchema = s.looseObject("A Terminus project.", {
  id: s.string("The permanent project ID."),
  name: s.string("The project name."),
});
const conventionSummarySchema = s.looseObject("A Terminus convention summary.", {
  id: s.integer("The convention ID."),
  name: s.string("The convention name."),
});
const conventionSchema = s.looseObject("A Terminus convention and its field definitions.", {
  id: s.integer("The convention ID."),
  name: s.string("The convention name."),
});
const linkSchema = s.looseObject("A tracked Terminus link.", {
  id: s.integer("The link ID."),
  url: s.string("The destination URL."),
  long_url: s.string("The destination URL with generated tracking parameters."),
});
const utmTagSchema = s.object("A UTM parameter value.", {
  tag: s.string("The UTM parameter value."),
});
const namedTagMapSchema = s.record(
  "Values keyed by the configured Terminus field or custom parameter name.",
  utmTagSchema,
);
const conventionInputSchema = s.object("A convention and the values for its fields.", {
  id: s.integer("The convention ID."),
  inputFields: s.array(
    "Values for the convention fields.",
    s.object("A value supplied for one convention field.", {
      fieldId: s.integer("The convention field ID."),
      inputValue: s.string("The input value for the convention field."),
    }),
    { minItems: 1 },
  ),
});
const utmInputSchema = s.object(
  "UTM values not supplied by a convention.",
  {
    campaign: s.optional(utmTagSchema),
    medium: s.optional(utmTagSchema),
    source: s.optional(utmTagSchema),
    content: s.optional(utmTagSchema),
    term: s.optional(utmTagSchema),
  },
  { optional: ["campaign", "medium", "source", "content", "term"] },
);

const listProjectsInputSchema = s.object(
  "Pagination options for listing Terminus projects.",
  paginationInputProperties,
  { optional: ["page", "items"] },
);
const projectListOutputSchema = s.object("A page of Terminus projects.", {
  projects: s.array("Projects returned by Terminus.", projectSchema),
  meta: paginationMetaSchema,
});
const projectPaginationInputSchema = s.object(
  "A Terminus project and pagination options.",
  { projectId: projectIdSchema, ...paginationInputProperties },
  { optional: ["page", "items"] },
);
const conventionListOutputSchema = s.object("A page of Terminus conventions.", {
  conventions: s.array("Conventions returned by Terminus.", conventionSummarySchema),
  meta: paginationMetaSchema,
});
const getConventionInputSchema = s.object("The Terminus convention to retrieve.", {
  projectId: projectIdSchema,
  conventionId: s.integer("The convention ID."),
});
const conventionOutputSchema = s.object("A Terminus convention response.", {
  convention: conventionSchema,
});
const listLinksInputSchema = s.object(
  "Filters and pagination options for listing Terminus links.",
  {
    projectId: projectIdSchema,
    createdAfter: s.optional(s.integer("Return links created after this Unix timestamp.", { minimum: 0 })),
    updatedAfter: s.optional(s.integer("Return links updated after this Unix timestamp.", { minimum: 0 })),
    ...paginationInputProperties,
  },
  { optional: ["createdAfter", "updatedAfter", "page", "items"] },
);
const linkListOutputSchema = s.object("A page of Terminus links.", {
  links: s.array("Links returned by Terminus.", linkSchema),
  meta: paginationMetaSchema,
});
const createLinkInputSchema = s.object(
  "The tracked link to create in a Terminus project.",
  {
    projectId: projectIdSchema,
    url: s.string("The destination URL.", { format: "uri" }),
    convention: s.optional(conventionInputSchema),
    utm: s.optional(utmInputSchema),
    custom: s.optional(namedTagMapSchema),
    info: s.optional(namedTagMapSchema),
    labelNames: s.optional(s.array("Labels to apply to the link.", s.string("A label name."))),
    description: s.optional(s.string("A description for the link.")),
    skipMonitoring: s.optional(s.boolean("Whether to skip URL monitoring.")),
    shortUrlKey: s.optional(s.string("A custom short URL key.")),
    skipUrlValidation: s.optional(s.boolean("Whether to skip destination URL validation.")),
  },
  {
    optional: [
      "convention",
      "utm",
      "custom",
      "info",
      "labelNames",
      "description",
      "skipMonitoring",
      "shortUrlKey",
      "skipUrlValidation",
    ],
  },
);
const createLinkOutputSchema = s.object("The created Terminus link.", {
  link: linkSchema,
});

const service = "terminus_app";

export const terminusAppActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List the Terminus projects available to the connected API key.",
    inputSchema: listProjectsInputSchema,
    outputSchema: projectListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_conventions",
    operationType: "read",
    description: "List tracking conventions configured for a Terminus project.",
    inputSchema: projectPaginationInputSchema,
    outputSchema: conventionListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_convention",
    operationType: "read",
    description: "Get a Terminus convention and its field definitions.",
    inputSchema: getConventionInputSchema,
    outputSchema: conventionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_links",
    operationType: "read",
    description: "List tracked links in a Terminus project.",
    inputSchema: listLinksInputSchema,
    outputSchema: linkListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_link",
    operationType: "write",
    description: "Create a tagged and optionally shortened link in a Terminus project.",
    inputSchema: createLinkInputSchema,
    outputSchema: createLinkOutputSchema,
  }),
];
