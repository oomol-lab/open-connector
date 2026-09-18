import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { supplySources } from "./actions-campaigns.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  deletedOutput,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  nonEmptyString,
  nullableEnum,
  offsetInput,
  pageSizeInput,
  queryInputs,
  queryOptionalInputs,
  queryOutput,
  readCampaignsRoles,
} from "./schemas.ts";
const geoEntityTypes = ["Country", "AdminArea", "Locality", "PostalCode"];
const locationStatuses = ["OPEN", "OPENING_SOON", "CLOSED", "MOVED", "TEMPORARILY_CLOSED"];
const locationGroupTypes = ["STATIC", "DYNAMIC"];
const locationGroupSystemStatuses = ["VALID", "INVALID", "PENDING", "DELETED"];
const eligibilityStatuses = ["ELIGIBLE", "INELIGIBLE", "LIMITED", "PENDING", "UNDEFINED"];

const locationFilterFields = [
  "brandId",
  "name",
  "status",
  "address.countryOrRegion",
  "address.adminArea",
  "address.locality",
  "address.postalCode",
  "eligibility.status",
];
const locationSortFields = ["name"];

const locationGroupFilterFields = [
  "id",
  "name",
  "brandId",
  "groupType",
  "deleted",
  "isAllLocationsGroup",
  "eligibility.status",
  "eligibility.blockedGroups.supplyPlacement",
  "eligibility.blockedGroups.countryOrRegion",
  "eligibility.allowedGroups.supplyPlacement",
  "eligibility.allowedGroups.countryOrRegion",
];
const locationGroupSortFields = locationGroupFilterFields;

const supplySourceInput = s.stringEnum(
  "Supply source the search is scoped to. APPSTORE returns Country, AdminArea and Locality entities for App Store campaigns. MAPS returns AdminArea, Locality and PostalCode entities for Apple Maps campaigns and restricts results to the United States and Canada.",
  supplySources,
);

const geoBlockedGroupOutput = looseResource(
  "One blocking rule, naming the supply sources it applies to and why the location is restricted.",
  {
    supplySource: s.nullable(
      s.stringArray("Supply sources this restriction applies to.", {
        itemDescription: "A supply source: APPSTORE or MAPS.",
      }),
    ),
    reasons: s.nullable(
      s.stringArray("Reason codes for the restriction.", {
        itemDescription:
          "A reason code. Hard blocks are NO_MUID, NOT_SUPPORTED, SOURCE_REMOVED, COUNTRY_NOT_SUPPORTED, COUNTRY_NOT_SEARCHABLE and MAPS_SOURCE_NOT_MATCHED; soft blocks are LOCALITY_LOW_SEARCH_VOLUME and POSTAL_CODE_SPARSE.",
      }),
    ),
  },
);

const geoLocationResource = looseResource(
  "A geographic location used as a geo targeting value on an ad group. It describes where the ad viewer is, not an advertiser business location.",
  {
    id: s.string(
      "Numeric geo location identifier. Use it as the targeting value in an ad group's country, adminArea, locality or postalCode dimension.",
    ),
    legacyId: s.nullableString(
      "Pipe-delimited identifier encoding the full geographic hierarchy, for example US|CA|San Francisco or US|TX|78238.",
    ),
    entity: nullableEnum("Geographic granularity of this location.", geoEntityTypes),
    displayName: s.nullableString("Localized display name including the full hierarchy."),
    countryOrRegion: s.nullableString("ISO 3166-1 alpha-2 country or region code."),
    adminArea: s.nullableString(
      "State or province identifier. Apple Ads returns it for AdminArea, Locality and PostalCode entities.",
    ),
    locality: s.nullableString("City or locality name. Apple Ads returns it for Locality entities."),
    postalCode: s.nullableString("Postal code value. Apple Ads returns it for PostalCode entities."),
    eligibility: s.nullable(
      looseResource(
        "Serving restrictions scoped to the requested supply source. Apple Ads leaves it out entirely when nothing restricts the location.",
        {
          blockedGroups: s.nullable(
            s.array(
              "Blocking rules that apply to this location for the requested supply source.",
              geoBlockedGroupOutput,
            ),
          ),
        },
      ),
    ),
  },
  ["id"],
);

const eligibilityGroupOutput = looseResource("One placement and market combination covered by an eligibility group.", {
  supplyPlacement: s.nullable(
    s.stringArray("Supply placements this group covers.", {
      itemDescription: "A supply placement identifier.",
    }),
  ),
  countryOrRegion: s.nullable(
    s.stringArray("Markets this group covers.", {
      itemDescription: "An ISO 3166-1 alpha-2 country or region code.",
    }),
  ),
});

