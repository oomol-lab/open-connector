import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "firstbase";

export type FirstbaseActionName =
  | "list_inventory"
  | "get_inventory"
  | "list_catalog_skus"
  | "get_catalog_sku"
  | "list_brands"
  | "list_categories";

const pageSchema = s.positiveInteger("The 1-based page number to request.");
const sizeSchema = s.positiveInteger("The number of results to return in a page.");
const cappedSizeSchema = s.integer("The number of results to return in a page, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const firstbaseDateTimeSchema = s.nonEmptyString("UTC date-time in Firstbase's documented ISO 8601-compatible format.");

const deployStatusSchema = s.stringEnum("A supported Firstbase inventory deployment status.", [
  "ARCHIVED",
  "AVAILABLE",
  "AWAITING_ARRIVAL",
  "DEPLOYED",
  "ON_HOLD",
  "UNAVAILABLE",
  "VOIDED",
]);

const sortBySchema = s.stringEnum("Field to sort inventory by.", [
  "product",
  "skuId",
  "createdAt",
  "updatedAt",
  "serialNumber",
  "deployStatus",
  "deployReason",
  "assignee",
  "condition",
  "renewalDate",
  "category",
  "suppliedBy",
]);

const sortDirectionSchema = s.stringEnum("Direction for inventory sorting.", ["ASC", "DESC"]);

const listInventoryInputSchema = {
  ...s.object(
    "Input parameters for listing Firstbase inventory.",
    {
      page: pageSchema,
      size: sizeSchema,
      personId: s.nonEmptyString("ID of the person to which inventory is assigned."),
      warehouseId: s.nonEmptyString("ID of the warehouse to which inventory is assigned."),
      officeId: s.nonEmptyString("ID of the office to which inventory is assigned."),
      categories: s.stringArray("Category codes to filter by.", {
        minItems: 1,
        itemDescription: "A Firstbase category code.",
      }),
      deployStatuses: s.array(
        "Deployment statuses to filter by. Deprecated statuses rejected by Firstbase are not accepted.",
        deployStatusSchema,
        { minItems: 1 },
      ),
      skuIds: s.array("SKU IDs to filter by.", s.uuid("A Firstbase SKU ID."), { minItems: 1 }),
      searchString: s.nonEmptyString(
        "Keyword that searches description, manufacturer, category, title, and serial number.",
      ),
      updatedAtFrom: firstbaseDateTimeSchema,
      updatedAtTo: firstbaseDateTimeSchema,
      assignedEmail: s.email("Email address of the person to which inventory is assigned."),
      serialNumber: s.stringArray("Inventory serial numbers to filter by.", {
        minItems: 1,
        itemDescription: "A Firstbase inventory serial number.",
      }),
      vendorSku: s.stringArray("Vendor SKUs to filter by.", {
        minItems: 1,
        itemDescription: "A vendor SKU.",
      }),
      sortBy: sortBySchema,
      sortDirection: sortDirectionSchema,
    },
    {
      optional: [
        "page",
        "size",
        "personId",
        "warehouseId",
        "officeId",
        "categories",
        "deployStatuses",
        "skuIds",
        "searchString",
        "updatedAtFrom",
        "updatedAtTo",
        "assignedEmail",
        "serialNumber",
        "vendorSku",
        "sortBy",
        "sortDirection",
      ],
    },
  ),
  not: {
    required: ["personId", "assignedEmail"],
  },
};

const getInventoryInputSchema = s.object("Input parameters for retrieving one inventory item.", {
  inventoryId: s.uuid("The Firstbase inventory ID to retrieve."),
});

const listCatalogSkusInputSchema = s.object(
  "Input parameters for listing Firstbase catalog SKUs.",
  {
    page: pageSchema,
    size: sizeSchema,
    categories: s.stringArray("Category codes to filter by.", {
      minItems: 1,
      itemDescription: "A Firstbase category code.",
    }),
  },
  { optional: ["page", "size", "categories"] },
);

const getCatalogSkuInputSchema = s.object("Input parameters for retrieving one catalog SKU.", {
  skuId: s.uuid("The Firstbase SKU ID to retrieve."),
});

const metadataListInputSchema = s.object(
  "Input parameters for listing Firstbase metadata records.",
  {
    page: pageSchema,
    size: cappedSizeSchema,
    code: s.nonEmptyString("Filter by an exact Firstbase code."),
    name: s.nonEmptyString("Filter by a case-insensitive partial name match."),
    active: s.boolean("Whether to return active metadata records."),
  },
  { optional: ["page", "size", "code", "name", "active"] },
);

const firstbaseMetadataSchema = s.looseObject("A Firstbase metadata record.", {
  id: s.string("Unique identifier returned by Firstbase."),
  code: s.string("Code returned by Firstbase."),
  name: s.string("Human-readable name returned by Firstbase."),
  active: s.boolean("Whether Firstbase reports the record as active."),
});

const inventorySchema = s.looseObject(
  "A Firstbase inventory item with stable key fields and remaining upstream fields preserved.",
  {
    id: s.uuid("Unique identifier for this inventory item."),
    skuId: s.uuid("The SKU ID this inventory item is associated with."),
    serialNumber: s.nullable(s.string("Hardware serial number of the device.")),
    imei: s.array("IMEI values associated with the inventory item.", s.string("An IMEI value.")),
    deployStatus: s.string("Current lifecycle state of the inventory item."),
    deployReason: s.nullable(s.string("Reason code for the current deploy status.")),
    condition: s.string("Physical condition of the inventory item."),
    categoryCode: s.string("Category code of the inventory item's SKU."),
    categoryNameOfSku: s.string("Human-readable category name for the SKU."),
    skuTitle: s.string("Display title of the SKU."),
    vendorCode: s.string("Vendor or brand code for the SKU."),
    vendorSku: s.string("Vendor-specific SKU or model identifier."),
    createdAt: s.string("Timestamp when this inventory item was created in Firstbase."),
    updatedAt: s.string("Timestamp when this inventory item was last updated."),
    tags: s.array("Key-value tags attached to this inventory item.", s.looseObject("A Firstbase inventory tag.")),
  },
);

const skuSchema = s.looseObject(
  "A Firstbase catalog SKU with stable key fields and remaining upstream fields preserved.",
  {
    id: s.uuid("Firstbase internal SKU ID."),
    imageUrl: s.string("Presigned URL for the product image."),
    title: s.string("SKU title."),
    vendorSku: s.string("Vendor SKU value."),
    vendorCode: s.string("Vendor code."),
    partNumber: s.string("SKU part number."),
    isStandardCatalog: s.boolean("Whether the SKU is part of the organization's standard catalog."),
    metadata: s.record("Structured SKU metadata returned by Firstbase.", s.unknown("A metadata value.")),
    pricing: s.array("Pricing details for the SKU.", s.looseObject("A Firstbase SKU pricing record.")),
    stock: s.array("Regions where this SKU is available.", s.looseObject("A Firstbase SKU stock record.")),
    categoryCode: s.string("Category code for the SKU."),
    categoryNameOfSku: s.string("Category name for the SKU."),
  },
);

const pageFields = {
  pageNumber: s.integer("Current 1-based page number returned by Firstbase."),
  size: s.integer("Maximum number of items per page returned by Firstbase."),
  totalElements: s.integer("Total number of items matching the query across all pages."),
  totalPages: s.integer("Total number of pages returned by Firstbase."),
};

export const firstbaseActions: Array<ProviderActionDefinition<FirstbaseActionName>> = [
  defineProviderAction(service, {
    name: "list_inventory",
    description: "List inventory items owned by the authenticated Firstbase organization.",
    inputSchema: listInventoryInputSchema,
    outputSchema: s.object("A Firstbase inventory list response.", {
      inventory: s.array("Inventory items returned by Firstbase.", inventorySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_inventory",
    description: "Get one inventory item by Firstbase inventory ID.",
    inputSchema: getInventoryInputSchema,
    outputSchema: s.object("A Firstbase inventory item response.", {
      inventory: inventorySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_catalog_skus",
    description: "List catalog SKUs available to the authenticated Firstbase organization.",
    inputSchema: listCatalogSkusInputSchema,
    outputSchema: s.object("A Firstbase catalog SKU list response.", {
      skus: s.array("Catalog SKUs returned by Firstbase.", skuSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_catalog_sku",
    description: "Get one catalog SKU by Firstbase SKU ID.",
    inputSchema: getCatalogSkuInputSchema,
    outputSchema: s.object("A Firstbase catalog SKU response.", {
      sku: skuSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_brands",
    description: "List brands available for Firstbase asset creation.",
    inputSchema: metadataListInputSchema,
    outputSchema: s.object("A normalized Firstbase brands page.", {
      brands: s.array("Brands returned by Firstbase.", firstbaseMetadataSchema),
      ...pageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List product categories available for Firstbase asset creation.",
    inputSchema: metadataListInputSchema,
    outputSchema: s.object("A normalized Firstbase categories page.", {
      categories: s.array("Categories returned by Firstbase.", firstbaseMetadataSchema),
      ...pageFields,
    }),
  }),
];
