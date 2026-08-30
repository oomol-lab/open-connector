import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "carbone" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

const templateIdSchema = nonEmptyString("The Carbone template ID or version ID.");
const carboneVersionSchema = s.integer("The Carbone API version header value.", {
  minimum: 4,
  maximum: 5,
});
const unixTimestampSchema = s.integer("The UTC Unix timestamp used by Carbone.");
const tagSchema = s.array("The tags attached to the template.", nonEmptyString("One template tag."));

const templateMetadataInputSchema = s.object(
  "The metadata fields used to update a Carbone template.",
  {
    name: nonEmptyString("The template name."),
    comment: nonEmptyString("The template comment."),
    category: nonEmptyString("The template category."),
    tags: tagSchema,
    expireAt: unixTimestampSchema,
    deployedAt: unixTimestampSchema,
    versioning: s.boolean("Whether template versioning should be enabled."),
  },
  {
    optional: ["name", "comment", "category", "tags", "expireAt", "deployedAt", "versioning"],
  },
);

const templateSchema = s.looseObject("A Carbone template object returned by the API.", {
  id: s.nullable(s.string("The template ID when returned by Carbone.")),
  versionId: s.nullable(s.string("The template version ID when returned by Carbone.")),
  name: s.nullable(s.string("The template name when returned by Carbone.")),
  category: s.nullable(s.string("The template category when returned by Carbone.")),
  tags: s.nullable(tagSchema),
});

const paginationSchema = s.looseObject("The pagination metadata returned by Carbone.", {
  cursor: s.nullable(s.string("The current cursor returned by Carbone.")),
  nextCursor: s.nullable(s.string("The next cursor returned by Carbone.")),
  limit: s.nullable(s.integer("The page size returned by Carbone.")),
});

const baseOutputSchema = s.looseObject("The raw Carbone response wrapper.", {
  success: s.nullable(s.boolean("Whether Carbone reported a successful operation.")),
});

const listTemplatesAction = defineProviderAction(service, {
  name: "list_templates",
  description: "List Carbone templates with optional filtering and cursor pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Carbone templates.",
    {
      id: nonEmptyString("Filter templates by template ID."),
      versionId: nonEmptyString("Filter templates by version ID."),
      category: nonEmptyString("Filter templates by category."),
      search: nonEmptyString("Search templates by name or ID."),
      includeVersions: s.boolean("Whether to include every template version in the result."),
      cursor: nonEmptyString("The cursor returned by a previous list_templates call."),
      limit: s.integer("The maximum number of templates to return.", { minimum: 1 }),
      carboneVersion: carboneVersionSchema,
    },
    {
      optional: ["id", "versionId", "category", "search", "includeVersions", "cursor", "limit", "carboneVersion"],
    },
  ),
  outputSchema: s.object("The response returned when listing Carbone templates.", {
    templates: s.array("The templates returned by Carbone.", templateSchema),
    pagination: paginationSchema,
    raw: baseOutputSchema,
  }),
});

const listTemplateCategoriesAction = defineProviderAction(service, {
  name: "list_template_categories",
  description: "List categories used by deployed Carbone templates.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Carbone template categories.",
    {
      carboneVersion: carboneVersionSchema,
    },
    { optional: ["carboneVersion"] },
  ),
  outputSchema: s.object("The response returned when listing Carbone template categories.", {
    categories: s.array("The template categories returned by Carbone.", s.string("One category.")),
    raw: baseOutputSchema,
  }),
});

const listTemplateTagsAction = defineProviderAction(service, {
  name: "list_template_tags",
  description: "List tags used by deployed Carbone templates.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Carbone template tags.",
    {
      carboneVersion: carboneVersionSchema,
    },
    { optional: ["carboneVersion"] },
  ),
  outputSchema: s.object("The response returned when listing Carbone template tags.", {
    tags: s.array("The template tags returned by Carbone.", s.string("One tag.")),
    raw: baseOutputSchema,
  }),
});

const updateTemplateMetadataAction = defineProviderAction(service, {
  name: "update_template_metadata",
  description: "Update metadata on an existing Carbone template or template version.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating Carbone template metadata.",
    {
      templateIdOrVersionId: templateIdSchema,
      metadata: templateMetadataInputSchema,
      carboneVersion: carboneVersionSchema,
    },
    { optional: ["carboneVersion"] },
  ),
  outputSchema: s.object("The response returned after updating Carbone template metadata.", {
    success: s.boolean("Whether the update request succeeded."),
    template: s.nullable(templateSchema),
    raw: baseOutputSchema,
  }),
});

const deleteTemplateAction = defineProviderAction(service, {
  name: "delete_template",
  description: "Delete a Carbone template or a specific template version.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for deleting a Carbone template.",
    {
      templateIdOrVersionId: templateIdSchema,
      carboneVersion: carboneVersionSchema,
    },
    { optional: ["carboneVersion"] },
  ),
  outputSchema: s.object("The response returned after deleting a Carbone template.", {
    success: s.boolean("Whether the delete request succeeded."),
    raw: baseOutputSchema,
  }),
});

export const carboneActions: ActionDefinition[] = [
  listTemplatesAction,
  listTemplateCategoriesAction,
  listTemplateTagsAction,
  updateTemplateMetadataAction,
  deleteTemplateAction,
];
