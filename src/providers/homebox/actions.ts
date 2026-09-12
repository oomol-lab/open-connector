import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "homebox";

const emptyInputSchema = s.actionInput({}, [], "No input is required for this action.");

const entityIdInput = { entityId: s.nonEmptyString("The entity UUID returned by HomeBox.") };

const entityOutput = s.unknownObject("The entity as returned by HomeBox.");

const attachmentTypeSchema = s.stringEnum("The attachment type.", [
  "photo",
  "manual",
  "warranty",
  "attachment",
  "receipt",
  "thumbnail",
]);

const maintenanceStatusSchema = s.stringEnum("Which maintenance entries to include.", [
  "scheduled",
  "completed",
  "both",
]);

const customFieldSchema = s.anyOf(
  "One custom field attached to the entity. The value property must match the declared type.",
  [
    s.requiredObject("A text custom field.", {
      name: s.nonEmptyString("The field name, for example Color or Serial."),
      type: s.stringEnum("The field type.", ["text"]),
      textValue: s.string("The text value."),
    }),
    s.requiredObject("A numeric custom field.", {
      name: s.nonEmptyString("The field name, for example Color or Serial."),
      type: s.stringEnum("The field type.", ["number"]),
      numberValue: s.integer("The numeric value."),
    }),
    s.requiredObject("A boolean custom field.", {
      name: s.nonEmptyString("The field name, for example Color or Serial."),
      type: s.stringEnum("The field type.", ["boolean"]),
      booleanValue: s.boolean("The boolean value."),
    }),
    s.requiredObject("A time custom field. HomeBox stores the timestamp server-side, so no value property is sent.", {
      name: s.nonEmptyString("The field name, for example Color or Serial."),
      type: s.stringEnum("The field type.", ["time"]),
    }),
  ],
);

