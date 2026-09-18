import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stormboard";

const stormIdSchema = s.integer("The Stormboard Storm ID.", { minimum: 1 });
const stormIdInputSchema = s.object(
  { stormId: stormIdSchema },
  { required: ["stormId"], description: "Input for a Stormboard Storm read action." },
);
const rawObjectSchema = s.looseObject("Raw Stormboard object.");
const stormRecordSchema = s.looseObject("A Stormboard Storm record.", {
  id: s.integer("The Storm ID returned by Stormboard."),
  title: s.string("The Storm title returned by Stormboard."),
  closed: s.boolean("Whether the Storm is closed."),
  team: rawObjectSchema,
});
const ideaRecordSchema = s.looseObject("A Stormboard idea record.", {
  id: s.integer("The idea ID returned by Stormboard."),
  type: s.string("The Stormboard idea type."),
  data: s.unknown("The idea data returned by Stormboard."),
});
const userRecordSchema = s.looseObject("A Stormboard participant record.", {
  firstname: s.string("The participant first name."),
  lastname: s.string("The participant last name."),
  email: s.string("The participant email."),
});
const connectorRecordSchema = s.looseObject("A Stormboard line connector record.", {
  id: s.integer("The connector ID returned by Stormboard."),
  from: s.integer("The source idea ID."),
  to: s.integer("The target idea ID."),
  label: s.string("The connector label."),
});
const tagRecordSchema = s.looseObject("A Stormboard tag record.", {
  id: s.integer("The tag ID returned by Stormboard."),
  name: s.string("The tag name."),
  type: s.string("The tag type."),
  status: s.string("The tag status."),
});
const categoryRecordSchema = s.looseObject("A Stormboard template category.", {
  id: s.nonEmptyString("The Stormboard template category ID."),
  name: s.string("The category name returned by Stormboard."),
});
const profileSchema = s.looseObject("A Stormboard profile object.", {
  id: s.integer("The Stormboard user ID."),
  firstname: s.string("The user's first name."),
  lastname: s.string("The user's last name."),
  username: s.string("The username returned by Stormboard."),
  email: s.string("The email address returned by Stormboard."),
  team: rawObjectSchema,
});

export const stormboardActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description: "Get the Stormboard profile associated with the provided API key.",
    inputSchema: s.object({}, { description: "No input parameters are required." }),
    outputSchema: s.object(
      { profile: profileSchema },
      { required: ["profile"], description: "Stormboard profile response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_storms",
    operationType: "read",
    description:
      "List Stormboard Storms visible to the current account with optional team, folder, status, title, ordering, and pagination filters.",
    inputSchema: s.object(
      {
        team: s.integer("Filter Storm results by a team ID.", { minimum: 1 }),
        folder: s.integer("Filter Storm results by a dashboard folder ID.", { minimum: 1 }),
        needle: s.nonEmptyString("Filter Storm results based on Storm title."),
        status: s.stringEnum("Filter Storms by status.", ["active", "open", "closed"]),
        start: s.nonNegativeInteger("Start the Storm list at this index."),
        order: s.stringEnum("Order Storm results by this value.", ["activity", "alpha", "frequency", "starred"]),
        results: s.integer("The number of Storm results to return. Stormboard allows up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { description: "Query parameters for listing Stormboard Storms." },
    ),
    outputSchema: s.object(
      {
        hasMore: s.boolean("Whether Stormboard has more Storm results available."),
        storms: s.array(stormRecordSchema, { description: "Storms returned by Stormboard." }),
      },
      { required: ["hasMore", "storms"], description: "Stormboard Storm list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_storm",
    operationType: "read",
    description: "Get the details and setup for one Stormboard Storm.",
    inputSchema: stormIdInputSchema,
    outputSchema: s.object(
      { storm: stormRecordSchema },
      { required: ["storm"], description: "Stormboard Storm detail response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_storm_access",
    operationType: "read",
    description: "Check the current account's access level for one Stormboard Storm.",
    inputSchema: stormIdInputSchema,
    outputSchema: s.object(
      {
        access: s.object(
          {
            administrator: s.boolean("Whether the current account is an administrator in the Storm."),
            type: s.string("The access type returned by Stormboard."),
          },
          { required: ["administrator", "type"], description: "Stormboard access level." },
        ),
      },
      { required: ["access"], description: "Stormboard Storm access response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_storm_ideas",
    operationType: "read",
    description: "List ideas in one Stormboard Storm, optionally filtering by last modified timestamp.",
    inputSchema: s.object(
      {
        stormId: stormIdSchema,
        lastModifiedMin: s.dateTime("Only return ideas modified since this ISO 8601 timestamp."),
      },
      { required: ["stormId"], description: "Input for listing ideas in a Stormboard Storm." },
    ),
    outputSchema: s.object(
      { ideas: s.array(ideaRecordSchema, { description: "Ideas returned by Stormboard." }) },
      { required: ["ideas"], description: "Stormboard idea list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_storm_users",
    operationType: "read",
    description: "List participants in one Stormboard Storm.",
    inputSchema: stormIdInputSchema,
    outputSchema: s.object(
      { users: s.array(userRecordSchema, { description: "Participants returned by Stormboard." }) },
      { required: ["users"], description: "Stormboard participant list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_storm_connectors",
    operationType: "read",
    description: "List line connectors in one Stormboard Storm.",
    inputSchema: stormIdInputSchema,
    outputSchema: s.object(
      { connectors: s.array(connectorRecordSchema, { description: "Connectors returned by Stormboard." }) },
      { required: ["connectors"], description: "Stormboard connector list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_storm_tags",
    operationType: "read",
    description: "List tags that have been created in one Stormboard Storm.",
    inputSchema: stormIdInputSchema,
    outputSchema: s.object(
      { tags: s.array(tagRecordSchema, { description: "Tags returned by Stormboard." }) },
      { required: ["tags"], description: "Stormboard tag list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_template_categories",
    operationType: "read",
    description: "List Stormboard template categories.",
    inputSchema: s.object({}, { description: "No input parameters are required." }),
    outputSchema: s.object(
      { categories: s.array(categoryRecordSchema, { description: "Template categories returned by Stormboard." }) },
      { required: ["categories"], description: "Stormboard template category list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List Stormboard templates, optionally limited to one template category.",
    inputSchema: s.object(
      { category: s.nonEmptyString("The Stormboard template category ID.") },
      { description: "Input for listing Stormboard templates." },
    ),
    outputSchema: s.object(
      { templates: s.looseObject("Templates returned by Stormboard, grouped by source.") },
      { required: ["templates"], description: "Stormboard template list response." },
    ),
  }),
];
