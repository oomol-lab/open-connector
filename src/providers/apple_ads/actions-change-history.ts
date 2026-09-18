import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  adAccountIdInput,
  looseResource,
  nonEmptyString,
  nullableEnum,
  offsetInput,
  pageSizeInput,
  queryOutput,
  readCampaignsRoles,
  sortOrders,
} from "./schemas.ts";
const auditEventTypes = ["CREATE", "UPDATE", "DELETE"];
const auditUserTypes = ["CUSTOMER", "CUSTOMER_API", "APPLE_SUPPORT"];
const auditOperators = [
  "EQUALS",
  "IN",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL_TO",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL_TO",
  "BETWEEN",
];
const auditTimeZones = ["UTC", "ORTZ"];
const auditMetadataModes = ["none", "latest", "snapshot"];

const changeHistoryFilterFields = [
  "eventTime",
  "entityType",
  "entityId",
  "eventType",
  "userType",
  "userId",
  "txnId",
  "adAccountId",
  "campaignId",
  "adGroupId",
];
const changeHistorySortFields = changeHistoryFilterFields;

const entityTypeValues = "Campaign, AdGroup, Keyword, NegativeKeyword, Ad, Creative, AdAccount, Org or LocationGroup";

const auditFilterValueInput = s.anyOf(
  "Value to compare against. Pass an array of exactly two ISO 8601 timestamps ordered as [start, end] for BETWEEN, a single ISO 8601 timestamp for GREATER_THAN and LESS_THAN, an array for IN, and a single value for EQUALS.",
  [
    nonEmptyString("A single filter value."),
    s.stringArray("Several filter values.", { itemDescription: "One filter value." }),
  ],
);

const changeHistoryFiltersInput = s.array(
  "Filter conditions combined with logical AND. One condition on eventTime is required; every other condition narrows the result set further.",
  s.object(
    "A single filter condition.",
    {
      field: s.stringEnum(
        `Field to filter on. eventTime sets the query window and is required. entityType matches the changed API entity by name, such as ${entityTypeValues}. adAccountId is available when entityType is Campaign or AdGroup, campaignId when it is AdGroup, Keyword or NegativeKeyword, and adGroupId when it is Keyword or NegativeKeyword. txnId matches the transactionId returned on summary rows.`,
        changeHistoryFilterFields,
      ),
      operator: s.stringEnum(
        "Comparison operator. eventTime accepts BETWEEN, GREATER_THAN and LESS_THAN; every other field accepts only EQUALS and IN.",
        auditOperators,
      ),
      value: auditFilterValueInput,
    },
    { required: ["field", "operator", "value"] },
  ),
  { minItems: 1 },
);

const changeHistorySortingInput = s.array(
  "Sort directives applied in order, the first one being the primary sort. Apple Ads sorts by eventTime descending when this is omitted.",
  s.object(
    "A single sort directive.",
    {
      field: s.stringEnum("Field to sort on.", changeHistorySortFields),
      order: s.stringEnum("Sort direction. Apple Ads defaults it to DESC.", sortOrders),
    },
    { required: ["field"] },
  ),
);

const auditSummaryMetaOutput = looseResource(
  'Metadata for one changed entity. Apple Ads also adds a key named after the entity type whose value is that entity\'s identifier, for example "Campaign": "444555666".',
  {
    detailId: s.nullableString(
      "Identifier of this entity change, shaped as EntityType.entityId.txnId. Pass it straight to get_change_history_detail.",
    ),
    meta: s.nullable(
      s.looseObject(
        "The changed entity's own fields: its current state when metadata was latest, or its state at the time of the event when metadata was snapshot.",
      ),
    ),
  },
);

const auditSummaryResource = looseResource(
  "One audit summary row, grouping the entity changes one actor made inside a single transaction, by entity type and event type.",
  {
    transactionId: s.nullableString(
      "Identifier of the transaction that produced these changes. It matches the txnId filter and is the last segment of a detailId.",
    ),
    eventType: nullableEnum("The change operation this transaction performed.", auditEventTypes),
    eventTime: s.nullableString(
      "When the change happened, as an ISO 8601 UTC timestamp such as 2025-03-15T14:30:00.000Z.",
    ),
    entityType: s.nullableString(
      `The API entity type that changed, matching the name of the API entity, such as ${entityTypeValues}. It is not a closed enum.`,
    ),
    count: s.nullableInteger(
      "Number of entity changes covered by this row, which is how many detail lookups it takes to expand it.",
    ),
    metas: s.nullable(
      s.array(
        "One metadata entry per changed entity. Apple Ads returns an empty array unless the request set metadata to latest or snapshot.",
        auditSummaryMetaOutput,
      ),
    ),
    userType: nullableEnum("Category of actor that made the change.", auditUserTypes),
    modifiedBy: s.nullableString(
      "Identifier of the user or service that made the change. Apple Ads never exposes the user's email address.",
    ),
  },
);

