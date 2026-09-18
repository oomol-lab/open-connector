import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bloomerang";

const paginationFields = {
  skip: s.integer("The number of matching records to skip before returning results.", {
    minimum: 0,
  }),
  take: s.integer("The maximum number of records to return.", { minimum: 1, maximum: 50 }),
};

const constituentRecordSchema = s.looseObject("One constituent or household record returned by Bloomerang.", {
  Id: s.optional(s.integer("The record ID used by the Bloomerang API.")),
  Type: s.optional(s.string("The Bloomerang record type.")),
  FullName: s.optional(s.string("The display name returned for the record.")),
});

const listOutputSchema = s.requiredObject("A page of records returned by Bloomerang.", {
  total: s.integer("The total number of records available in Bloomerang."),
  totalFiltered: s.integer("The total number of records matching the supplied filters."),
  start: s.integer("The zero-based index of the first returned record."),
  resultCount: s.integer("The number of records in this response."),
  records: s.array("The constituent or household records in this response.", constituentRecordSchema),
});

const listConstituentsAction = defineProviderAction(service, {
  name: "list_constituents",
  operationType: "read",
  description: "List Bloomerang constituents with pagination, identity, and modification filters.",
  inputSchema: s.object(
    "Filters and pagination for listing Bloomerang constituents.",
    {
      ...paginationFields,
      lastModified: s.dateTime("Return constituents modified after this date and time."),
      isFavorite: s.boolean("Return only constituents favorited by the connected user."),
      type: s.stringEnum("Return only constituents of this type.", ["Individual", "Organization"]),
      ids: s.array(
        "Return only constituents with these API IDs.",
        s.positiveInteger("One Bloomerang constituent API ID."),
        { minItems: 1 },
      ),
      orderBy: s.stringEnum("The field used to sort the results.", ["Id", "CreatedDate", "LastModifiedDate"]),
      orderDirection: s.stringEnum("The direction used to sort the results.", ["Asc", "Desc"]),
      customFieldId: s.positiveInteger("The custom field ID used to filter constituents."),
      customFieldValue: s.string("The custom field value used to filter constituents."),
    },
    {
      optional: [
        "skip",
        "take",
        "lastModified",
        "isFavorite",
        "type",
        "ids",
        "orderBy",
        "orderDirection",
        "customFieldId",
        "customFieldValue",
      ],
    },
  ),
  outputSchema: listOutputSchema,
});

const searchConstituentsAction = defineProviderAction(service, {
  name: "search_constituents",
  operationType: "read",
  description: "Search Bloomerang constituents and households by text.",
  inputSchema: s.object(
    "Text, type filter, and pagination for searching Bloomerang records.",
    {
      ...paginationFields,
      search: s.nonEmptyString("The text to search for in constituents and households."),
      type: s.stringEnum("Return only records of this type.", ["Individual", "Organization", "Household"]),
    },
    { optional: ["skip", "take", "type"] },
  ),
  outputSchema: listOutputSchema,
});

const getConstituentAction = defineProviderAction(service, {
  name: "get_constituent",
  operationType: "read",
  description: "Get one Bloomerang constituent by its API ID.",
  inputSchema: s.requiredObject("The identifier of the Bloomerang constituent to retrieve.", {
    constituentId: s.positiveInteger("The constituent ID used by the Bloomerang API."),
  }),
  outputSchema: s.requiredObject("The constituent returned by Bloomerang.", {
    constituent: constituentRecordSchema,
  }),
});

export const bloomerangActions: ProviderActionDefinition[] = [
  listConstituentsAction,
  searchConstituentsAction,
  getConstituentAction,
];
