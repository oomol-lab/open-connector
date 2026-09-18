import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "parma";

const idSchema = (description: string) => s.integer(description);
const pageSchema = s.string("The opaque Parma page value used to request another result page.");
const emptyInputSchema = s.object("No input is required for this Parma action.", {});
const recordSchema = s.looseObject("The resource object returned by Parma.");
const metaSchema = s.looseObject("The pagination metadata returned by Parma.");
const listOutputSchema = s.object(
  "A paginated resource list returned by Parma.",
  {
    data: s.array("The resource records returned by Parma.", recordSchema),
    meta: metaSchema,
  },
  { optional: ["meta"] },
);
const dataOutputSchema = s.object("A single resource response returned by Parma.", {
  data: recordSchema,
});
const deleteOutputSchema = s.object("The deletion acknowledgement returned by the connector.", {
  deleted: s.boolean("Whether Parma accepted the deletion request."),
});
const idInputSchema = s.object("The input payload for loading a Parma resource by ID.", {
  id: idSchema("The Parma resource ID."),
});
const relationshipIdInputSchema = s.object("The input payload for a Parma relationship-scoped action.", {
  relationship_id: idSchema("The Parma relationship ID."),
});
const relationshipGroupInputSchema = s.object("The input payload for changing a Parma relationship group membership.", {
  relationship_id: idSchema("The Parma relationship ID."),
  relationship_group_id: idSchema("The Parma relationship-group membership ID."),
});
const noteFields = {
  datetime: s.string("The note date and time value accepted by Parma."),
  relationship_ids: s.array("The Parma relationship IDs linked to the note.", s.integer("One Parma relationship ID."), {
    minItems: 1,
  }),
  body: s.string("The note body text."),
};
const relationshipFields = {
  name: s.string("The relationship name."),
  type: s.stringEnum("The relationship type.", ["person", "company"] as const),
  company_id: s.integer("The Parma company relationship ID linked to this person."),
  group_ids: s.array("The Parma group IDs assigned to the relationship.", s.integer("One Parma group ID."), {
    minItems: 1,
  }),
  about: s.string("The relationship description or notes."),
};
const relationshipPropertySchema = s.object("A Parma custom relationship property update.", {
  id: s.integer("The Parma custom property ID."),
  value: s.string("The new custom property value."),
});