const dateSchema = s.string("A date in YYYY-MM-DD format.", { pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export const homeBoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_status",
    description: "Fetch the HomeBox instance status: health, version, and whether registration is open.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { summary: s.unknownObject("The HomeBox status payload returned by the instance.") },
      "The HomeBox instance status.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_entities",
    description: "Search HomeBox entities with optional text search, pagination, and tag/parent filters.",
    inputSchema: s.actionInput(
      {
        q: s.string("Free-text search string."),
        page: s.integer("Page number, starting at 1."),
        pageSize: s.integer("Maximum number of entities per page."),
        tagIds: s.array("Only entities carrying any of these tag UUIDs.", s.string("One tag UUID.")),
        parentIds: s.array(
          "Only entities under any of these parent entity UUIDs.",
          s.string("One parent entity UUID."),
        ),
      },
      [],
      "Input parameters for searching HomeBox entities.",
    ),
    outputSchema: s.actionOutput(
      {
        items: s.array("The matching entity summaries.", s.looseObject("One HomeBox entity summary.")),
        page: s.integer("The current page number."),
        pageSize: s.integer("The page size used by the instance."),
        total: s.integer("The total number of matching entities."),
      },
      "The matching HomeBox entities.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_entity",
    description: "Fetch one HomeBox entity with its full details, including attachments and custom fields.",
    inputSchema: s.actionInput(entityIdInput, ["entityId"], "Input parameters for fetching one entity."),
    outputSchema: s.actionOutput({ entity: entityOutput }, "The requested HomeBox entity."),
  }),
  defineProviderAction(service, {
    name: "create_entity",
    description: "Create a new HomeBox entity with a name and optional type, parent, description, and tags.",
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("The entity name."),
        entityTypeId: s.string(
          "The UUID of the entity type the entity belongs to. HomeBox entities are typed, so pass one or the create request may fail.",
        ),
        parentId: s.string("The UUID of a parent entity, for nested entities."),
        description: s.string("An optional description."),
        quantity: s.integer("The quantity."),
        tagIds: s.array("The UUIDs of tags to attach.", s.string("One tag UUID.")),
      },
      ["name"],
      "Input parameters for creating one HomeBox entity.",
    ),
    outputSchema: s.actionOutput({ entity: entityOutput }, "The created HomeBox entity."),
  }),
  defineProviderAction(service, {
    name: "update_entity",
    description:
      "Update one HomeBox entity. Only the provided fields change; all other entity data (serial number, warranty, custom fields, ...) is preserved. Custom fields are replaced as a whole when fields is provided.",
    inputSchema: s.actionInput(
      {
        entityId: s.nonEmptyString("The entity UUID to update."),
        name: s.nonEmptyString("The entity name."),
        description: s.nullableString("The entity description; pass null to clear it."),
        quantity: s.integer("The quantity."),
        insured: s.boolean("Whether the entity is insured."),
        archived: s.boolean("Whether the entity is archived."),
        entityTypeId: s.string("The entity type UUID; when omitted the current type is kept."),
        tagIds: s.array("The tag UUIDs.", s.string("One tag UUID.")),
        parentId: s.nullableString("The parent entity UUID, or null to unset it."),
        serialNumber: s.string("The serial number."),
        modelNumber: s.string("The model number."),
        manufacturer: s.string("The manufacturer."),
        lifetimeWarranty: s.boolean("Whether the entity has a lifetime warranty."),
        warrantyExpires: dateSchema,
        warrantyDetails: s.string("Warranty details."),
        purchaseDate: dateSchema,
        purchaseFrom: s.string("Where the entity was purchased."),
        purchasePrice: s.number("The purchase price."),
        soldDate: dateSchema,
        soldTo: s.string("Who the entity was sold to."),
        soldPrice: s.number("The sale price."),
        soldNotes: s.string("Notes about the sale."),
        notes: s.string("Free-form entity notes."),
        syncChildEntityLocations: s.boolean("Recursively apply type changes to child entities."),
        fields: s.array("The custom fields to set; replaces all existing fields.", customFieldSchema),
      },
      ["entityId"],
      "Input parameters for updating one HomeBox entity.",
    ),
    outputSchema: s.actionOutput({ entity: entityOutput }, "The updated HomeBox entity."),
  }),
  defineProviderAction(service, {
    name: "delete_entity",
    description: "Delete one HomeBox entity.",
    inputSchema: s.actionInput(entityIdInput, ["entityId"], "Input parameters for deleting one entity."),
    outputSchema: s.actionOutput({ deleted: s.boolean("Whether the entity was deleted.") }, "The deletion result."),
  }),
  defineProviderAction(service, {
    name: "list_entity_types",
    description: "List all HomeBox entity types, including location-flagged types.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        entityTypes: s.array("The entity types.", s.looseObject("One HomeBox entity type.")),
      },
      "The HomeBox entity types.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_entity_type",
    description: "Create a new HomeBox entity type, optionally flagged as a location.",
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("The entity type name."),
        description: s.string("An optional description."),
        icon: s.string("An icon identifier for the type."),
        isLocation: s.boolean("Whether this type represents a location."),
      },
      ["name"],
      "Input parameters for creating one HomeBox entity type.",
    ),
    outputSchema: s.actionOutput(
      { entityType: s.looseObject("The created HomeBox entity type.") },
      "The created HomeBox entity type.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_entity_type",
    description: "Delete one HomeBox entity type.",
    inputSchema: s.actionInput(
      { entityTypeId: s.nonEmptyString("The entity type UUID to delete.") },
      ["entityTypeId"],
      "Input parameters for deleting one HomeBox entity type.",
    ),
    outputSchema: s.actionOutput(
      { deleted: s.boolean("Whether the entity type was deleted.") },
      "The deletion result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List all HomeBox tags.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { tags: s.array("The tags.", s.looseObject("One HomeBox tag.")) },
      "The HomeBox tags.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a new HomeBox tag.",
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("The tag name."),
        description: s.string("An optional description."),
        color: s.string("A tag color, for example #ff0000."),
        icon: s.string("An icon identifier for the tag."),
        parentId: s.string("The UUID of a parent tag, for nested tags."),
      },
      ["name"],
      "Input parameters for creating one HomeBox tag.",
    ),
    outputSchema: s.actionOutput({ tag: s.looseObject("The created HomeBox tag.") }, "The created HomeBox tag."),
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete one HomeBox tag.",
    inputSchema: s.actionInput(
      { tagId: s.nonEmptyString("The tag UUID to delete.") },
      ["tagId"],
      "Input parameters for deleting one HomeBox tag.",
    ),
    outputSchema: s.actionOutput({ deleted: s.boolean("Whether the tag was deleted.") }, "The deletion result."),
  }),
  defineProviderAction(service, {
    name: "get_group_statistics",
    description:
      "Fetch the HomeBox group dashboard statistics: total entities, locations, tags, price, and warranties.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { statistics: s.unknownObject("The HomeBox group statistics payload.") },
      "The HomeBox group statistics.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_entity_attachment",
    description:
      "Attach a file (photo or document) to one HomeBox entity. The file type is detected from the extension when omitted.",
    inputSchema: s.actionInput(
      {
        entityId: s.nonEmptyString("The entity UUID to attach the file to."),
        file: s.transitFile("The file to attach."),
        type: attachmentTypeSchema,
        name: s.string("Override the stored file name, including the extension."),
        primary: s.boolean("Mark this photo as the entity's primary image."),
      },
      ["entityId", "file"],
      "Input parameters for attaching one file to an entity.",
    ),
    outputSchema: s.actionOutput({ entity: entityOutput }, "The HomeBox entity with the new attachment."),
  }),
  defineProviderAction(service, {
    name: "get_maintenance_log",
    description: "Fetch the maintenance log of one HomeBox entity, optionally filtered by status.",
    inputSchema: s.actionInput(
      {
        entityId: s.nonEmptyString("The entity UUID."),
        status: maintenanceStatusSchema,
      },
      ["entityId"],
      "Input parameters for fetching one maintenance log.",
    ),
    outputSchema: s.actionOutput(
      { entries: s.array("The maintenance entries.", s.looseObject("One maintenance entry.")) },
      "The HomeBox maintenance log.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_maintenance_entry",
    description:
      "Add a maintenance entry (repair, inspection, scheduled service) to one HomeBox entity. Provide completedDate, scheduledDate, or both.",
    inputSchema: s.actionInput(
      {
        entityId: s.nonEmptyString("The entity UUID."),
        name: s.nonEmptyString("The maintenance entry name, for example Air filter replacement."),
        completedDate: dateSchema,
        scheduledDate: dateSchema,
        description: s.string("An optional description of the maintenance work."),
        cost: s.string("The maintenance cost as a number string, for example 1500."),
      },
      ["entityId", "name"],
      "Input parameters for adding one maintenance entry.",
    ),
    outputSchema: s.actionOutput(
      { entry: s.looseObject("The created maintenance entry.") },
      "The created HomeBox maintenance entry.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_custom_field_names",
    description: "List the custom field names in use across the HomeBox group.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { names: s.array("The custom field names.", s.string("One custom field name.")) },
      "The HomeBox custom field names.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_custom_field_values",
    description: "List the values in use for one custom field name across the HomeBox group.",
    inputSchema: s.actionInput(
      { field: s.nonEmptyString("The custom field name, for example Color.") },
      ["field"],
      "Input parameters for listing one custom field's values.",
    ),
    outputSchema: s.actionOutput(
      { values: s.array("The custom field values.", s.string("One custom field value.")) },
      "The HomeBox custom field values.",
    ),
  }),
];
