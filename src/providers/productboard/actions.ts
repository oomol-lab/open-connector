import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "productboard";
const entityTypes = [
  "product",
  "component",
  "feature",
  "subfeature",
  "initiative",
  "objective",
  "keyResult",
  "release",
  "releaseGroup",
  "user",
  "company",
];
const noteTypes = ["textNote", "conversationNote", "opportunityNote", "simple", "conversation", "opportunity"];
const memberRoles = ["admin", "maker", "viewer", "contributor"];
const loosePayload = s.object("Productboard JSON object payload.", {}, { additionalProperties: true });
const links = s.object("Productboard links object returned with the response.", {}, { additionalProperties: true });
const fields = s.array(
  "Productboard fields to return. Use all or field IDs from the configuration endpoints.",
  s.nonEmptyString("Productboard field identifier."),
  { minItems: 1 },
);
const pageFields = {
  nextPageCursor: s.nullableString("Opaque Productboard cursor for requesting the next page."),
  nextPageUrl: s.nullable(s.url("Productboard next page URL returned in links.next.")),
  links,
};

export const productboardActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_entity_configurations",
    operationType: "read",
    description: "List Productboard entity configurations available in the workspace.",
    inputSchema: s.object(
      { types: s.array("Optional entity types to include.", s.stringEnum(entityTypes), { minItems: 1 }) },
      { optional: ["types"] },
    ),
    outputSchema: s.object({
      configurations: s.array("Productboard entity configurations.", loosePayload),
      ...pageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_entity_configuration",
    operationType: "read",
    description: "Get the Productboard configuration for one entity type.",
    inputSchema: s.object({ type: s.stringEnum("Productboard entity type to retrieve.", entityTypes) }),
    outputSchema: s.object({ configuration: loosePayload }),
  }),
  defineProviderAction(service, {
    name: "list_entities",
    operationType: "read",
    description: "List Productboard product-management entities with supported filters.",
    inputSchema: s.object(
      {
        pageCursor: s.nonEmptyString("Opaque cursor returned by a previous Productboard list response."),
        types: s.array("Entity types to include.", s.stringEnum(entityTypes), { minItems: 1 }),
        fields,
        name: s.nonEmptyString("Filter entities by name."),
        ownerId: s.nonEmptyString("Filter entities by Productboard owner ID."),
        ownerEmail: s.email("Filter entities by Productboard owner email."),
        statusId: s.nonEmptyString("Filter entities by Productboard status ID."),
        statusName: s.nonEmptyString("Filter entities by Productboard status name."),
        archived: s.boolean("Filter entities by archived status."),
        parentId: s.nonEmptyString("Filter entities by parent entity ID."),
        metadataSourceSystem: s.nonEmptyString("Filter entities by metadata source system name."),
        metadataSourceRecordId: s.nonEmptyString("Filter entities by metadata source record ID."),
      },
      {
        optional: [
          "pageCursor",
          "types",
          "fields",
          "name",
          "ownerId",
          "ownerEmail",
          "statusId",
          "statusName",
          "archived",
          "parentId",
          "metadataSourceSystem",
          "metadataSourceRecordId",
        ],
      },
    ),
    outputSchema: s.object({
      entities: s.array("Productboard entities returned by the API.", loosePayload),
      ...pageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_entity",
    operationType: "read",
    description: "Get a Productboard product-management entity by ID.",
    inputSchema: s.object(
      { id: s.nonEmptyString("Productboard entity identifier."), fields },
      { optional: ["fields"] },
    ),
    outputSchema: s.object({ entity: loosePayload }),
  }),
  defineProviderAction(service, {
    name: "list_note_configurations",
    operationType: "read",
    description: "List Productboard note configurations available in the workspace.",
    inputSchema: s.object(
      { types: s.array("Optional note types to include.", s.stringEnum(noteTypes), { minItems: 1 }) },
      { optional: ["types"] },
    ),
    outputSchema: s.object({
      configurations: s.array("Productboard note configurations.", loosePayload),
      ...pageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_note_configuration",
    operationType: "read",
    description: "Get the Productboard configuration for one note type.",
    inputSchema: s.object({ type: s.stringEnum("Productboard note type to retrieve.", noteTypes) }),
    outputSchema: s.object({ configuration: loosePayload }),
  }),
  defineProviderAction(service, {
    name: "list_notes",
    operationType: "read",
    description: "List Productboard notes with supported filters.",
    inputSchema: s.object(
      {
        pageCursor: s.nonEmptyString("Opaque cursor returned by a previous Productboard list response."),
        archived: s.boolean("Filter notes by archived status."),
        processed: s.boolean("Filter notes by processed status."),
        types: s.array("Note types to include.", s.stringEnum(noteTypes), { minItems: 1 }),
        ownerId: s.nonEmptyString("Filter notes by Productboard owner ID."),
        ownerEmail: s.email("Filter notes by Productboard owner email."),
        creatorId: s.nonEmptyString("Filter notes by Productboard creator ID."),
        creatorEmail: s.email("Filter notes by Productboard creator email."),
        metadataSourceSystem: s.nonEmptyString("Filter notes by metadata source system name."),
        metadataSourceRecordId: s.nonEmptyString("Filter notes by metadata source record ID."),
        createdFrom: s.dateTime("Filter notes created on or after this ISO-8601 timestamp."),
        createdTo: s.dateTime("Filter notes created on or before this ISO-8601 timestamp."),
        updatedFrom: s.dateTime("Filter notes updated on or after this ISO-8601 timestamp."),
        updatedTo: s.dateTime("Filter notes updated on or before this ISO-8601 timestamp."),
        fields,
      },
      {
        optional: [
          "pageCursor",
          "archived",
          "processed",
          "types",
          "ownerId",
          "ownerEmail",
          "creatorId",
          "creatorEmail",
          "metadataSourceSystem",
          "metadataSourceRecordId",
          "createdFrom",
          "createdTo",
          "updatedFrom",
          "updatedTo",
          "fields",
        ],
      },
    ),
    outputSchema: s.object({ notes: s.array("Productboard notes returned by the API.", loosePayload), ...pageFields }),
  }),
  defineProviderAction(service, {
    name: "get_note",
    operationType: "read",
    description: "Get a Productboard note by ID.",
    inputSchema: s.object({ id: s.nonEmptyString("Productboard note identifier."), fields }, { optional: ["fields"] }),
    outputSchema: s.object({ note: loosePayload }),
  }),
  defineProviderAction(service, {
    name: "list_members",
    operationType: "read",
    description: "List Productboard workspace members.",
    inputSchema: s.object(
      {
        pageCursor: s.nonEmptyString("Opaque cursor returned by a previous Productboard list response."),
        query: s.nonEmptyString("Case-insensitive partial match query for member name or email."),
        roles: s.array("Member roles to include.", s.stringEnum(memberRoles), { minItems: 1 }),
        includeDisabled: s.boolean("Whether to include disabled members."),
        includeInvitationPending: s.boolean("Whether to include members with pending invitations."),
      },
      { optional: ["pageCursor", "query", "roles", "includeDisabled", "includeInvitationPending"] },
    ),
    outputSchema: s.object({
      members: s.array("Productboard members returned by the API.", loosePayload),
      ...pageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_member",
    operationType: "read",
    description: "Get a Productboard workspace member by ID.",
    inputSchema: s.object({ id: s.nonEmptyString("Productboard member identifier.") }),
    outputSchema: s.object({ member: loosePayload }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    operationType: "read",
    description: "List Productboard teams.",
    inputSchema: s.object(
      {
        pageCursor: s.nonEmptyString("Opaque cursor returned by a previous Productboard list response."),
        name: s.nonEmptyString("Filter teams by exact name, case-insensitive."),
        handle: s.nonEmptyString("Filter teams by exact handle, case-insensitive."),
        query: s.nonEmptyString("Case-insensitive partial match query for team name or handle."),
      },
      { optional: ["pageCursor", "name", "handle", "query"] },
    ),
    outputSchema: s.object({ teams: s.array("Productboard teams returned by the API.", loosePayload), ...pageFields }),
  }),
  defineProviderAction(service, {
    name: "get_team",
    operationType: "read",
    description: "Get a Productboard team by ID.",
    inputSchema: s.object({ id: s.nonEmptyString("Productboard team identifier.") }),
    outputSchema: s.object({ team: loosePayload }),
  }),
  defineProviderAction(service, {
    name: "list_team_members",
    operationType: "read",
    description: "List members belonging to a Productboard team.",
    inputSchema: s.object(
      {
        teamId: s.nonEmptyString("Productboard team identifier."),
        pageCursor: s.nonEmptyString("Opaque cursor returned by a previous Productboard list response."),
      },
      { optional: ["pageCursor"] },
    ),
    outputSchema: s.object({
      members: s.array("Productboard team members returned by the API.", loosePayload),
      ...pageFields,
    }),
  }),
];
