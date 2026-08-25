import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "markettime";
const pageOutput: JsonSchema = s.actionOutput({
  records: s.array("The records returned by MarketTime.", s.unknownObject("A MarketTime record.")),
  total: s.integer("The number of records reported in the response."),
  timestamp: s.string("The server timestamp returned by MarketTime."),
});
const filterOperation = s.stringEnum("The comparison operation for this filter.", [
  "EQ",
  "NE",
  "LT",
  "LTE",
  "GT",
  "GTE",
  "IN",
  "NOT_IN",
  "STARTS_WITH",
  "ENDS_WITH",
  "CONTAINS",
  "IS_NULL",
  "IS_NOT_NULL",
]);

export const markettimeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_items",
    description: "List MarketTime catalog items with offset pagination and modification filters.",
    inputSchema: s.actionInput(
      {
        offset: s.nonNegativeInteger("The zero-based starting index."),
        recordSize: s.integer("The maximum number of items to return.", { minimum: 1, maximum: 250 }),
        sort: s.string("The documented item field used for sorting."),
        sortType: s.integer("The sort direction, where 1 means ascending."),
        modifiedStartDate: s.integer("The earliest modification timestamp to include."),
        modifiedEndDate: s.integer("The latest modification timestamp to include."),
      },
      [],
      "Pagination and sorting options for listing MarketTime items.",
    ),
    outputSchema: pageOutput,
  }),
  defineProviderAction(service, {
    name: "list_manufacturers",
    description: "List manufacturers available to the connected MarketTime account.",
    inputSchema: s.actionInput(
      {
        offset: s.nonNegativeInteger("The zero-based starting index."),
        size: s.integer("The maximum number of manufacturers to return.", { minimum: 1, maximum: 250 }),
        sort: s.string("The documented manufacturer field used for sorting."),
        sortType: s.integer("The sort direction, where 1 means ascending."),
        active: s.integer("The upstream active-status filter."),
      },
      [],
      "Pagination and sorting options for listing MarketTime manufacturers.",
    ),
    outputSchema: pageOutput,
  }),
  defineProviderAction(service, {
    name: "search_orders",
    description: "Search MarketTime orders with documented filters, sorting, and pagination.",
    inputSchema: s.actionInput(
      {
        includeTotalCount: s.boolean("Whether to include total record and page counts."),
        excludeOrderDetails: s.boolean("Whether to omit order details from returned orders."),
        filterRequests: s.array(
          "The filter conditions combined with AND.",
          s.object(
            "A MarketTime order filter condition.",
            {
              filterField: s.string("The documented order field to filter."),
              filterValue: s.string("The comparison value, omitted for null checks."),
              filterOperation,
            },
            { optional: ["filterValue"] },
          ),
        ),
        sortRequests: s.array(
          "The ordered sorting rules.",
          s.object(
            "A MarketTime order sorting rule.",
            {
              sortField: s.string("The documented order field to sort."),
              sortOrder: s.nonNegativeInteger("The precedence of this rule when multiple sorts are supplied."),
              sortType: s.stringEnum("The sort direction.", ["ASC", "DESC"]),
            },
            { optional: ["sortOrder"] },
          ),
        ),
        paginationRequest: s.object(
          "The page-number pagination settings.",
          {
            pageNumber: s.positiveInteger("The page number to fetch."),
            pageSize: s.integer("The maximum number of orders to return per page.", {
              minimum: 1,
              maximum: 250,
            }),
          },
          { optional: ["pageNumber", "pageSize"] },
        ),
      },
      [],
      "Filters, sorting, and pagination options for searching MarketTime orders.",
    ),
    outputSchema: s.object(
      "A paginated MarketTime order search response.",
      {
        records: s.array("The orders returned for the current page.", s.unknownObject("A MarketTime order.")),
        currentPage: s.integer("The current page number."),
        pageSize: s.integer("The requested page size."),
        totalNumberOfPages: s.integer("The total number of matching pages when total counts were requested."),
        totalNumberOfRecords: s.integer("The total number of matching orders when total counts were requested."),
        timestamp: s.string("The server timestamp returned by MarketTime."),
      },
      { optional: ["totalNumberOfPages", "totalNumberOfRecords"] },
    ),
  }),
];