const changedFieldOutput = looseResource("One field that changed, with its values before and after.", {
  field: s.nullableString("Name of the API field that changed."),
  oldValues: s.nullable(
    s.stringArray(
      "Values before the change, always encoded as strings whatever the field's own type is. It is empty for CREATE events.",
      { itemDescription: "One value the field held before the change." },
    ),
  ),
  newValues: s.nullable(
    s.stringArray(
      "Values after the change, always encoded as strings. It is typically empty for DELETE events, though Apple Ads may report system-managed values such as the deletion flag or status.",
      { itemDescription: "One value the field holds after the change." },
    ),
  ),
});

const activityDetailOutput = looseResource(
  "One group of field changes that share an activity context inside the transaction. A single entity change usually has just one group.",
  {
    transactionId: s.nullableString("Identifier of the transaction this activity belongs to."),
    changes: s.nullable(s.array("Field-level changes recorded in this activity.", changedFieldOutput)),
  },
);

const changeDetailsResource = looseResource("The field-level change record for one entity inside one transaction.", {
  transactionId: s.nullableString("Identifier of the transaction that produced this change record."),
  detailId: s.nullableString("Identifier of this entity change, shaped as EntityType.entityId.txnId."),
  eventType: nullableEnum("The change operation performed.", auditEventTypes),
  entityType: s.nullableString(
    `The API entity type that changed, such as ${entityTypeValues}. It is not a closed enum.`,
  ),
  entityId: s.nullableString("Platform identifier of the entity that changed."),
  eventTime: s.nullableString(
    "When the change happened, as an ISO 8601 UTC timestamp such as 2025-03-15T14:30:00.000Z.",
  ),
  userType: nullableEnum("Category of actor that made the change.", auditUserTypes),
  modifiedBy: s.nullableString(
    "Identifier of the user or service that made the change. Apple Ads never exposes the user's email address.",
  ),
  entityMetaData: s.nullable(
    s.record(
      "Entity metadata captured when the change happened, keyed by attribute name such as name or campaignId. Which keys appear depends on the entity type, and Apple Ads fills it in regardless of the metadata option used on the query.",
      s.nullableString("One metadata value."),
    ),
  ),
  details: s.nullable(s.array("Activity groups holding the field-level changes.", activityDetailOutput)),
});

export const appleAdsChangeHistoryActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_change_history",
    operationType: "read",
    description:
      "Search the change history of one ad account, returning one row per transaction, actor and entity type with a count of the entity changes it covers. A filter on eventTime is required and Apple Ads looks back at most 6 months. A summary row carries no entityId, so set metadata to latest or snapshot when you plan to expand rows with get_change_history_detail: each row's metas entries then include a ready-to-use detailId.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing the change history of one ad account.",
      {
        adAccountId: adAccountIdInput,
        filters: changeHistoryFiltersInput,
        sorting: changeHistorySortingInput,
        offset: offsetInput,
        pageSize: pageSizeInput,
        needTotals: s.boolean(
          "Whether the response pagination reports the full result count. Apple Ads treats it as true by default; pass false to skip the COUNT query on large windows, which makes totalCount 0.",
        ),
        timeZone: s.stringEnum(
          "How Apple Ads reads the eventTime filter values: UTC takes them as UTC, ORTZ takes them in the org's configured timezone and converts them server-side. Returned timestamps are always UTC. The default is UTC.",
          auditTimeZones,
        ),
        metadata: s.stringEnum(
          "Which entity metadata each row's metas array carries: none returns no metadata, latest joins the entity's current state, and snapshot uses its state at the time of the event. Only latest and snapshot yield a detailId. The default is none.",
          auditMetadataModes,
        ),
      },
      { required: ["filters"] },
    ),
    outputSchema: queryOutput(
      "changeSummaries",
      auditSummaryResource,
      "Audit summary rows matching the query on this page.",
      "A page of change history summary rows.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_change_history_detail",
    operationType: "read",
    description:
      "Read the field-level before and after values of one entity change, addressed by the composite detailId that query_change_history returns in each row's metas entries when metadata is latest or snapshot.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the entity change to expand.",
      {
        detailId: nonEmptyString(
          "Composite identifier of the entity change, shaped as EntityType.entityId.txnId, for example Campaign.444555666.txn_abc123def456.",
        ),
        adAccountId: adAccountIdInput,
        limit: s.positiveInteger(
          "Maximum number of entries to return from the changes array. Apple Ads defaults it to 100.",
        ),
        offset: s.nonNegativeInteger(
          "Zero-based index of the first changes entry to return. Apple Ads defaults it to 0.",
        ),
      },
      { required: ["detailId"] },
    ),
    outputSchema: queryOutput(
      "changeDetails",
      changeDetailsResource,
      "Change records for the requested entity change.",
      "The field-level changes recorded for one entity change.",
    ),
  }),
];
