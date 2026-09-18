import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  manageAppStoreRoles,
  nonEmptyString,
  pageOutput,
  paginationInputs,
  resourceObject,
  territoryResource,
} from "./schemas.ts";

export const territoryAvailabilityContentStatuses: readonly string[] = [
  "AVAILABLE",
  "AVAILABLE_FOR_PREORDER_ON_DATE",
  "PROCESSING_TO_NOT_AVAILABLE",
  "PROCESSING_TO_AVAILABLE",
  "PROCESSING_TO_PRE_ORDER",
  "AVAILABLE_FOR_SALE_UNRELEASED_APP",
  "PREORDER_ON_UNRELEASED_APP",
  "AVAILABLE_FOR_PREORDER",
  "MISSING_RATING",
  "CANNOT_SELL_RESTRICTED_RATING",
  "BRAZIL_REQUIRED_TAX_ID",
  "BRAZIL_GAMBLING_NOT_VERIFIED",
  "MISSING_GRN",
  "UNVERIFIED_GRN",
  "ICP_NUMBER_INVALID",
  "ICP_NUMBER_MISSING",
  "TRADER_STATUS_NOT_PROVIDED",
  "TRADER_STATUS_VERIFICATION_FAILED",
  "TRADER_STATUS_VERIFICATION_STATUS_MISSING",
  "CANNOT_SELL_SEVENTEEN_PLUS_APPS",
  "CANNOT_SELL_SEXUALLY_EXPLICIT",
  "CANNOT_SELL_NON_IOS_GAMES",
  "CANNOT_SELL_SEVENTEEN_PLUS_GAMES",
  "CANNOT_SELL_CASINO",
  "CANNOT_SELL_CASINO_WITHOUT_GRAC",
  "CANNOT_SELL_CASINO_WITHOUT_AGE_VERIFICATION",
  "CANNOT_SELL_ADULT_ONLY",
  "CANNOT_SELL_GAMBLING_CONTESTS",
  "CANNOT_SELL_GAMBLING",
  "CANNOT_SELL_CONTESTS",
  "CANNOT_SELL_NINETEEN_PLUS_WITHOUT_GRAC",
  "CANNOT_SELL",
  "CANNOT_SELL_FREQUENT_INTENSE_GAMBLING",
  "CANNOT_SELL_FREQUENT_INTENSE_ALCOHOL_TOBACCO_DRUGS",
  "CANNOT_SELL_FREQUENT_INTENSE_VIOLENCE",
  "CANNOT_SELL_FREQUENT_INTENSE_SEXUAL_CONTENT_NUDITY",
  "CANNOT_SELL_INFREQUENT_MILD_ALCOHOL_TOBACCO_DRUGS",
  "CANNOT_SELL_INFREQUENT_MILD_SEXUAL_CONTENT_NUDITY",
  "CANNOT_SELL_FREQUENT_INTENSE",
  "CANNOT_SELL_FREQUENT_INTENSE_WITHOUT_GRAC",
  "CANNOT_SELL_FREQUENT_GAMBLING",
  "CANNOT_SELL_FREQUENT_ALCOHOL_TOBACCO_DRUGS",
  "CANNOT_SELL_FREQUENT_VIOLENCE",
  "CANNOT_SELL_FREQUENT_SEXUAL_CONTENT_NUDITY",
  "CANNOT_SELL_INFREQUENT_ALCOHOL_TOBACCO_DRUGS",
  "CANNOT_SELL_INFREQUENT_SEXUAL_CONTENT_NUDITY",
  "CANNOT_SELL_FREQUENT",
  "CANNOT_SELL_FREQUENT_WITHOUT_GRAC",
];

const territoryIdInput = (description: string) =>
  nonEmptyString(`${description} ISO 3166-1 alpha-3 territory code, such as USA.`);
const territoryIdsFilter = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "ISO 3166-1 alpha-3 territory code, such as USA.",
  });

const appPriceScheduleIdInput = nonEmptyString(
  "App Store Connect identifier of the price schedule, from get_app_price_schedule.",
);
const appPricePointIdInput = nonEmptyString(
  "App Store Connect identifier of the price point, from list_app_price_points.",
);

