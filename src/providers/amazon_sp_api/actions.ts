import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "amazon_sp_api";
const marketplaceIds = s.stringArray("Amazon marketplace IDs in the connected region.", {
  minItems: 1,
  itemDescription: "An Amazon marketplace ID.",
});
const singleMarketplaceIds = s.stringArray("The single Amazon marketplace ID for this request.", {
  minItems: 1,
  maxItems: 1,
  itemDescription: "An Amazon marketplace ID.",
});
const sellerId = s.nonEmptyString("Seller ID. Defaults to the seller authorized by this connection.");
const sku = s.nonEmptyString("The seller-provided listing SKU, including any special characters.");
const issueLocale = s.string("Locale for issue messages, such as en_US. Defaults to the marketplace language.");
const pageSize = s.integer("Results per page, at most 20. Amazon defaults to 10.", { maximum: 20 });
const pageToken = s.string("A nextToken or previousToken from the preceding search response.");
const identifiers = s.stringArray("Product identifiers to search for. Requires identifiersType.", {
  minItems: 1,
  maxItems: 20,
  itemDescription: "A product identifier of the selected type.",
});
const catalogIncludedData = s.array(
  "Catalog datasets to return. Amazon defaults to summaries; vendorDetails requires vendor access.",
  s.stringEnum("A catalog dataset.", [
    "attributes",
    "classifications",
    "dimensions",
    "identifiers",
    "images",
    "productTypes",
    "relationships",
    "salesRanks",
    "summaries",
    "vendorDetails",
  ]),
);
const listingsIncludedData = s.array(
  "Listing datasets to return. Amazon defaults to summaries.",
  s.stringEnum("A listing dataset.", [
    "summaries",
    "attributes",
    "issues",
    "offers",
    "fulfillmentAvailability",
    "procurement",
    "relationships",
    "productTypes",
  ]),
);
const submissionFields = {
  sellerId,
  sku,
  marketplaceIds: singleMarketplaceIds,
  issueLocale,
  productType: s.nonEmptyString("Amazon product type for the listing, as defined by the Product Type Definitions API."),
  mode: s.stringEnum("Use VALIDATION_PREVIEW to validate without saving. Omit to submit changes.", [
    "VALIDATION_PREVIEW",
  ]),
  includedData: s.array(
    "Submission datasets to return. Amazon defaults to issues; identifiers requires VALIDATION_PREVIEW mode.",
    s.stringEnum("A submission dataset.", ["identifiers", "issues"]),
  ),
};
const previewConstraint = {
  if: {
    required: ["includedData"],
    properties: { includedData: { contains: { const: "identifiers" } } },
  },
  then: { required: ["mode"] },
};
const pagination = s.looseObject("Tokens for subsequent result pages.", {
  nextToken: s.string("Token for the next page; absent on the last page."),
  previousToken: s.string("Token for the previous page when available."),
});
const errors = s.array(
  "Errors returned by Amazon.",
  s.looseObject("An Amazon API error.", {
    code: s.string("Amazon error code."),
    message: s.string("Amazon error message."),
    details: s.string("Additional error details."),
  }),
);
const catalogItem = s.looseObject(
  "Amazon catalog item and requested datasets.",
  {
    asin: s.string("The Amazon Standard Identification Number."),
    attributes: s.looseObject("Product-type-specific item attributes.", {}),
    classifications: s.array(
      "Browse classifications by marketplace.",
      s.looseObject("Marketplace classifications.", {}),
    ),
    dimensions: s.array("Item dimensions by marketplace.", s.looseObject("Marketplace dimensions.", {})),
    identifiers: s.array("Item identifiers by marketplace.", s.looseObject("Marketplace identifiers.", {})),
    images: s.array("Item images by marketplace.", s.looseObject("Marketplace images.", {})),
    productTypes: s.array("Product types by marketplace.", s.looseObject("Marketplace product types.", {})),
    relationships: s.array("Item relationships by marketplace.", s.looseObject("Marketplace relationships.", {})),
    salesRanks: s.array("Sales ranks by marketplace.", s.looseObject("Marketplace sales ranks.", {})),
    summaries: s.array("Item summaries by marketplace.", s.looseObject("Marketplace item summary.", {})),
    vendorDetails: s.array("Vendor details by marketplace.", s.looseObject("Marketplace vendor details.", {})),
  },
  { required: ["asin"] },
);
const listingItem = s.looseObject(
  "Seller listing and requested datasets.",
  {
    sku: s.string("The seller-provided listing SKU."),
    summaries: s.array("Listing summaries by marketplace.", s.looseObject("Marketplace listing summary.", {})),
    attributes: s.looseObject("Latest submitted product-type-specific listing attributes.", {}),
    issues: s.array("Listing processing issues.", s.looseObject("A listing issue.", {})),
    offers: s.array("Current listing offers.", s.looseObject("A listing offer.", {})),
    fulfillmentAvailability: s.array(
      "Live fulfillment availability for this listing.",
      s.looseObject("Fulfillment availability.", {}),
    ),
    procurement: s.array("Vendor procurement information.", s.looseObject("Procurement information.", {})),
    relationships: s.array(
      "Listing relationships by marketplace.",
      s.looseObject("Marketplace listing relationships.", {}),
    ),
    productTypes: s.array(
      "Listing product types by marketplace.",
      s.looseObject("Marketplace listing product types.", {}),
    ),
  },
  { required: ["sku"] },
);
const submission = s.looseObject(
  "Amazon listing submission result. ACCEPTED means processing was accepted, not that publication is complete.",
  {
    sku: s.string("The seller-provided listing SKU."),
    status: s.string("Submission status: ACCEPTED, INVALID, or VALID for a successful validation preview."),
    submissionId: s.string("The submission identifier assigned by Amazon."),
    issues: s.array(
      "Issues found while accepting or validating the submission.",
      s.looseObject("A submission issue.", {}),
    ),
    identifiers: s.array(
      "Catalog identifiers returned for validation previews when requested.",
      s.looseObject("Catalog identifiers for a marketplace.", {}),
    ),
  },
  { required: ["sku", "status", "submissionId"] },
);

