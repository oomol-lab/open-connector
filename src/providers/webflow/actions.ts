import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "webflow";

const siteIdField = s.nonEmptyString("The unique Webflow site identifier.");
const collectionIdField = s.nonEmptyString("The unique Webflow collection identifier.");
const itemIdField = s.nonEmptyString("The unique Webflow CMS item identifier.");
const localeIdField = s.nonEmptyString("The unique Webflow CMS locale identifier.");
const fieldDataInputSchema = s.looseObject(
  "CMS field values keyed by Webflow field slug. Include the fields required by the collection.",
);
const rawObjectSchema = s.looseObject("Raw object data returned by Webflow.");

const paginationOutputSchema = s.object("Pagination metadata returned by Webflow.", {
  limit: s.nullable(s.integer("Maximum number of records returned by Webflow.")),
  offset: s.nullable(s.integer("Number of records skipped by Webflow.")),
  total: s.nullable(s.integer("Total number of records available when returned by Webflow.")),
});

const siteSchema = s.looseRequiredObject("A Webflow site summary.", {
  id: s.string("The unique site identifier."),
  displayName: s.nullable(s.string("The site display name.")),
  shortName: s.nullable(s.string("The site short name.")),
  previewUrl: s.nullable(s.string("The site preview image URL when returned by Webflow.")),
  workspaceId: s.nullable(s.string("The workspace identifier that owns the site.")),
  lastPublished: s.nullable(s.string("The most recent publish timestamp when returned.")),
  lastUpdated: s.nullable(s.string("The most recent update timestamp when returned.")),
});

const collectionSchema = s.looseRequiredObject("A Webflow CMS collection summary.", {
  id: s.string("The unique collection identifier."),
  displayName: s.nullable(s.string("The collection display name.")),
  singularName: s.nullable(s.string("The singular collection item name.")),
  slug: s.nullable(s.string("The collection URL slug.")),
  lastUpdated: s.nullable(s.string("The most recent update timestamp when returned.")),
});

const collectionFieldSchema = s.looseRequiredObject("A Webflow CMS collection field summary.", {
  id: s.string("The unique collection field identifier."),
  displayName: s.nullable(s.string("The field display name.")),
  slug: s.nullable(s.string("The field slug used in fieldData.")),
  type: s.nullable(s.string("The Webflow field type.")),
  required: s.nullable(s.boolean("Whether Webflow marks the field as required.")),
});

const cmsItemSchema = s.looseRequiredObject("A Webflow CMS item.", {
  id: s.string("The unique CMS item identifier."),
  cmsLocaleId: s.nullable(s.string("The CMS locale identifier for this item.")),
  lastPublished: s.nullable(s.string("The most recent publish timestamp when returned.")),
  lastUpdated: s.nullable(s.string("The most recent update timestamp when returned.")),
  createdOn: s.nullable(s.string("The creation timestamp when returned.")),
  isArchived: s.nullable(s.boolean("Whether the item is archived.")),
  isDraft: s.nullable(s.boolean("Whether the item is a draft.")),
  fieldData: rawObjectSchema,
});

const publishResultSchema = s.looseRequiredObject("The Webflow publish response.", {
  publishedItemIds: s.array(
    "CMS item identifiers that Webflow reported as published.",
    s.string("A published CMS item identifier."),
  ),
  errors: s.array("Publish errors returned by Webflow.", rawObjectSchema),
});

