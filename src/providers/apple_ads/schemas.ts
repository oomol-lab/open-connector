import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export const service = "apple_ads";
export const nonEmptyString = (description: string): JsonSchema => s.nonWhitespaceString(description);
export const urlString = (description: string): JsonSchema => s.url(description);
export const emailString = (description: string): JsonSchema => s.email(description);
export const appleAdsDateTime = (description: string): JsonSchema =>
  nonEmptyString(
    `${description} Format: yyyy-MM-dd'T'HH:mm:ss.SSS in UTC without a timezone offset, for example 2026-01-31T23:59:59.000.`,
  );
export const appleAdsDateTimeOutput = (description: string): JsonSchema =>
  s.nullableString(`${description} Format: yyyy-MM-dd'T'HH:mm:ss.SSS in UTC without a timezone offset.`);

export const clearableString = (description: string): JsonSchema => s.nullable(nonEmptyString(description));
export const nullableEnum = (description: string, values: readonly string[]): JsonSchema =>
  s.nullable(s.stringEnum(description, values));

export const identifierInput = (description: string): JsonSchema =>
  s.anyOf(description, [
    s.integer("The identifier as an integer.", { minimum: 0 }),
    s.nonWhitespaceString("The identifier as a decimal string."),
  ]);

export const adAccountIdInput: JsonSchema = identifierInput(
  "Ad account to scope this request to, sent as the X-AP-Context header. Defaults to the Ad Account ID configured on the connection.",
);
export const absentAttributeNote =
  "An attribute Apple Ads has no value for is returned as null, and older records may leave it out entirely.";

export const looseResource = (
  description: string,
  fields: Record<string, JsonSchema>,
  required: readonly string[] = [],
): JsonSchema =>
  s.object(`${description} ${absentAttributeNote}`, fields, {
    required: [...required],
    additionalProperties: true,
  });

export const resourceObject = (
  description: string,
  idDescription: string,
  fields: Record<string, JsonSchema>,
  required: readonly string[] = [],
): JsonSchema => looseResource(description, { id: s.integer(idDescription), ...fields }, ["id", ...required]);

export const moneyInput = (description: string): JsonSchema =>
  s.object(
    description,
    {
      amount: s.nonEmptyString('Monetary amount as a decimal string without leading zeros, for example "10.00".'),
      currency: s.nonEmptyString("ISO 4217 currency code. It must match the currency of the ad account."),
    },
    { required: ["amount"] },
  );

export const moneyOutput = (description: string): JsonSchema =>
  s.nullable(
    looseResource(description, {
      amount: s.nullableString("Monetary amount as a decimal string."),
      currency: s.nullableString("ISO 4217 currency code."),
    }),
  );

export const moneyValueInput = (description: string, valueDescription: string): JsonSchema =>
  s.object(description, { value: moneyInput(valueDescription) }, { required: ["value"] });

export const moneyValueOutput = (description: string, valueDescription: string): JsonSchema =>
  s.nullable(looseResource(description, { value: moneyOutput(valueDescription) }));

export const queryFilterOperators: readonly string[] = [
  "EQUALS",
  "NOT_EQUALS",
  "IN",
  "NOT_IN",
  "CONTAINS_ANY",
  "NOT_CONTAINS_ANY",
  "CONTAINS_ALL",
  "NOT_CONTAINS_ALL",
  "LIKE",
  "NOT_LIKE",
  "STARTS_WITH",
  "ENDS_WITH",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL_TO",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL_TO",
  "BETWEEN",
  "IS_NULL",
  "IS_NOT_NULL",
];

export const sortOrders: readonly string[] = ["ASC", "DESC"];

const filterValueDescription =
  "Value to compare against. Pass an array for IN, NOT_IN, CONTAINS_ANY, CONTAINS_ALL, NOT_CONTAINS_ANY and NOT_CONTAINS_ALL, an array of exactly two values ordered as [minimum, maximum] for BETWEEN, a scalar for single-value operators, and omit it entirely for IS_NULL and IS_NOT_NULL.";

export const queryFiltersInput = (fields: readonly string[], fieldDescription: string): JsonSchema =>
  s.array(
    "Filter conditions combined with logical AND. Omit it to return every record in the ad account.",
    s.object(
      "A single filter condition.",
      {
        field: s.stringEnum(fieldDescription, fields),
        operator: s.stringEnum(
          "Comparison operator. Which operators a field accepts is documented per field.",
          queryFilterOperators,
        ),
        value: s.unknown(filterValueDescription),
        ignoreCase: s.boolean("Whether to compare strings case-insensitively."),
      },
      { required: ["field", "operator"] },
    ),
  );

export const querySortingInput = (fields: readonly string[], fieldDescription: string): JsonSchema =>
  s.array(
    "Sort directives applied in order. The default is to sort by id ascending.",
    s.object(
      "A single sort directive.",
      {
        field: s.stringEnum(fieldDescription, fields),
        order: s.stringEnum("Sort direction.", sortOrders),
      },
      { required: ["field"] },
    ),
  );

export const offsetInput: JsonSchema = s.nonNegativeInteger("Zero-based index of the first record to return.");
export const pageSizeInput: JsonSchema = s.positiveInteger("Number of records to return on this page.");
export const fetchTotalCountInput: JsonSchema = s.boolean(
  "Whether to include totalCount in the response pagination. Apple Ads omits it unless this is true.",
);

export const queryInputs = (options: {
  filterFields: readonly string[];
  filterFieldDescription: string;
  sortFields: readonly string[];
  sortFieldDescription: string;
}): Record<string, JsonSchema> => ({
  filters: queryFiltersInput(options.filterFields, options.filterFieldDescription),
  sorting: querySortingInput(options.sortFields, options.sortFieldDescription),
  offset: offsetInput,
  pageSize: pageSizeInput,
  fetchTotalCount: fetchTotalCountInput,
});

export const queryOptionalInputs: readonly string[] = [
  "adAccountId",
  "filters",
  "sorting",
  "offset",
  "pageSize",
  "fetchTotalCount",
];

export const paginationOutput: JsonSchema = s.looseRequiredObject(
  "Pagination metadata echoed by Apple Ads for this page.",
  {
    offset: s.nullableInteger("Zero-based index of the first record in this page."),
    pageSize: s.nullableInteger("Number of records requested for this page."),
    totalCount: s.nullableInteger(
      "Total number of records matching the query, or null when fetchTotalCount was not requested.",
    ),
  },
);

export const queryOutput = (
  key: string,
  items: JsonSchema,
  itemsDescription: string,
  description: string,
): JsonSchema => s.actionOutput({ [key]: s.array(itemsDescription, items), pagination: paginationOutput }, description);

export const deletedOutput = (description: string): Record<string, JsonSchema> => ({
  id: s.string(description),
  deleted: s.boolean("Always true once Apple Ads confirmed the soft deletion."),
});
export const manageCampaignsRoles: readonly string[] = [
  "Admin",
  "API Account Manager",
  "Limited Access: API Read & Write",
];
export const readCampaignsRoles: readonly string[] = [
  ...manageCampaignsRoles,
  "API Account Read Only",
  "Limited Access: API Read Only",
];
export const manageOrgRoles: readonly string[] = ["Admin", "API Account Manager"];
