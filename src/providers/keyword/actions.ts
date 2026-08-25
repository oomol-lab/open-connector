import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "keyword";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

const projectNameSchema = nonEmptyString(
  "The Keyword.com project or group name. Use the full `[sub]` convention for subprojects.",
);
const keywordIdSchema = nonEmptyString("The Keyword.com keyword identifier.");
const pageSchema = s.integer("The page number for a paginated Keyword.com response.", {
  minimum: 1,
});
const perPageSchema = s.integer("The maximum number of records to return per page.", {
  minimum: 1,
  maximum: 250,
});
const dateSchema = s.string("The ranking data date to retrieve in YYYY-MM-DD format.", {
  format: "date",
});

const linksSchema = s.looseObject("The pagination links returned by Keyword.com.");
const metaSchema = s.looseObject("The metadata object returned by Keyword.com.");

const projectSchema = s.object("A Keyword.com project or group resource.", {
  type: s.string("The resource type returned by Keyword.com."),
  id: s.string("The project or group identifier returned by Keyword.com."),
  attributes: s.looseObject("The project or group attributes returned by Keyword.com."),
  raw: s.looseObject("The raw project or group resource returned by Keyword.com."),
});

const keywordSchema = s.object("A Keyword.com keyword resource.", {
  type: s.string("The resource type returned by Keyword.com."),
  id: s.string("The keyword identifier returned by Keyword.com."),
  attributes: s.looseObject("The keyword attributes and ranking metrics returned by Keyword.com."),
  raw: s.looseObject("The raw keyword resource returned by Keyword.com."),
});

const regionSchema = s.object("A Google region tracked in a Keyword.com project.", {
  region: s.string("The Google region domain returned by Keyword.com."),
  language: s.nullable(s.string("The language code returned by Keyword.com.")),
  type: s.nullable(s.string("The tracking type returned by Keyword.com.")),
  total: s.nullable(s.integer("The number of keywords tracked for this region.")),
  raw: s.looseObject("The raw region object returned by Keyword.com."),
});

const userSchema = s.object("The current Keyword.com user profile.", {
  type: s.string("The user resource type returned by Keyword.com."),
  id: s.string("The user identifier returned by Keyword.com."),
  attributes: s.looseObject("The user profile and subscription attributes returned by Keyword.com."),
  raw: s.looseObject("The raw user resource returned by Keyword.com."),
});

export const keywordActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Keyword.com user profile for the API token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the current Keyword.com user.", {}),
    outputSchema: s.object("The current Keyword.com user response.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List active Keyword.com projects and groups visible to the API token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Keyword.com projects.", {}),
    outputSchema: s.object("The response returned when listing Keyword.com projects.", {
      projects: s.array("The projects and groups returned by Keyword.com.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Keyword.com project or group by name.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one Keyword.com project.", {
      projectName: projectNameSchema,
    }),
    outputSchema: s.object("The response returned when retrieving a Keyword.com project.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_keywords",
    description: "List Keyword.com keywords and ranking data for a project or group.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Keyword.com keywords.",
      {
        projectName: projectNameSchema,
        page: pageSchema,
        perPage: perPageSchema,
        date: dateSchema,
      },
      { optional: ["page", "perPage", "date"] },
    ),
    outputSchema: s.object("The response returned when listing Keyword.com keywords.", {
      keywords: s.array("The keywords returned by Keyword.com.", keywordSchema),
      meta: s.nullable(metaSchema),
      links: s.nullable(linksSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_keyword",
    description: "Get one Keyword.com keyword and its ranking data by project and keyword ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving one Keyword.com keyword.",
      {
        projectName: projectNameSchema,
        keywordId: keywordIdSchema,
        date: dateSchema,
      },
      { optional: ["date"] },
    ),
    outputSchema: s.object("The response returned when retrieving a Keyword.com keyword.", {
      keyword: keywordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_project_regions",
    description: "List Google regions tracked by a Keyword.com project or group.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Keyword.com project regions.", {
      projectName: projectNameSchema,
    }),
    outputSchema: s.object("The response returned when listing Keyword.com project regions.", {
      regions: s.array("The tracked regions returned by Keyword.com.", regionSchema),
    }),
  }),
];