export const webflowActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sites",
    description: "List Webflow sites available to the connected token.",
    inputSchema: s.actionInput({}, [], "No input is required to list Webflow sites."),
    outputSchema: s.actionOutput(
      {
        sites: s.array("Webflow sites returned by the API.", siteSchema),
      },
      "Sites available to the connected Webflow token.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_site",
    description: "Get details for a single Webflow site.",
    inputSchema: s.actionInput(
      {
        siteId: siteIdField,
      },
      ["siteId"],
      "Input parameters for fetching a Webflow site.",
    ),
    outputSchema: s.actionOutput(
      {
        site: siteSchema,
      },
      "The requested Webflow site.",
    ),
  }),
  defineProviderAction(service, {
    name: "publish_site",
    description:
      "Publish a Webflow site to all domains or selected custom domains and return Webflow's publish result.",
    inputSchema: s.actionInput(
      {
        siteId: siteIdField,
        customDomains: s.array(
          "Optional custom domain identifiers to publish. Omit to publish all domains.",
          s.nonEmptyString("A Webflow custom domain identifier."),
          { minItems: 1 },
        ),
        publishToWebflowSubdomain: s.boolean("Whether to publish to the default Webflow subdomain."),
      },
      ["siteId"],
      "Input parameters for publishing a Webflow site.",
    ),
    outputSchema: s.actionOutput(
      {
        result: rawObjectSchema,
      },
      "The normalized Webflow site publish result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    description: "List CMS collections for a Webflow site.",
    inputSchema: s.actionInput(
      {
        siteId: siteIdField,
      },
      ["siteId"],
      "Input parameters for listing Webflow CMS collections.",
    ),
    outputSchema: s.actionOutput(
      {
        collections: s.array("CMS collections for the site.", collectionSchema),
      },
      "CMS collections returned by Webflow.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    description: "Get a Webflow CMS collection including its field definitions.",
    inputSchema: s.actionInput(
      {
        collectionId: collectionIdField,
      },
      ["collectionId"],
      "Input parameters for fetching a Webflow CMS collection.",
    ),
    outputSchema: s.actionOutput(
      {
        collection: collectionSchema,
        fields: s.array("CMS fields defined on the collection.", collectionFieldSchema),
      },
      "The requested CMS collection and field definitions.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_collection_items",
    description: "List items in a Webflow CMS collection.",
    inputSchema: s.actionInput(
      {
        collectionId: collectionIdField,
        limit: s.integer("Maximum number of records to return.", { minimum: 1, maximum: 100 }),
        offset: s.integer("Number of records to skip before returning results.", { minimum: 0 }),
      },
      ["collectionId"],
      "Input parameters for listing Webflow CMS collection items.",
    ),
    outputSchema: s.actionOutput(
      {
        items: s.array("CMS items in the collection.", cmsItemSchema),
        pagination: paginationOutputSchema,
      },
      "CMS items returned by Webflow.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_collection_item",
    description: "Get a single item from a Webflow CMS collection.",
    inputSchema: s.actionInput(
      {
        collectionId: collectionIdField,
        itemId: itemIdField,
        cmsLocaleId: localeIdField,
      },
      ["collectionId", "itemId"],
      "Input parameters for fetching a Webflow CMS collection item.",
    ),
    outputSchema: s.actionOutput(
      {
        item: cmsItemSchema,
      },
      "The requested CMS item.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_collection_item",
    description: "Create a draft or live item in a Webflow CMS collection.",
    inputSchema: s.actionInput(
      {
        collectionId: collectionIdField,
        fieldData: fieldDataInputSchema,
        isArchived: s.boolean("Whether the new item should be archived."),
        isDraft: s.boolean("Whether the new item should remain a draft."),
        cmsLocaleId: localeIdField,
        live: s.boolean("Whether to create the item on the live site."),
      },
      ["collectionId", "fieldData"],
      "Input parameters for creating a Webflow CMS collection item.",
    ),
    outputSchema: s.actionOutput(
      {
        item: cmsItemSchema,
      },
      "The created CMS item.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_collection_item",
    description: "Update a draft or live item in a Webflow CMS collection.",
    inputSchema: s.actionInput(
      {
        collectionId: collectionIdField,
        itemId: itemIdField,
        fieldData: fieldDataInputSchema,
        isArchived: s.boolean("Whether the item should be archived."),
        isDraft: s.boolean("Whether the item should remain a draft."),
        cmsLocaleId: localeIdField,
        live: s.boolean("Whether to update the item on the live site."),
      },
      ["collectionId", "itemId", "fieldData"],
      "Input parameters for updating a Webflow CMS collection item.",
    ),
    outputSchema: s.actionOutput(
      {
        item: cmsItemSchema,
      },
      "The updated CMS item.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_collection_item",
    description: "Delete a draft CMS item from a Webflow collection.",
    inputSchema: s.actionInput(
      {
        collectionId: collectionIdField,
        itemId: itemIdField,
      },
      ["collectionId", "itemId"],
      "Input parameters for deleting a Webflow CMS collection item.",
    ),
    outputSchema: s.actionOutput(
      {
        itemId: itemIdField,
        deleted: s.boolean("Whether the connector completed the delete request."),
      },
      "The deleted CMS item identifier.",
    ),
  }),
  defineProviderAction(service, {
    name: "publish_collection_items",
    description: "Publish one or more Webflow CMS collection items.",
    inputSchema: s.actionInput(
      {
        collectionId: collectionIdField,
        itemIds: s.array(
          "Collection item identifiers to publish.",
          s.nonEmptyString("A Webflow CMS item identifier."),
          {
            minItems: 1,
          },
        ),
      },
      ["collectionId", "itemIds"],
      "Input parameters for publishing Webflow CMS collection items.",
    ),
    outputSchema: s.actionOutput(
      {
        result: publishResultSchema,
      },
      "The normalized CMS item publish result.",
    ),
  }),
];

export type WebflowActionName = (typeof webflowActions)[number]["name"];