interface ParmaActionSource {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

function action(input: ParmaActionSource) {
  return defineProviderAction(service, { requiredScopes: [], ...input });
}

export const parmaActions: ActionDefinition[] = [
  action({
    name: "list_deals",
    operationType: "read",
    description: "List deals in the connected Parma workspace.",
    inputSchema: s.object("The input payload for listing Parma deals.", { page: pageSchema }, { optional: ["page"] }),
    outputSchema: listOutputSchema,
  }),
  action({
    name: "get_deal",
    operationType: "read",
    description: "Get a Parma deal by ID.",
    inputSchema: idInputSchema,
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "list_groups",
    operationType: "read",
    description: "List Parma relationship groups, optionally filtered by name.",
    inputSchema: s.object(
      "The input payload for listing Parma groups.",
      { query: s.string("The text used to filter Parma groups.") },
      { optional: ["query"] },
    ),
    outputSchema: listOutputSchema,
  }),
  action({
    name: "list_notes",
    operationType: "read",
    description: "List notes in the connected Parma workspace.",
    inputSchema: s.object("The input payload for listing Parma notes.", { page: pageSchema }, { optional: ["page"] }),
    outputSchema: listOutputSchema,
  }),
  action({
    name: "create_note",
    operationType: "write",
    description: "Create a note linked to one or more Parma relationships.",
    inputSchema: s.object("The input payload for creating a Parma note.", noteFields, {
      optional: ["datetime"],
    }),
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "update_note",
    operationType: "destructive",
    description: "Update a Parma note by ID.",
    inputSchema: s.object(
      "The input payload for updating a Parma note.",
      { id: idSchema("The Parma note ID."), ...noteFields },
      { optional: ["datetime", "relationship_ids", "body"] },
    ),
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "list_pipelines",
    operationType: "read",
    description: "List pipelines in the connected Parma workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema,
  }),
  action({
    name: "get_pipeline",
    operationType: "read",
    description: "Get a Parma pipeline by ID.",
    inputSchema: idInputSchema,
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "list_relationship_groups",
    operationType: "read",
    description: "List groups assigned to a Parma relationship.",
    inputSchema: relationshipIdInputSchema,
    outputSchema: listOutputSchema,
  }),
  action({
    name: "add_relationship_to_group",
    operationType: "write",
    description: "Add a Parma relationship to a group.",
    inputSchema: s.object("The input payload for adding a Parma relationship to a group.", {
      relationship_id: idSchema("The Parma relationship ID."),
      group_id: s.integer("The Parma group ID to assign."),
    }),
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "remove_relationship_from_group",
    operationType: "destructive",
    description: "Remove a Parma relationship from one of its groups.",
    inputSchema: relationshipGroupInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  action({
    name: "list_relationship_notes",
    operationType: "read",
    description: "List notes linked to a Parma relationship.",
    inputSchema: s.object(
      "The input payload for listing a Parma relationship's notes.",
      { relationship_id: idSchema("The Parma relationship ID."), page: pageSchema },
      { optional: ["page"] },
    ),
    outputSchema: listOutputSchema,
  }),
  action({
    name: "list_relationships",
    operationType: "read",
    description: "List and filter relationships in the connected Parma workspace.",
    inputSchema: s.object(
      "The input payload for listing Parma relationships.",
      {
        name: s.string("The relationship name filter."),
        type: s.string("The relationship type filter."),
        page: pageSchema,
        schedulinglink: s.string("The scheduling-link contact detail filter."),
        linkedin: s.string("The LinkedIn contact detail filter."),
        instagram: s.string("The Instagram contact detail filter."),
        twitter: s.string("The Twitter contact detail filter."),
        telegram: s.string("The Telegram contact detail filter."),
        sms: s.string("The SMS contact detail filter."),
        phone: s.string("The phone contact detail filter."),
        whatsapp: s.string("The WhatsApp contact detail filter."),
        email: s.string("The email contact detail filter."),
      },
      {
        optional: [
          "name",
          "type",
          "page",
          "schedulinglink",
          "linkedin",
          "instagram",
          "twitter",
          "telegram",
          "sms",
          "phone",
          "whatsapp",
          "email",
        ],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  action({
    name: "create_relationship",
    operationType: "write",
    description: "Create a person or company relationship in Parma.",
    inputSchema: s.object("The input payload for creating a Parma relationship.", relationshipFields, {
      optional: ["type", "company_id", "about"],
    }),
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "get_relationship",
    operationType: "read",
    description: "Get a Parma relationship by ID.",
    inputSchema: idInputSchema,
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "update_relationship",
    operationType: "write",
    description: "Update a Parma relationship and its custom properties.",
    inputSchema: s.object(
      "The input payload for updating a Parma relationship.",
      {
        id: idSchema("The Parma relationship ID."),
        ...relationshipFields,
        properties: s.array("The custom property values to update.", relationshipPropertySchema),
      },
      { optional: ["name", "type", "company_id", "group_ids", "about", "properties"] },
    ),
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "delete_relationship",
    operationType: "destructive",
    description: "Delete a Parma relationship by ID.",
    inputSchema: idInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  action({
    name: "list_stages",
    operationType: "read",
    description: "List pipeline stages in the connected Parma workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema,
  }),
  action({
    name: "get_stage",
    operationType: "read",
    description: "Get a Parma pipeline stage by ID.",
    inputSchema: idInputSchema,
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "list_users",
    operationType: "read",
    description: "List users in the connected Parma workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema,
  }),
  action({
    name: "get_user",
    operationType: "read",
    description: "Get a Parma user by ID.",
    inputSchema: idInputSchema,
    outputSchema: dataOutputSchema,
  }),
  action({
    name: "get_current_user",
    operationType: "read",
    description: "Get the current Parma user and workspace account.",
    inputSchema: emptyInputSchema,
    outputSchema: dataOutputSchema,
  }),
];