export const amazonSpApiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_marketplace_participations",
    operationType: "read",
    description: "List the connected seller's Amazon marketplaces and participation status in the connected region.",
    requiredScopes: [],
    inputSchema: s.requiredObject("No input fields are required.", {}),
    outputSchema: s.looseObject(
      "Amazon marketplace participation response.",
      {
        payload: s.array(
          "Marketplaces and seller participation details.",
          s.looseObject("Seller participation in one marketplace.", {
            marketplace: s.looseObject("Marketplace identity, country, language, and currency.", {}),
            participation: s.looseObject("Participation and listing-suspension status.", {}),
            storeName: s.string("Seller store name displayed in this marketplace."),
          }),
        ),
        errors,
      },
      { required: ["payload"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_catalog_items",
    operationType: "read",
    description:
      "Search the Amazon catalog by product identifiers or keywords. Search pagination exposes at most 1,000 matching ASINs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Catalog search parameters.",
      {
        marketplaceIds: singleMarketplaceIds,
        identifiers,
        identifiersType: s.stringEnum("Identifier type. SKU uses sellerId or the connected seller.", [
          "ASIN",
          "EAN",
          "GTIN",
          "ISBN",
          "JAN",
          "MINSAN",
          "SKU",
          "UPC",
        ]),
        sellerId,
        keywords: s.stringArray("Search keywords. Cannot be combined with identifiers.", {
          minItems: 1,
          maxItems: 20,
          itemDescription: "A search keyword.",
        }),
        brandNames: s.stringArray("Brand filters for keyword searches only.", {
          itemDescription: "A brand name.",
        }),
        classificationIds: s.stringArray("Browse classification filters for keyword searches only.", {
          itemDescription: "A classification ID.",
        }),
        keywordsLocale: s.string("Keyword language locale. Cannot be combined with identifiers."),
        includedData: catalogIncludedData,
        locale: s.string("Locale for localized item summaries. Defaults to the marketplace locale."),
        pageSize,
        pageToken,
      },
      {
        required: ["marketplaceIds"],
        dependentRequired: { identifiers: ["identifiersType"] },
        allOf: [
          { not: { required: ["identifiers", "keywords"] } },
          { not: { required: ["identifiers", "brandNames"] } },
          { not: { required: ["identifiers", "classificationIds"] } },
          { not: { required: ["identifiers", "keywordsLocale"] } },
        ],
      },
    ),
    outputSchema: s.looseObject(
      "Catalog search results and pagination.",
      {
        numberOfResults: s.integer("Total matches for identifier queries; estimated matches for keyword queries."),
        items: s.array("Catalog items on this page.", catalogItem),
        pagination,
        refinements: s.looseObject("Brand and classification refinements for keyword searches.", {}),
      },
      { required: ["numberOfResults", "items"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_catalog_item",
    operationType: "read",
    description: "Retrieve an Amazon catalog item by ASIN with selected datasets for the requested marketplaces.",
    requiredScopes: [],
    inputSchema: s.object(
      "Catalog item lookup parameters.",
      {
        asin: s.nonEmptyString("The Amazon Standard Identification Number to retrieve."),
        marketplaceIds,
        includedData: catalogIncludedData,
        locale: s.string("Locale for localized item summaries. Defaults to the marketplace locale."),
      },
      { optional: ["includedData", "locale"] },
    ),
    outputSchema: catalogItem,
  }),
  defineProviderAction(service, {
    name: "search_listings_items",
    operationType: "read",
    description:
      "Search the seller's listings by identifiers, relationships, dates, status, or issue severity. Pagination exposes at most 1,000 matching SKUs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Seller listing search parameters.",
      {
        sellerId,
        marketplaceIds,
        issueLocale,
        includedData: listingsIncludedData,
        identifiers,
        identifiersType: s.stringEnum("The type of identifiers supplied; requires identifiers.", [
          "ASIN",
          "EAN",
          "FNSKU",
          "GTIN",
          "ISBN",
          "JAN",
          "MINSAN",
          "SKU",
          "UPC",
        ]),
        variationParentSku: s.string(
          "Return variation children of this SKU; cannot be combined with identifiers or packageHierarchySku.",
        ),
        packageHierarchySku: s.string(
          "Return listings containing or contained by this SKU; cannot be combined with identifiers or variationParentSku.",
        ),
        createdAfter: s.dateTime("Return listings created at or after this time."),
        createdBefore: s.dateTime("Return listings created at or before this time."),
        lastUpdatedAfter: s.dateTime("Return listings last updated at or after this time."),
        lastUpdatedBefore: s.dateTime("Return listings last updated at or before this time."),
        withIssueSeverity: s.array(
          "Include listings with issues at these severity levels.",
          s.stringEnum("Issue severity.", ["WARNING", "ERROR"]),
        ),
        withStatus: s.array(
          "Include listings with these statuses.",
          s.stringEnum("Listing status to include.", ["BUYABLE", "DISCOVERABLE"]),
        ),
        withoutStatus: s.array(
          "Exclude listings with these statuses.",
          s.stringEnum("Listing status to exclude.", ["BUYABLE", "DISCOVERABLE"]),
        ),
        sortBy: s.stringEnum("Sort attribute. Amazon defaults to lastUpdatedDate.", [
          "sku",
          "createdDate",
          "lastUpdatedDate",
        ]),
        sortOrder: s.stringEnum("Sort order. Amazon defaults to DESC.", ["ASC", "DESC"]),
        pageSize,
        pageToken,
      },
      {
        required: ["marketplaceIds"],
        dependentRequired: { identifiers: ["identifiersType"], identifiersType: ["identifiers"] },
        allOf: [
          { not: { required: ["identifiers", "variationParentSku"] } },
          { not: { required: ["identifiers", "packageHierarchySku"] } },
          { not: { required: ["variationParentSku", "packageHierarchySku"] } },
        ],
      },
    ),
    outputSchema: s.looseObject(
      "Seller listing search results and pagination.",
      {
        numberOfResults: s.integer("Total matching listings, although pagination exposes at most 1,000."),
        items: s.array("Listings on this page.", listingItem),
        pagination,
      },
      { required: ["numberOfResults", "items"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_listings_item",
    operationType: "read",
    description:
      "Retrieve a seller listing, including selected attributes, offers, live availability, and processing issues.",
    requiredScopes: [],
    inputSchema: s.object(
      "Seller listing lookup parameters.",
      { sellerId, sku, marketplaceIds, issueLocale, includedData: listingsIncludedData },
      { required: ["sku", "marketplaceIds"] },
    ),
    outputSchema: listingItem,
  }),
  defineProviderAction(service, {
    name: "put_listings_item",
    operationType: "write",
    description:
      "Create or fully update a seller listing. Omitted existing attributes may be removed; use patch_listings_item for partial edits. VALIDATION_PREVIEW checks the submission without saving it.",
    requiredScopes: [],
    inputSchema: s.object(
      "Listing creation or replacement parameters.",
      {
        ...submissionFields,
        requirements: s.stringEnum("Requirements set for the submitted product facts and sales terms.", [
          "LISTING",
          "LISTING_PRODUCT_ONLY",
          "LISTING_OFFER_ONLY",
        ]),
        attributes: s.looseObject(
          "Product-type-specific listing attributes. Use the Product Type Definitions schema for this product type and marketplace.",
          {},
        ),
      },
      {
        required: ["sku", "marketplaceIds", "productType", "attributes"],
        allOf: [previewConstraint],
      },
    ),
    outputSchema: submission,
  }),
  defineProviderAction(service, {
    name: "patch_listings_item",
    operationType: "write",
    description:
      "Partially update listing attributes with add, replace, merge, or delete operations. Deleting attribute instances requires selector values. VALIDATION_PREVIEW checks without saving; ACCEPTED submissions may still develop processing issues.",
    requiredScopes: [],
    inputSchema: s.object(
      "Partial listing update parameters.",
      {
        ...submissionFields,
        marketplaceIds,
        patches: s.array(
          "Attribute patches to apply in order.",
          s.object(
            "An Amazon listing attribute patch.",
            {
              op: s.stringEnum(
                "Patch operation. merge is supported for fulfillment_availability and purchasable_offer.",
                ["add", "replace", "merge", "delete"],
              ),
              path: s.nonEmptyString(
                "JSON Pointer to the attribute, such as /attributes/fulfillment_availability. Ordinary patches replace entire attributes.",
              ),
              value: s.array(
                "Attribute values or selector values for deletion. merge supports explicit null sub-attribute values.",
                s.looseObject("A product-type-specific attribute value or selector.", {}),
              ),
            },
            { optional: ["value"] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["sku", "marketplaceIds", "productType", "patches"], allOf: [previewConstraint] },
    ),
    outputSchema: submission,
  }),
  defineProviderAction(service, {
    name: "delete_listings_item",
    operationType: "destructive",
    description:
      "Delete the seller's listing for one Amazon marketplace. The returned submission status indicates whether Amazon accepted the deletion for processing.",
    requiredScopes: [],
    inputSchema: s.object(
      "Listing deletion parameters.",
      { sellerId, sku, marketplaceIds: singleMarketplaceIds, issueLocale },
      { required: ["sku", "marketplaceIds"] },
    ),
    outputSchema: submission,
  }),
  defineProviderAction(service, {
    name: "get_inventory_summaries",
    operationType: "read",
    description:
      "Read FBA inventory summaries for one marketplace. For changed inventory, retain startDateTime when paging and reuse nextToken within 30 seconds. Inbound quantity changes are not detected by the incremental filter.",
    requiredScopes: [],
    inputSchema: s.object(
      "FBA inventory query parameters. Aggregation uses the supplied marketplace automatically.",
      {
        marketplaceIds: singleMarketplaceIds,
        details: s.boolean("Include additional inventory quantities and details. Amazon defaults to false."),
        startDateTime: s.dateTime(
          "Return changes since this time, no earlier than 18 months ago. Overrides sellerSkus and sellerSku; retain when paging.",
        ),
        sellerSkus: s.stringArray(
          "Filter up to 50 seller SKUs. Ignored when startDateTime is provided; takes precedence over sellerSku.",
          { maxItems: 50, itemDescription: "A seller SKU." },
        ),
        sellerSku: s.string(
          "Filter one seller SKU, including SKUs containing commas. Ignored when startDateTime or sellerSkus is supplied.",
        ),
        nextToken: s.string("Next-page token from pagination.nextToken. Expires 30 seconds after creation."),
      },
      { required: ["marketplaceIds"] },
    ),
    outputSchema: s.looseObject(
      "Amazon FBA inventory response with pagination outside the payload.",
      {
        payload: s.looseObject(
          "Inventory aggregation result.",
          {
            granularity: s.looseObject("Inventory aggregation marketplace.", {
              granularityType: s.string("Inventory aggregation type, Marketplace."),
              granularityId: s.string("Marketplace used for aggregation."),
            }),
            inventorySummaries: s.array(
              "Inventory summaries for this page.",
              s.looseObject("FBA inventory summary for an item.", {
                asin: s.string("The Amazon Standard Identification Number."),
                fnSku: s.string("The Amazon fulfillment network SKU."),
                sellerSku: s.string("The seller SKU."),
                condition: s.string("Item condition."),
                inventoryDetails: s.looseObject("Available, reserved, inbound, and other inventory quantities.", {}),
                lastUpdatedTime: s.string("Last inventory update time."),
                productName: s.string("Localized product title."),
                totalQuantity: s.integer("Total units in inbound shipments or Amazon fulfillment centers."),
                stores: s.stringArray("Seller-enrolled stores applying to this SKU.", {
                  itemDescription: "A store identifier.",
                }),
              }),
            ),
          },
          { required: ["granularity", "inventorySummaries"] },
        ),
        pagination: s.looseObject("Pagination for inventory results.", {
          nextToken: s.string("Next-page token; expires after 30 seconds."),
        }),
        errors,
      },
      { required: ["payload"] },
    ),
  }),
];
