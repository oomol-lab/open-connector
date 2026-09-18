import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stream_estate";

const scalarQueryValueSchema = s.union(
  [s.string("A string query value."), s.number("A numeric query value."), s.boolean("A boolean query value.")],
  { description: "A scalar query value." },
);

const queryValueSchema = s.union(
  [scalarQueryValueSchema, s.array("Repeated values for one query parameter.", scalarQueryValueSchema)],
  { description: "A scalar query value or an array of repeated values." },
);

const additionalQuerySchema = s.record(
  "Additional documented Stream Estate query parameters keyed by their exact upstream names, including bracket notation when required.",
  queryValueSchema,
);

const propertyCollectionOutputSchema = s.requiredObject("A normalized page of Stream Estate properties.", {
  items: s.array(
    "Property documents in the current page.",
    s.looseObject("A Stream Estate property document with upstream-defined fields."),
  ),
  totalItems: s.nullableInteger("The total number of matching properties, or null when the endpoint omits it."),
  pagination: s.looseObject("Hydra pagination links returned by Stream Estate, or an empty object when absent."),
});

const locationCollectionOutputSchema = s.requiredObject("Normalized Stream Estate location results.", {
  items: s.array(
    "Locations in the current response.",
    s.looseObject("A city or department with upstream-defined location fields."),
  ),
  totalItems: s.nullableInteger("The total number of matching locations, or null when the endpoint omits it."),
  pagination: s.looseObject("Hydra pagination links returned by Stream Estate, or an empty object when absent."),
});

const propertyIdSchema = s.uuid("The UUID of the Stream Estate property.");
const pageSchema = s.integer("The collection page number, starting at 1.", { minimum: 1 });
const itemsPerPageSchema = s.integer("The number of properties per page, from 1 to 30.", {
  minimum: 1,
  maximum: 30,
});
const orderSchema = s.stringEnum("The sort direction.", ["asc", "desc"]);

export const streamEstateActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_properties",
    operationType: "read",
    description: "Search Stream Estate property inventory with common filters and optional advanced query parameters.",
    inputSchema: s.object(
      "Filters and pagination for searching Stream Estate properties.",
      {
        propertyTypes: s.array(
          "Property types: apartment 0, house 1, building 2, parking 3, office 4, land 5, or shop 6.",
          s.integer("A Stream Estate property type code.", { minimum: 0, maximum: 6 }),
          { uniqueItems: true },
        ),
        transactionType: s.integer("The transaction type: sale 0 or rent 1.", {
          minimum: 0,
          maximum: 1,
        }),
        includedCities: s.array(
          "City IRIs returned by search_locations, such as /cities/30953.",
          s.nonEmptyString("A Stream Estate city IRI."),
          { uniqueItems: true },
        ),
        includedDepartments: s.array(
          "Department IRIs returned by search_locations, such as /departments/77.",
          s.nonEmptyString("A Stream Estate department IRI."),
          { uniqueItems: true },
        ),
        budgetMin: s.number("The minimum property budget."),
        budgetMax: s.number("The maximum property budget."),
        surfaceMin: s.number("The minimum property surface area."),
        surfaceMax: s.number("The maximum property surface area."),
        fromDate: s.string("Return properties created at or after this date-time.", {
          format: "date-time",
        }),
        withCoherentPrice: s.nullableBoolean("Whether to filter by coherent prices; null disables the filter."),
        itemsPerPage: itemsPerPageSchema,
        page: pageSchema,
        orderCreatedAt: orderSchema,
        orderUpdatedAt: orderSchema,
        orderPrice: orderSchema,
        additionalQuery: additionalQuerySchema,
      },
      {
        optional: [
          "propertyTypes",
          "transactionType",
          "includedCities",
          "includedDepartments",
          "budgetMin",
          "budgetMax",
          "surfaceMin",
          "surfaceMax",
          "fromDate",
          "withCoherentPrice",
          "itemsPerPage",
          "page",
          "orderCreatedAt",
          "orderUpdatedAt",
          "orderPrice",
          "additionalQuery",
        ],
      },
    ),
    outputSchema: propertyCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_property",
    operationType: "read",
    description: "Retrieve one Stream Estate property document by UUID.",
    inputSchema: s.requiredObject("The property to retrieve.", { propertyId: propertyIdSchema }),
    outputSchema: s.requiredObject("A retrieved Stream Estate property.", {
      property: s.looseObject("The property document with upstream-defined fields."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_similar_properties",
    operationType: "read",
    description: "List Stream Estate properties similar to a selected property.",
    inputSchema: s.object(
      "The source property and pagination for similar properties.",
      {
        propertyId: propertyIdSchema,
        fromDate: s.string("Return properties created at or after this date-time.", {
          format: "date-time",
        }),
        itemsPerPage: itemsPerPageSchema,
        page: pageSchema,
        orderCreatedAt: orderSchema,
        orderUpdatedAt: orderSchema,
        orderPricePerMeter: orderSchema,
        orderPrice: orderSchema,
        orderSurface: orderSchema,
      },
      {
        optional: [
          "fromDate",
          "itemsPerPage",
          "page",
          "orderCreatedAt",
          "orderUpdatedAt",
          "orderPricePerMeter",
          "orderPrice",
          "orderSurface",
        ],
      },
    ),
    outputSchema: propertyCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_locations",
    operationType: "read",
    description: "Search Stream Estate cities and departments for property-filter identifiers.",
    inputSchema: s.object(
      "Text and optional exclusions for Stream Estate location autocomplete.",
      {
        query: s.nonEmptyString("The city or department search term."),
        excludedCityIds: s.array(
          "City IRIs to exclude from the results.",
          s.nonEmptyString("A Stream Estate city IRI."),
          { uniqueItems: true },
        ),
        excludedDepartmentIds: s.array(
          "Department IRIs to exclude from the results.",
          s.nonEmptyString("A Stream Estate department IRI."),
          { uniqueItems: true },
        ),
      },
      { optional: ["excludedCityIds", "excludedDepartmentIds"] },
    ),
    outputSchema: locationCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_cities",
    operationType: "read",
    description: "List Stream Estate cities using official geographic and name filters.",
    inputSchema: s.object(
      "Filters and pagination for listing Stream Estate cities.",
      {
        excludeGroupedCities: s.boolean("Whether to exclude cities that contain grouped cities."),
        insee: s.array("One or more French INSEE codes.", s.nonEmptyString("A French INSEE code."), {
          uniqueItems: true,
        }),
        libelle: s.nonEmptyString("A city label to match."),
        name: s.nonEmptyString("A city name to match."),
        orderName: orderSchema,
        page: pageSchema,
        slug: s.nonEmptyString("A city slug to match."),
        zipcode: s.array("One or more postal codes.", s.nonEmptyString("A postal code."), {
          uniqueItems: true,
        }),
        additionalQuery: additionalQuerySchema,
      },
      {
        optional: [
          "excludeGroupedCities",
          "insee",
          "libelle",
          "name",
          "orderName",
          "page",
          "slug",
          "zipcode",
          "additionalQuery",
        ],
      },
    ),
    outputSchema: locationCollectionOutputSchema,
  }),
];