const eligibilityOutput = (description: string) =>
  s.nullable(
    looseResource(description, {
      status: nullableEnum("System-managed eligibility status.", eligibilityStatuses),
      blockedGroups: s.nullable(
        s.array("Placement and market combinations that cannot serve.", eligibilityGroupOutput),
      ),
      allowedGroups: s.nullable(s.array("Placement and market combinations that can serve.", eligibilityGroupOutput)),
    }),
  );

const locationResource = looseResource(
  "A physical place of business associated with a brand, such as a retail store, restaurant or service center. Locations are read-only in the Apple Ads Platform API: Apple Business creates and maintains them.",
  {
    id: s.string("Identifier for the location. Use it when building a location group."),
    name: s.nullableString("Display name of the location."),
    brandId: s.nullableString("Brand the location belongs to."),
    status: nullableEnum(
      "Operational status of the location. Only OPEN locations are eligible for ad targeting.",
      locationStatuses,
    ),
    countryOrRegion: s.nullableString("ISO 3166-1 alpha-2 country or region code for the location."),
    categories: s.nullable(
      s.stringArray("Business category identifiers. The first entry is the primary category.", {
        itemDescription: "A business category identifier.",
      }),
    ),
    address: s.nullable(
      looseResource("Postal address of the location.", {
        countryOrRegion: s.nullableString("ISO 3166-1 alpha-2 country or region code."),
        adminArea: s.nullableString("State or province name spelled out in full."),
        adminAreaCode: s.nullableString("Abbreviated state or province code."),
        locality: s.nullableString("City or town name."),
        subLocality: s.nullableString("Neighborhood or district inside the locality."),
        subAdminArea: s.nullableString("County or other subdivision of the administrative area."),
        postalCode: s.nullableString("Postal or ZIP code."),
        thoroughfare: s.nullableString("Street name."),
        subThoroughfare: s.nullableString("Street number."),
        fullThoroughfare: s.nullableString("Street number and street name combined."),
        fullAddress: s.nullableString("Complete address on a single line."),
      }),
    ),
    displayPoint: s.nullable(
      looseResource("Geographic coordinates of the location.", {
        latitude: s.nullableString("Latitude as a decimal string."),
        longitude: s.nullableString("Longitude as a decimal string."),
      }),
    ),
    eligibility: eligibilityOutput(
      "System-managed eligibility for ad targeting. Only a location whose status is ELIGIBLE can be added to a location group.",
    ),
    creationTime: appleAdsDateTimeOutput("When the location record was created."),
    modificationTime: appleAdsDateTimeOutput("When the location record was last modified."),
  },
  ["id"],
);

const locationGroupResource = looseResource(
  "A named set of business locations scoped to one brand. An ad group references the group to restrict which of the advertiser's locations its Apple Maps ads promote; it does not filter by the ad viewer's location.",
  {
    id: s.string("System-assigned identifier for the location group."),
    name: s.nullableString("Display name of the group."),
    brandId: s.nullableString("Brand the group belongs to."),
    adAccountId: s.nullableString("Ad account that owns the group."),
    groupType: nullableEnum("How membership is defined.", locationGroupTypes),
    systemStatus: nullableEnum(
      "System-managed state. A group is unusable for targeting until it reaches VALID, and a group in INVALID or PENDING state cannot be updated or deleted.",
      locationGroupSystemStatuses,
    ),
    query: s.nullableString("RSQL query Apple Ads generated from the rules of a DYNAMIC group."),
    rules: s.nullable(
      s.array(
        "Membership rules evaluated against the brand's location catalog for a DYNAMIC group.",
        looseResource("A single membership rule.", {
          field: s.nullableString("Location field the rule matches on."),
          operator: s.nullableString("Comparison operator applied to the field."),
          value: s.unknown("Value the field is compared against."),
        }),
      ),
    ),
    locationIds: s.nullable(
      s.stringArray("Location identifiers explicitly included in a STATIC group.", {
        itemDescription: "A location identifier.",
      }),
    ),
    isAllLocationsGroup: s.nullableBoolean("Whether this is the system-created All Locations group for the brand."),
    description: s.nullableString("Advertiser-given description of the group."),
    groupTotal: s.nullableInteger(
      "Number of locations currently in the group. It stays 0 for a DYNAMIC group until rule evaluation finishes.",
    ),
    eligibility: eligibilityOutput("Ad serving eligibility for the group."),
    creationTime: appleAdsDateTimeOutput("When the group was created."),
    modificationTime: appleAdsDateTimeOutput("When the group was last modified."),
    deleted: s.nullableBoolean("Whether the group has been soft-deleted."),
  },
  ["id"],
);