export const appPriceScheduleResource: JsonSchema = resourceObject(
  "The price schedule of an app: the base territory plus the manual and automatic prices App Store Connect derives from it.",
  "App Store Connect identifier for the price schedule.",
  {
    baseTerritoryId: s.nullableString(
      "Territory whose price the automatic prices of every other territory are derived from, such as USA.",
    ),
  },
  ["baseTerritoryId"],
);

export const appPriceResource: JsonSchema = resourceObject(
  "One price of an app price schedule: a price point applied to one territory for a date range.",
  "App Store Connect identifier for the app price.",
  {
    manual: s.nullableBoolean(
      "True for a price set manually, false for one derived automatically from the base territory price.",
    ),
    startDate: s.nullableString(
      "Day the price starts applying, as YYYY-MM-DD, or null for the price in effect since the schedule was created.",
    ),
    endDate: s.nullableString(
      "Day the price stops applying, as YYYY-MM-DD (the next scheduled price starts that day), or null when it applies indefinitely.",
    ),
    appPricePointId: s.nullableString("App Store Connect identifier of the price point the price uses."),
    territoryId: s.nullableString("Territory the price applies to, such as USA."),
    customerPrice: s.nullableString(
      "Price customers pay in the territory currency, taken from the price point, as a decimal string.",
    ),
    proceeds: s.nullableString(
      "Developer proceeds in the territory currency, taken from the price point, as a decimal string.",
    ),
  },
  ["appPricePointId", "territoryId", "customerPrice", "proceeds"],
);

export const appPricePointResource: JsonSchema = resourceObject(
  "A price point an app can be sold at in one territory.",
  "App Store Connect identifier for the price point. It encodes the app, the territory and the price tier, so it is what create_app_price_schedule takes.",
  {
    customerPrice: s.nullableString("Price customers pay in the territory currency, as a decimal string."),
    proceeds: s.nullableString("Developer proceeds in the territory currency, as a decimal string."),
    territoryId: s.nullableString("Territory the price point belongs to, such as USA."),
  },
  ["territoryId"],
);

export const appAvailabilityResource: JsonSchema = resourceObject(
  "The territory availability configuration of an app.",
  "App Store Connect identifier for the app availability.",
  {
    availableInNewTerritories: s.nullableBoolean(
      "Whether the app is automatically made available in territories Apple adds to the App Store later.",
    ),
  },
);

export const territoryAvailabilityResource: JsonSchema = resourceObject(
  "The availability of an app in one App Store territory.",
  "App Store Connect identifier for the territory availability.",
  {
    available: s.nullableBoolean("Whether the app is available in the territory."),
    releaseDate: s.nullableString("Scheduled release date in the territory, as YYYY-MM-DD, or null when none is set."),
    preOrderEnabled: s.nullableBoolean("Whether the app can be pre-ordered in the territory."),
    preOrderPublishDate: s.nullableString(
      "Day the pre-order was or will be published in the territory, as YYYY-MM-DD.",
    ),
    contentStatuses: s.nullable(
      s.array(
        "Reasons the app is or is not on sale in the territory, as reported by App Store Connect.",
        s.stringEnum("One content status.", territoryAvailabilityContentStatuses),
      ),
    ),
    territoryId: s.nullableString("Territory the record applies to, such as USA."),
  },
  ["territoryId"],
);