const locationGroupRulesInput = s.array(
  "Membership rules for a DYNAMIC group, evaluated against the brand's full location catalog. Sending this array replaces every stored rule.",
  s.object(
    "A single membership rule.",
    {
      field: nonEmptyString("Location field the rule matches on, for example adminArea or locality."),
      operator: nonEmptyString("Comparison operator applied to the field, for example IN."),
      value: s.unknown(
        "Value the field is compared against; pass an array for a multi-value operator such as IN. An adminArea value must be the full English name, for example Illinois rather than IL, and a locality value must use the pipe-delimited countryOrRegion|adminArea|locality form, for example US|New York|Brooklyn. Apple Ads accepts an abbreviated value without an error and silently matches no locations.",
      ),
    },
    { required: ["field", "operator", "value"] },
  ),
  { maxItems: 25 },
);

const locationIdsInput = s.array(
  "Location identifiers that make up a STATIC group. Sending this array replaces the stored list, so add a location by resending the full list with the new identifier appended.",
  identifierInput("Identifier of a location returned by query_locations or get_location."),
);

export const appleAdsGeoActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_geo_locations",
    operationType: "read",
    description:
      "Look up geo targeting locations by identifier. Pass the geo location ids or pipe-delimited legacy ids you already have, and Apple Ads returns their metadata and eligibility scoped to one supply source. Use it to batch-validate targeting values before applying them to an ad group; this endpoint never filters soft-blocked geos out.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "The geo locations to look up.",
      {
        adAccountId: adAccountIdInput,
        geoRequest: s.array(
          "Geo locations to look up. Each entry carries exactly one identifier plus its entity type.",
          s.object(
            "A single geo location lookup criterion.",
            {
              id: identifierInput("Numeric geo location identifier. Do not pass legacyId too."),
              legacyId: nonEmptyString(
                "Pipe-delimited geo code encoding the hierarchy, for example US|CA|San Francisco or US|TX|78238. Do not pass id too.",
              ),
              entity: s.stringEnum("Geographic granularity of this entry.", geoEntityTypes),
            },
            { required: ["entity"], optional: ["id", "legacyId"] },
          ),
          { minItems: 1 },
        ),
        supplySource: supplySourceInput,
        offset: offsetInput,
        pageSize: pageSizeInput,
      },
      { required: ["geoRequest", "supplySource"] },
    ),
    outputSchema: queryOutput(
      "geoLocations",
      geoLocationResource,
      "Geo locations matching the requested identifiers, sorted alphabetically by displayName and deduplicated.",
      "A page of geo targeting locations.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_geo_locations",
    operationType: "read",
    description:
      "Search geo targeting locations by name. Use it to discover the geo location ids to put in an ad group's country, adminArea, locality or postalCode targeting dimension. Soft-blocked geos are returned with their eligibility data unless eligible is true.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "The geo location search to run.",
      {
        adAccountId: adAccountIdInput,
        supplySource: supplySourceInput,
        query: nonEmptyString(
          'Text to search for, at least two characters. Pass "*" or omit it to return every matching geo location.',
        ),
        entity: s.stringEnum(
          "Restrict results to one geographic granularity. PostalCode is only available with supplySource MAPS, and Country only with supplySource APPSTORE.",
          geoEntityTypes,
        ),
        countryCode: nonEmptyString(
          "ISO 3166-1 alpha-2 country code to scope results to. Apple Ads defaults it to US when entity is AdminArea, Locality or PostalCode and this is omitted.",
        ),
        eligible: s.boolean(
          "Whether to drop soft-blocked geo locations, meaning those with low search volume or sparse coverage. Apple Ads includes them by default.",
        ),
        offset: offsetInput,
        pageSize: pageSizeInput,
      },
      {
        required: ["supplySource"],
        optional: ["adAccountId", "query", "entity", "countryCode", "eligible", "offset", "pageSize"],
      },
    ),
    outputSchema: queryOutput(
      "geoLocations",
      geoLocationResource,
      "Geo locations matching the search, sorted alphabetically by displayName.",
      "A page of geo targeting locations.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_locations",
    operationType: "read",
    description:
      "Search the advertiser's business locations, the physical stores and venues an Apple Maps campaign promotes. Filter by brandId to scope results to one brand, and collect the returned ids to build a location group.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing business locations.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: locationFilterFields,
          filterFieldDescription:
            "Location field to filter on. brandId accepts EQUALS; name and address.locality accept EQUALS and STARTS_WITH; status, eligibility.status, address.countryOrRegion, address.adminArea and address.postalCode accept EQUALS and IN.",
          sortFields: locationSortFields,
          sortFieldDescription: "Location field to sort on. Apple Ads documents only name.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "locations",
      locationResource,
      "Business locations matching the query on this page.",
      "A page of business locations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_location",
    operationType: "read",
    description:
      "Read one business location by identifier. Use it to confirm the address, coordinates, operational status and eligibility of a store before adding it to a location group.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the business location to read.",
      {
        locationId: identifierInput("Identifier of the business location."),
        adAccountId: adAccountIdInput,
      },
      { required: ["locationId"] },
    ),
    outputSchema: s.actionOutput({ location: locationResource }, "The requested business location."),
  }),
  defineProviderAction(service, {
    name: "create_location_group",
    operationType: "write",
    description:
      "Create a location group, a named set of the advertiser's business locations that an ad group can target. brandId and the owning ad account are fixed at creation: move a group to another brand by deleting it and creating a new one. A STATIC group becomes usable immediately, while a DYNAMIC group stays PENDING until Apple Ads finishes evaluating its rules.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The location group to create.",
      {
        adAccountId: adAccountIdInput,
        name: nonEmptyString("Display name for the location group."),
        brandId: identifierInput("Brand whose locations the group draws from. It cannot be changed later."),
        groupType: s.stringEnum(
          "How membership is defined. STATIC takes an explicit locationIds list; DYNAMIC takes rules that Apple Ads re-evaluates as the brand's footprint changes. It cannot be changed later.",
          locationGroupTypes,
        ),
        rules: locationGroupRulesInput,
        locationIds: locationIdsInput,
        description: nonEmptyString("Description of the location group."),
      },
      { required: ["name", "brandId", "groupType"] },
    ),
    outputSchema: s.actionOutput({ locationGroup: locationGroupResource }, "The created location group."),
  }),
  defineProviderAction(service, {
    name: "query_location_groups",
    operationType: "read",
    description:
      "Search the location groups of one ad account with filters, sorting and offset pagination. Soft-deleted groups are excluded unless a filter on deleted asks for them.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Query for browsing location groups.",
      {
        adAccountId: adAccountIdInput,
        ...queryInputs({
          filterFields: locationGroupFilterFields,
          filterFieldDescription:
            "Location group field to filter on. id, groupType and eligibility.status accept EQUALS and IN; brandId, deleted and isAllLocationsGroup accept EQUALS; the eligibility.blockedGroups and eligibility.allowedGroups fields accept CONTAINS_ANY. Apple Ads documents name as accepting EQUALS and a CONTAINS operator that is not part of the shared query operator set.",
          sortFields: locationGroupSortFields,
          sortFieldDescription: "Location group field to sort on. Every filterable field is also sortable.",
        }),
      },
      { optional: queryOptionalInputs },
    ),
    outputSchema: queryOutput(
      "locationGroups",
      locationGroupResource,
      "Location groups matching the query on this page.",
      "A page of location groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_location_group",
    operationType: "read",
    description:
      "Read one location group by identifier, including its membership definition, systemStatus, location count and eligibility. A soft-deleted group is still readable and comes back with systemStatus DELETED.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Identifies the location group to read.",
      {
        locationGroupId: identifierInput("Identifier of the location group."),
        adAccountId: adAccountIdInput,
      },
      { required: ["locationGroupId"] },
    ),
    outputSchema: s.actionOutput({ locationGroup: locationGroupResource }, "The requested location group."),
  }),
  defineProviderAction(service, {
    name: "update_location_group",
    operationType: "destructive",
    description:
      "Change the mutable fields of one location group. Only the fields you pass are changed, but locationIds and rules replace the stored array entirely rather than merging into it. Changing rules sends a DYNAMIC group back to PENDING while Apple Ads re-evaluates membership. A group whose systemStatus is INVALID or PENDING cannot be updated.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "The location group changes to apply.",
      {
        locationGroupId: identifierInput("Identifier of the location group to update."),
        adAccountId: adAccountIdInput,
        name: nonEmptyString("New display name for the location group."),
        groupType: s.stringEnum(
          "Type of location grouping. Apple Ads accepts it in the update body but it is fixed at creation: switch a group between types by deleting it and creating a new one.",
          locationGroupTypes,
        ),
        rules: locationGroupRulesInput,
        locationIds: locationIdsInput,
        description: nonEmptyString("New description of the location group."),
      },
      { required: ["locationGroupId"] },
    ),
    outputSchema: s.actionOutput({ locationGroup: locationGroupResource }, "The updated location group."),
  }),
  defineProviderAction(service, {
    name: "delete_location_group",
    operationType: "destructive",
    description:
      "Soft-delete one location group. Deletion is permanent and there is no restore: ad groups targeting the group lose that constraint immediately and keep serving only if they target another location group. A group whose systemStatus is INVALID or PENDING cannot be deleted.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Identifies the location group to delete.",
      {
        locationGroupId: identifierInput("Identifier of the location group to delete."),
        adAccountId: adAccountIdInput,
      },
      { required: ["locationGroupId"] },
    ),
    outputSchema: s.actionOutput(
      deletedOutput("Identifier of the soft-deleted location group."),
      "Confirmation that the location group was soft-deleted.",
    ),
  }),
];