export const appStoreConnectPricingActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_app_price_schedule",
    operationType: "read",
    description:
      "Read the price schedule of an app, including the base territory its automatic prices derive from. Returns null when App Store Connect has no price schedule for the app yet. Use list_app_price_schedule_manual_prices and list_app_price_schedule_automatic_prices for the individual prices.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: nonEmptyString("App Store Connect identifier of the app.") },
      ["appId"],
      "Identifies the app whose price schedule to read.",
    ),
    outputSchema: s.actionOutput(
      { appPriceSchedule: s.nullable(appPriceScheduleResource) },
      "The price schedule of the app, or null when there is none.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_price_schedule",
    operationType: "destructive",
    description:
      "Set the price schedule of an app: the base territory plus the manual prices, each a price point (which already encodes its territory) with an optional date range. App Store Connect derives the prices of every other territory from the base territory price. The new schedule replaces the current prices and any scheduled price changes of the app. Find price point identifiers with list_app_price_points.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The price schedule to set for an app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        baseTerritoryId: territoryIdInput(
          "Territory whose price the automatic prices of every other territory are derived from.",
        ),
        manualPrices: s.array(
          "Manual prices to schedule. Include the price for the base territory; add further entries for territories that should not follow the automatic price, and several entries for one territory to schedule a price change.",
          s.object(
            "One manual price.",
            {
              appPricePointId: appPricePointIdInput,
              startDate: s.date(
                "Day the price starts applying, as YYYY-MM-DD. Omit for the price that takes effect immediately.",
              ),
              endDate: s.date(
                "Day the price stops applying, as YYYY-MM-DD, which is the start day of the next scheduled price. Omit for a price with no end.",
              ),
            },
            { required: ["appPricePointId"] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["appId", "baseTerritoryId", "manualPrices"] },
    ),
    outputSchema: s.actionOutput({ appPriceSchedule: appPriceScheduleResource }, "The created price schedule."),
  }),
  defineProviderAction(service, {
    name: "list_app_price_schedule_manual_prices",
    operationType: "read",
    description:
      "List the manual prices of a price schedule, each with the price point it uses, the territory it applies to and the customer price and proceeds of that price point.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the manual prices of one price schedule.",
      {
        appPriceScheduleId: appPriceScheduleIdInput,
        territoryIds: territoryIdsFilter("Return only prices for these territories."),
        startDate: s.date("Return only prices that start on this day, as YYYY-MM-DD."),
        endDate: s.date("Return only prices that end on this day, as YYYY-MM-DD."),
        ...paginationInputs,
      },
      { required: ["appPriceScheduleId"] },
    ),
    outputSchema: pageOutput(
      "manualPrices",
      appPriceResource,
      "Manual prices returned for this page.",
      "A page of manual prices of one price schedule.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_price_schedule_automatic_prices",
    operationType: "read",
    description:
      "List the automatic prices of a price schedule, which App Store Connect derives from the base territory price for every territory without a manual price. Each entry carries its price point, territory, customer price and proceeds.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the automatic prices of one price schedule.",
      {
        appPriceScheduleId: appPriceScheduleIdInput,
        territoryIds: territoryIdsFilter("Return only prices for these territories."),
        startDate: s.date("Return only prices that start on this day, as YYYY-MM-DD."),
        endDate: s.date("Return only prices that end on this day, as YYYY-MM-DD."),
        ...paginationInputs,
      },
      { required: ["appPriceScheduleId"] },
    ),
    outputSchema: pageOutput(
      "automaticPrices",
      appPriceResource,
      "Automatic prices returned for this page.",
      "A page of automatic prices of one price schedule.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_price_schedule_base_territory",
    operationType: "read",
    description:
      "Read the base territory of a price schedule, the territory whose price the automatic prices of the other territories are derived from.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appPriceScheduleId: appPriceScheduleIdInput },
      ["appPriceScheduleId"],
      "Identifies the price schedule whose base territory to read.",
    ),
    outputSchema: s.actionOutput({ territory: territoryResource }, "The base territory of the price schedule."),
  }),
  defineProviderAction(service, {
    name: "list_app_price_points",
    operationType: "read",
    description:
      "List the price points an app can be sold at, optionally narrowed to some territories. Each price point carries the customer price and developer proceeds in the territory currency; pass its identifier to create_app_price_schedule.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the price points of one app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        territoryIds: territoryIdsFilter("Return only price points for these territories."),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "appPricePoints",
      appPricePointResource,
      "Price points returned for this page.",
      "A page of price points for one app.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_price_point",
    operationType: "read",
    description: "Read one price point by its App Store Connect identifier, including the territory it belongs to.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appPricePointId: appPricePointIdInput },
      ["appPricePointId"],
      "Identifies the price point to read.",
    ),
    outputSchema: s.actionOutput({ appPricePoint: appPricePointResource }, "The requested price point."),
  }),
  defineProviderAction(service, {
    name: "list_app_price_point_equalizations",
    operationType: "read",
    description:
      "List the price points in other territories that App Store Connect considers equivalent to one price point, optionally narrowed to some territories. Use it to pick matching manual prices across territories.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the equalized price points of one price point.",
      {
        appPricePointId: appPricePointIdInput,
        territoryIds: territoryIdsFilter("Return only equalized price points for these territories."),
        ...paginationInputs,
      },
      { required: ["appPricePointId"] },
    ),
    outputSchema: pageOutput(
      "appPricePoints",
      appPricePointResource,
      "Equalized price points returned for this page.",
      "A page of price points equivalent to the given one in other territories.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_availability",
    operationType: "read",
    description:
      "Read the availability configuration of an app, which says whether it is automatically offered in new territories. Returns null when App Store Connect has no availability record for the app yet. Use list_territory_availabilities for the per-territory settings.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: nonEmptyString("App Store Connect identifier of the app.") },
      ["appId"],
      "Identifies the app whose availability to read.",
    ),
    outputSchema: s.actionOutput(
      { appAvailability: s.nullable(appAvailabilityResource) },
      "The availability configuration of the app, or null when there is none.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_availability",
    operationType: "destructive",
    description:
      "Set the territory availability of an app: whether it is offered in new territories automatically, and for each listed territory whether it is available, its release date and whether pre-orders are enabled. The new configuration replaces the current availability of the app in every territory, so list every territory the app should stay available in.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The availability configuration to set for an app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        availableInNewTerritories: s.boolean(
          "Automatically make the app available in territories Apple adds to the App Store later.",
        ),
        territoryAvailabilities: s.array(
          "Availability of the app per territory. Territories left out become unavailable.",
          s.object(
            "Availability of the app in one territory.",
            {
              territoryId: territoryIdInput("Territory the entry applies to."),
              available: s.boolean("Make the app available in the territory."),
              releaseDate: s.date("Day the app is released in the territory, as YYYY-MM-DD. Required for a pre-order."),
              preOrderEnabled: s.boolean("Offer the app for pre-order in the territory until the release date."),
            },
            { required: ["territoryId", "available"] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["appId", "availableInNewTerritories", "territoryAvailabilities"] },
    ),
    outputSchema: s.actionOutput(
      { appAvailability: appAvailabilityResource },
      "The created availability configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_territory_availabilities",
    operationType: "read",
    description:
      "List the per-territory availability of an app availability configuration: whether the app is on sale in each territory, its release date, pre-order settings and the content statuses that explain why it is or is not available.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for browsing the territory availabilities of one app availability.",
      {
        appAvailabilityId: nonEmptyString(
          "App Store Connect identifier of the app availability, from get_app_availability.",
        ),
        ...paginationInputs,
      },
      { required: ["appAvailabilityId"] },
    ),
    outputSchema: pageOutput(
      "territoryAvailabilities",
      territoryAvailabilityResource,
      "Territory availabilities returned for this page.",
      "A page of territory availabilities of one app availability.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_territory_availability",
    operationType: "destructive",
    description:
      "Change the availability of an app in one territory: toggle whether it is available, set or clear its release date, or enable pre-orders. Pass at least one field; the others keep their current values.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The territory availability fields to change.",
      {
        territoryAvailabilityId: nonEmptyString(
          "App Store Connect identifier of the territory availability, from list_territory_availabilities.",
        ),
        available: s.boolean("Make the app available (true) or unavailable (false) in the territory."),
        releaseDate: s.nullable(
          s.date(
            "Day the app is released in the territory, as YYYY-MM-DD. Pass null to clear a scheduled release date.",
          ),
        ),
        preOrderEnabled: s.boolean("Offer the app for pre-order in the territory."),
      },
      { required: ["territoryAvailabilityId"] },
    ),
    outputSchema: s.actionOutput(
      { territoryAvailability: territoryAvailabilityResource },
      "The updated territory availability.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_end_app_availability_pre_order",
    operationType: "destructive",
    description:
      "End the pre-order of an app in the given territories and release it there immediately. This is how a pre-order for the whole app is ended: pass the territory availabilities of every territory the app is on pre-order in. The pre-order cannot be resumed afterwards.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The territory availabilities whose pre-order to end.",
      {
        territoryAvailabilityIds: s.stringArray(
          "Identifiers of the territory availabilities to release, from list_territory_availabilities.",
          {
            minItems: 1,
            itemDescription: "App Store Connect identifier of a territory availability.",
          },
        ),
      },
      { required: ["territoryAvailabilityIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        endAppAvailabilityPreOrder: resourceObject(
          "The request App Store Connect recorded for ending the pre-order.",
          "App Store Connect identifier for the end pre-order request.",
          {},
        ),
        territoryAvailabilityIds: s.stringArray(
          "Identifiers of the territory availabilities whose pre-order was ended.",
          { itemDescription: "App Store Connect identifier of a territory availability." },
        ),
      },
      "Confirmation that the pre-order was ended in the given territories.",
    ),
  }),
];
