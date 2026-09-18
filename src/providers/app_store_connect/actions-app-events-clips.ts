import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  clearableString,
  clearableUrl,
  deletedOutput,
  deviceFamilies,
  manageAppStoreRoles,
  nonEmptyString,
  nullableEnum,
  nullableStringArray,
  pageOutput,
  paginationInputs,
  resourceObject,
  urlString,
} from "./schemas.ts";

export const appEventStates: readonly string[] = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "REJECTED",
  "ACCEPTED",
  "APPROVED",
  "PUBLISHED",
  "PAST",
  "ARCHIVED",
];
export const appEventBadges: readonly string[] = [
  "LIVE_EVENT",
  "PREMIERE",
  "CHALLENGE",
  "COMPETITION",
  "NEW_SEASON",
  "MAJOR_UPDATE",
  "SPECIAL_EVENT",
];
export const appEventPriorities: readonly string[] = ["HIGH", "NORMAL"];
export const appEventPurposes: readonly string[] = [
  "APPROPRIATE_FOR_ALL_USERS",
  "ATTRACT_NEW_USERS",
  "KEEP_ACTIVE_USERS_INFORMED",
  "BRING_BACK_LAPSED_USERS",
];
export const appClipActions: readonly string[] = ["OPEN", "VIEW", "PLAY"];
export const appClipAdvancedExperienceStatuses: readonly string[] = [
  "RECEIVED",
  "DEACTIVATED",
  "APP_TRANSFER_IN_PROGRESS",
];
export const appClipPlaceStatuses: readonly string[] = ["PENDING", "MATCHED", "NO_MATCH"];
export const appClipBusinessCategories: readonly string[] = [
  "AUTOMOTIVE",
  "BEAUTY",
  "BIKES",
  "BOOKS",
  "CASINO",
  "EDUCATION",
  "EDUCATION_JAPAN",
  "ENTERTAINMENT",
  "EV_CHARGER",
  "FINANCIAL_USD",
  "FINANCIAL_CNY",
  "FINANCIAL_GBP",
  "FINANCIAL_JPY",
  "FINANCIAL_EUR",
  "FITNESS",
  "FOOD_AND_DRINK",
  "GAS",
  "GROCERY",
  "HEALTH_AND_MEDICAL",
  "HOTEL_AND_TRAVEL",
  "MUSIC",
  "PARKING",
  "PET_SERVICES",
  "PROFESSIONAL_SERVICES",
  "SHOPPING",
  "TICKETING",
  "TRANSIT",
];
export const appClipAdvancedExperienceLanguages: readonly string[] = [
  "AR",
  "CA",
  "CS",
  "DA",
  "DE",
  "EL",
  "EN",
  "ES",
  "FI",
  "FR",
  "HE",
  "HI",
  "HR",
  "HU",
  "ID",
  "IT",
  "JA",
  "KO",
  "MS",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "RU",
  "SK",
  "SV",
  "TH",
  "TR",
  "UK",
  "VI",
  "ZH",
];
export const appClipPlaceMapActions: readonly string[] = [
  "BUY_TICKETS",
  "VIEW_AVAILABILITY",
  "VIEW_PRICING",
  "HOTEL_BOOK_ROOM",
  "PARKING_RESERVE_PARKING",
  "RESTAURANT_JOIN_WAITLIST",
  "RESTAURANT_ORDER_DELIVERY",
  "RESTAURANT_ORDER_FOOD",
  "RESTAURANT_ORDER_TAKEOUT",
  "RESTAURANT_RESERVATION",
  "SCHEDULE_APPOINTMENT",
  "RESTAURANT_VIEW_MENU",
  "THEATER_NOW_PLAYING",
  "AIRLINE_BOOK_TRAVEL",
  "AIRLINE_CHECK_IN",
  "AIRLINE_FLIGHT_STATUS",
  "APPLY",
  "BOOK",
  "BOOK_ACTIVITIES",
  "BOOK_RIDES",
  "BOOK_TEETIMES",
  "BOOK_TOURS",
  "CAREERS",
  "CHARGE_EV",
  "COUPONS",
  "DONATE",
  "EVENTS",
  "EVENTS_SHOWS",
  "EVENTS_SPORTS",
  "GIFT_CARD",
  "HOTEL_AMENITIES",
  "JOIN",
  "PARKING_AVAILABLE",
  "RESTAURANT_PICKUP",
  "RETAIL_SERVICE_QUOTE",
  "RETAIL_STORE_DELIVERY",
  "RETAIL_STORE_PICKUP",
  "RETAIL_STORE_SHOP",
  "SERVICES",
  "SUPPORT",
  "PAY_TO_PARK",
];
export const appClipPlaceRelationships: readonly string[] = ["OWNER", "AUTHORIZED", "OTHER"];
export const appClipPhoneNumberTypes: readonly string[] = ["FAX", "LANDLINE", "MOBILE", "TOLLFREE"];
export const appClipDisplayPointSources: readonly string[] = ["CALCULATED", "MANUALLY_PLACED"];
export const nominationTypes: readonly string[] = ["APP_LAUNCH", "APP_ENHANCEMENTS", "NEW_CONTENT"];
export const nominationStates: readonly string[] = ["DRAFT", "SUBMITTED", "ARCHIVED"];
const urlArray = (description: string, itemDescription: string) => s.array(description, urlString(itemDescription));

const appIdInput = nonEmptyString("App Store Connect identifier of the app.");
const appEventIdInput = nonEmptyString("App Store Connect identifier of the in-app event.");
const appEventLocalizationIdInput = nonEmptyString("App Store Connect identifier of the in-app event localization.");
const appClipIdInput = nonEmptyString("App Store Connect identifier of the App Clip.");
const appClipDefaultExperienceIdInput = nonEmptyString(
  "App Store Connect identifier of the default App Clip experience.",
);
const appClipDefaultExperienceLocalizationIdInput = nonEmptyString(
  "App Store Connect identifier of the default App Clip experience localization.",
);
const appClipAppStoreReviewDetailIdInput = nonEmptyString(
  "App Store Connect identifier of the App Clip App Store review detail.",
);
const appClipAdvancedExperienceIdInput = nonEmptyString(
  "App Store Connect identifier of the advanced App Clip experience.",
);
const nominationIdInput = nonEmptyString("App Store Connect identifier of the nomination.");

const territoryScheduleFields = {
  territories: s.stringArray("ISO 3166-1 alpha-3 territories this schedule applies to.", {
    minItems: 1,
    itemDescription: "Territory identifier, such as USA.",
  }),
  publishStart: s.dateTime(
    "When the event becomes visible on the App Store in these territories, as an ISO 8601 timestamp.",
  ),
  eventStart: s.dateTime("When the event starts, as an ISO 8601 timestamp."),
  eventEnd: s.dateTime("When the event ends, as an ISO 8601 timestamp."),
};
const territorySchedulesInput = s.array(
  "Territory schedules of the event. Each entry gives one publish, start, and end time for a group of territories; the whole list replaces the current schedules.",
  s.object("One territory schedule.", territoryScheduleFields, {
    optional: ["territories", "publishStart", "eventStart", "eventEnd"],
  }),
);
const territorySchedulesOutput = (description: string) =>
  s.nullable(
    s.array(
      description,
      s.looseObject("One territory schedule.", {
        territories: nullableStringArray(
          "ISO 3166-1 alpha-3 territories this schedule applies to.",
          "Territory identifier, such as USA.",
        ),
        publishStart: s.nullableString("When the event becomes visible on the App Store, as an ISO 8601 timestamp."),
        eventStart: s.nullableString("When the event starts, as an ISO 8601 timestamp."),
        eventEnd: s.nullableString("When the event ends, as an ISO 8601 timestamp."),
      }),
    ),
  );

export const appEventResource: JsonSchema = resourceObject(
  "An in-app event shown on the App Store product page.",
  "App Store Connect identifier for the in-app event.",
  {
    referenceName: s.nullableString("Internal reference name of the event, not shown on the App Store."),
    badge: nullableEnum("Badge that labels the kind of event.", appEventBadges),
    eventState: nullableEnum("Review and publication state of the event.", appEventStates),
    deepLink: s.nullableString("Deep link opened in the app when a user taps the event."),
    purchaseRequirement: s.nullableString(
      "Purchase required to take part, such as NO_COST_ASSOCIATED or IN_APP_PURCHASE.",
    ),
    primaryLocale: s.nullableString("Primary locale of the event metadata, such as en-US."),
    priority: nullableEnum("Priority relative to the other events of the app.", appEventPriorities),
    purpose: nullableEnum("Audience the event is meant for.", appEventPurposes),
    territorySchedules: territorySchedulesOutput("Territory schedules of the event, or null when none are set."),
    archivedTerritorySchedules: territorySchedulesOutput(
      "Schedules of past occurrences App Store Connect archived, or null when there are none.",
    ),
  },
);

export const appEventLocalizationResource: JsonSchema = resourceObject(
  "Localized name and descriptions of an in-app event for one locale.",
  "App Store Connect identifier for the in-app event localization.",
  {
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    name: s.nullableString("Event name shown on the App Store in this locale."),
    shortDescription: s.nullableString("Short description shown on the event card."),
    longDescription: s.nullableString("Long description shown on the event details page."),
  },
);

export const appClipResource: JsonSchema = resourceObject(
  "An App Clip that belongs to an app.",
  "App Store Connect identifier for the App Clip.",
  { bundleId: s.nullableString("Bundle identifier of the App Clip.") },
);

export const appClipDefaultExperienceResource: JsonSchema = resourceObject(
  "The default App Clip experience that ships with an App Store version.",
  "App Store Connect identifier for the default App Clip experience.",
  {
    action: nullableEnum("Call-to-action verb shown on the App Clip card.", appClipActions),
    releaseWithAppStoreVersionId: s.nullableString(
      "App Store Connect identifier of the App Store version the experience is released with, or null when none is attached.",
    ),
  },
  ["releaseWithAppStoreVersionId"],
);

export const appClipDefaultExperienceLocalizationResource: JsonSchema = resourceObject(
  "Localized subtitle of a default App Clip experience for one locale.",
  "App Store Connect identifier for the default App Clip experience localization.",
  {
    locale: s.nullableString("Locale the subtitle is written in, such as en-US."),
    subtitle: s.nullableString("Subtitle shown on the App Clip card in this locale."),
  },
);

export const appClipAppStoreReviewDetailResource: JsonSchema = resourceObject(
  "Invocation URLs App Review uses to test a default App Clip experience.",
  "App Store Connect identifier for the App Clip App Store review detail.",
  {
    invocationUrls: nullableStringArray(
      "Invocation URLs App Review can use to launch the App Clip.",
      "An invocation URL.",
    ),
  },
);

const structuredAddressFields = {
  streetAddress: s.stringArray("Street address lines.", { itemDescription: "One address line." }),
  floor: s.string("Floor within the building."),
  neighborhood: s.string("Neighborhood of the place."),
  locality: s.string("City or locality."),
  stateProvince: s.string("State or province."),
  postalCode: s.string("Postal code."),
  countryCode: s.string("ISO 3166-1 alpha-2 country code, such as US."),
};
const coordinatesFields = {
  latitude: s.number("Latitude in decimal degrees."),
  longitude: s.number("Longitude in decimal degrees."),
};
const phoneNumberFields = {
  number: s.string("Phone number of the place."),
  type: s.stringEnum("Kind of phone line.", appClipPhoneNumberTypes),
  intent: s.string("What the number is for, such as reservations."),
};

const placeObject = (description: string) =>
  s.looseObject(description, {
    placeId: s.string("Apple Maps place identifier when the place is already known to Apple Maps."),
    names: s.stringArray("Names of the place.", { itemDescription: "A name of the place." }),
    mainAddress: s.looseObject("Main address of the place.", {
      fullAddress: s.string("Full address as a single line."),
      structuredAddress: s.looseObject("Address split into its parts.", structuredAddressFields),
    }),
    displayPoint: s.looseObject("Where the pin is placed on the map.", {
      coordinates: s.looseObject("Geographic coordinates of the pin.", coordinatesFields),
      source: s.stringEnum(
        "Whether the pin was calculated from the address or placed manually.",
        appClipDisplayPointSources,
      ),
    }),
    mapAction: s.stringEnum("Action offered on the place card in Apple Maps.", appClipPlaceMapActions),
    relationship: s.stringEnum("Relationship between the submitter and the place.", appClipPlaceRelationships),
    phoneNumber: s.looseObject("Phone number of the place.", phoneNumberFields),
    homePage: s.string("Website of the place."),
    categories: s.stringArray("Apple Maps categories of the place.", {
      itemDescription: "A place category.",
    }),
  });

const advancedExperienceLocalizationFields = {
  language: s.stringEnum("Language of this localization.", appClipAdvancedExperienceLanguages),
  title: nonEmptyString("Title shown on the App Clip card in this language."),
  subtitle: nonEmptyString("Subtitle shown on the App Clip card in this language."),
};

const advancedExperienceLocalizationsInput = (description: string, allowId: boolean) =>
  s.array(
    description,
    s.object(
      "One localization of the App Clip card.",
      allowId
        ? {
            id: nonEmptyString("Identifier of an existing localization to change. Omit it to add a new localization."),
            ...advancedExperienceLocalizationFields,
          }
        : advancedExperienceLocalizationFields,
      { required: ["language"] },
    ),
    { minItems: 1 },
  );

const advancedExperienceLocalizationOutput = s.object(
  "One localization of the App Clip card.",
  {
    id: s.string("App Store Connect identifier for the localization."),
    language: nullableEnum("Language of the localization.", appClipAdvancedExperienceLanguages),
    title: s.nullableString("Title shown on the App Clip card."),
    subtitle: s.nullableString("Subtitle shown on the App Clip card."),
  },
  { additionalProperties: true, required: ["id"] },
);

export const appClipAdvancedExperienceResource: JsonSchema = resourceObject(
  "An advanced App Clip experience launched from a URL, QR code, NFC tag, or a place in Apple Maps.",
  "App Store Connect identifier for the advanced App Clip experience.",
  {
    link: s.nullableString("Invocation URL of the experience."),
    version: s.nullableInteger("Build version of the App Clip the experience belongs to."),
    status: nullableEnum(
      "Whether users can invoke the experience (RECEIVED), it is deactivated, or its app is being transferred.",
      appClipAdvancedExperienceStatuses,
    ),
    action: nullableEnum("Call-to-action verb shown on the App Clip card.", appClipActions),
    isPoweredBy: s.nullableBoolean(
      "Whether the experience was submitted by a platform provider that serves multiple businesses.",
    ),
    place: s.nullable(placeObject("Physical place the experience is tied to, or null.")),
    placeStatus: nullableEnum("Whether Apple Maps matched the place to a point of interest.", appClipPlaceStatuses),
    businessCategory: nullableEnum("Business category of the experience.", appClipBusinessCategories),
    defaultLanguage: nullableEnum("Default language of the experience.", appClipAdvancedExperienceLanguages),
    localizations: s.array(
      "Localized card text of the experience, empty when none was returned.",
      advancedExperienceLocalizationOutput,
    ),
  },
  ["localizations"],
);

export const nominationResource: JsonSchema = resourceObject(
  "A featuring nomination that tells Apple's editorial team about an upcoming launch, enhancement, or content drop.",
  "App Store Connect identifier for the nomination.",
  {
    name: s.nullableString("Name of the nomination."),
    type: nullableEnum("What the nomination is about.", nominationTypes),
    description: s.nullableString("Description of the launch or content for the editorial team."),
    createdDate: s.nullableString("When the nomination was created, as an ISO 8601 timestamp."),
    lastModifiedDate: s.nullableString("When the nomination was last changed, as an ISO 8601 timestamp."),
    submittedDate: s.nullableString(
      "When the nomination was submitted, as an ISO 8601 timestamp, or null while it is a draft.",
    ),
    state: nullableEnum("Whether the nomination is a draft, submitted, or archived.", nominationStates),
    publishStartDate: s.nullableString("When the launch or content becomes available, as an ISO 8601 timestamp."),
    publishEndDate: s.nullableString("When the content stops being available, as an ISO 8601 timestamp, or null."),
    deviceFamilies: s.nullable(
      s.array("Device families the nomination applies to.", s.stringEnum("A device family.", deviceFamilies)),
    ),
    locales: nullableStringArray(
      "Locales the launch or content is available in.",
      "An App Store locale, such as en-US.",
    ),
    supplementalMaterialsUris: nullableStringArray("URLs of supplemental materials for the editorial team.", "A URL."),
    hasInAppEvents: s.nullableBoolean("Whether in-app events accompany the launch."),
    launchInSelectMarketsFirst: s.nullableBoolean("Whether the launch happens in selected markets before the rest."),
    notes: s.nullableString("Additional notes for the editorial team."),
    preOrderEnabled: s.nullableBoolean("Whether the app is available for pre-order."),
  },
);

const appEventAttributeInputs = {
  badge: s.stringEnum("Badge that labels the kind of event.", appEventBadges),
  purchaseRequirement: nonEmptyString("Purchase required to take part: NO_COST_ASSOCIATED or IN_APP_PURCHASE."),
  primaryLocale: nonEmptyString("Primary locale of the event metadata, such as en-US."),
  priority: s.stringEnum("Priority relative to the other events of the app.", appEventPriorities),
  purpose: s.stringEnum("Audience the event is meant for.", appEventPurposes),
  territorySchedules: territorySchedulesInput,
};

const nominationAttributeInputs = {
  deviceFamilies: s.array(
    "Device families the nomination applies to.",
    s.stringEnum("A device family.", deviceFamilies),
    { minItems: 1 },
  ),
  locales: s.stringArray("Locales the launch or content is available in.", {
    minItems: 1,
    itemDescription: "An App Store locale, such as en-US.",
  }),
  supplementalMaterialsUris: urlArray(
    "URLs of supplemental materials, such as press kits or videos, for the editorial team.",
    "A URL.",
  ),
  hasInAppEvents: s.boolean("Whether in-app events accompany the launch."),
  launchInSelectMarketsFirst: s.boolean("Whether the launch happens in selected markets before the rest."),
  preOrderEnabled: s.boolean("Whether the app is available for pre-order."),
};

export const appStoreConnectAppEventClipActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_app_events",
    operationType: "read",
    description: "List the in-app events of an app, optionally narrowed to some review states or identifiers.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing in-app events.",
      {
        appId: appIdInput,
        eventStates: s.array(
          "Return only events in any of these states.",
          s.stringEnum("An in-app event state.", appEventStates),
          { minItems: 1 },
        ),
        appEventIds: s.stringArray("Return only the events with these identifiers.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an in-app event.",
        }),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "appEvents",
      appEventResource,
      "In-app events returned for this page.",
      "A page of in-app events.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_event",
    operationType: "read",
    description: "Read one in-app event with its state, badge, purpose, and territory schedules.",
    requiredScopes: [],
    inputSchema: s.actionInput({ appEventId: appEventIdInput }, ["appEventId"], "Identifies the in-app event to read."),
    outputSchema: s.actionOutput({ appEvent: appEventResource }, "The requested in-app event."),
  }),
  defineProviderAction(service, {
    name: "create_app_event",
    operationType: "write",
    description:
      "Create a draft in-app event for an app. Add localizations with create_app_event_localization before submitting the event for review in App Store Connect.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The in-app event to create.",
      {
        appId: appIdInput,
        referenceName: nonEmptyString("Internal reference name of the event, not shown on the App Store."),
        deepLink: urlString("Deep link opened in the app when a user taps the event."),
        ...appEventAttributeInputs,
      },
      { required: ["appId", "referenceName"] },
    ),
    outputSchema: s.actionOutput({ appEvent: appEventResource }, "The created in-app event."),
  }),
  defineProviderAction(service, {
    name: "update_app_event",
    operationType: "destructive",
    description:
      "Change the reference name, badge, deep link, purchase requirement, locale, priority, purpose, or territory schedules of an in-app event. Overwrites the given fields; pass null for deepLink or purchaseRequirement to clear it. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The in-app event fields to change.",
      {
        appEventId: appEventIdInput,
        referenceName: nonEmptyString("New internal reference name."),
        deepLink: clearableUrl("New deep link, or null to remove it."),
        ...appEventAttributeInputs,
        purchaseRequirement: clearableString(
          "New purchase requirement (NO_COST_ASSOCIATED or IN_APP_PURCHASE), or null to remove it.",
        ),
      },
      { required: ["appEventId"] },
    ),
    outputSchema: s.actionOutput({ appEvent: appEventResource }, "The updated in-app event."),
  }),
  defineProviderAction(service, {
    name: "delete_app_event",
    operationType: "destructive",
    description:
      "Delete an in-app event together with its localizations. A published event is removed from the App Store.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { appEventId: appEventIdInput },
      ["appEventId"],
      "Identifies the in-app event to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted in-app event."),
      "Confirmation that the in-app event was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_event_localizations",
    operationType: "read",
    description: "List the localized name and descriptions of an in-app event for every locale.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the in-app event whose localizations to list.",
      { appEventId: appEventIdInput, ...paginationInputs },
      { required: ["appEventId"] },
    ),
    outputSchema: pageOutput(
      "appEventLocalizations",
      appEventLocalizationResource,
      "In-app event localizations returned for this page.",
      "A page of in-app event localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_event_localization",
    operationType: "read",
    description: "Read one in-app event localization by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appEventLocalizationId: appEventLocalizationIdInput },
      ["appEventLocalizationId"],
      "Identifies the in-app event localization to read.",
    ),
    outputSchema: s.actionOutput(
      { appEventLocalization: appEventLocalizationResource },
      "The requested in-app event localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_event_localization",
    operationType: "write",
    description:
      "Add a locale to an in-app event with the name and descriptions shown in that locale. App Store Connect rejects a locale the event already has.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localization to create.",
      {
        appEventId: appEventIdInput,
        locale: nonEmptyString("App Store locale to add, such as de-DE."),
        name: nonEmptyString("Event name shown on the App Store in this locale."),
        shortDescription: nonEmptyString("Short description shown on the event card."),
        longDescription: nonEmptyString("Long description shown on the event details page."),
      },
      { required: ["appEventId", "locale"] },
    ),
    outputSchema: s.actionOutput(
      { appEventLocalization: appEventLocalizationResource },
      "The created in-app event localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_event_localization",
    operationType: "destructive",
    description:
      "Change the name or descriptions of an in-app event localization. Overwrites the given fields; pass null to clear a field. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localization fields to change.",
      {
        appEventLocalizationId: appEventLocalizationIdInput,
        name: clearableString("New event name, or null to remove it."),
        shortDescription: clearableString("New short description, or null to remove it."),
        longDescription: clearableString("New long description, or null to remove it."),
      },
      { required: ["appEventLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { appEventLocalization: appEventLocalizationResource },
      "The updated in-app event localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_event_localization",
    operationType: "destructive",
    description: "Remove a locale from an in-app event together with the screenshots and video clips uploaded for it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { appEventLocalizationId: appEventLocalizationIdInput },
      ["appEventLocalizationId"],
      "Identifies the in-app event localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted in-app event localization."),
      "Confirmation that the in-app event localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_clips",
    operationType: "read",
    description: "List the App Clips of an app, optionally filtered by bundle identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing App Clips.",
      {
        appId: appIdInput,
        bundleIds: s.stringArray("Return only App Clips with any of these bundle identifiers.", {
          minItems: 1,
          itemDescription: "An App Clip bundle identifier.",
        }),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput("appClips", appClipResource, "App Clips returned for this page.", "A page of App Clips."),
  }),
  defineProviderAction(service, {
    name: "get_app_clip",
    operationType: "read",
    description: "Read one App Clip by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput({ appClipId: appClipIdInput }, ["appClipId"], "Identifies the App Clip to read."),
    outputSchema: s.actionOutput({ appClip: appClipResource }, "The requested App Clip."),
  }),
  defineProviderAction(service, {
    name: "list_app_clip_default_experiences",
    operationType: "read",
    description:
      "List the default experiences of an App Clip with the App Store version each one is released with. Optionally keep only experiences that are, or are not, attached to a version.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing default App Clip experiences.",
      {
        appClipId: appClipIdInput,
        hasReleaseVersion: s.boolean(
          "Return only experiences attached to an App Store version when true, or only unattached ones when false.",
        ),
        ...paginationInputs,
      },
      { required: ["appClipId"] },
    ),
    outputSchema: pageOutput(
      "appClipDefaultExperiences",
      appClipDefaultExperienceResource,
      "Default App Clip experiences returned for this page.",
      "A page of default App Clip experiences.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_clip_default_experience",
    operationType: "read",
    description: "Read one default App Clip experience with its action and the App Store version it is released with.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appClipDefaultExperienceId: appClipDefaultExperienceIdInput },
      ["appClipDefaultExperienceId"],
      "Identifies the default App Clip experience to read.",
    ),
    outputSchema: s.actionOutput(
      { appClipDefaultExperience: appClipDefaultExperienceResource },
      "The requested default App Clip experience.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_clip_default_experience",
    operationType: "write",
    description:
      "Create a default experience for an App Clip, optionally attached to the App Store version it ships with or copied from an existing experience.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The default App Clip experience to create.",
      {
        appClipId: appClipIdInput,
        action: s.stringEnum("Call-to-action verb shown on the App Clip card.", appClipActions),
        releaseWithAppStoreVersionId: nonEmptyString(
          "App Store Connect identifier of the App Store version to release the experience with.",
        ),
        appClipDefaultExperienceTemplateId: nonEmptyString(
          "Identifier of an existing default experience to copy the settings and localizations from.",
        ),
      },
      { required: ["appClipId"] },
    ),
    outputSchema: s.actionOutput(
      { appClipDefaultExperience: appClipDefaultExperienceResource },
      "The created default App Clip experience.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_clip_default_experience",
    operationType: "destructive",
    description:
      "Change the action of a default App Clip experience or the App Store version it is released with. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The default App Clip experience fields to change.",
      {
        appClipDefaultExperienceId: appClipDefaultExperienceIdInput,
        action: s.stringEnum("New call-to-action verb.", appClipActions),
        releaseWithAppStoreVersionId: nonEmptyString(
          "App Store Connect identifier of the App Store version to release the experience with, replacing the current one.",
        ),
      },
      { required: ["appClipDefaultExperienceId"] },
    ),
    outputSchema: s.actionOutput(
      { appClipDefaultExperience: appClipDefaultExperienceResource },
      "The updated default App Clip experience.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_clip_default_experience",
    operationType: "destructive",
    description: "Delete a default App Clip experience together with its localizations and review detail.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { appClipDefaultExperienceId: appClipDefaultExperienceIdInput },
      ["appClipDefaultExperienceId"],
      "Identifies the default App Clip experience to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted default App Clip experience."),
      "Confirmation that the default App Clip experience was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_app_clip_default_experience_release_version",
    operationType: "destructive",
    description:
      "Attach a default App Clip experience to the App Store version it is released with, replacing any version attached before.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The experience and the App Store version to attach it to.",
      {
        appClipDefaultExperienceId: appClipDefaultExperienceIdInput,
        appStoreVersionId: nonEmptyString(
          "App Store Connect identifier of the App Store version to release the experience with.",
        ),
      },
      { required: ["appClipDefaultExperienceId", "appStoreVersionId"] },
    ),
    outputSchema: s.actionOutput(
      {
        appClipDefaultExperienceId: s.string("The default App Clip experience that was changed."),
        appStoreVersionId: s.string("The App Store version now attached."),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the release version was changed.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_clip_default_experience_localizations",
    operationType: "read",
    description: "List the localized subtitles of a default App Clip experience, optionally narrowed to some locales.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing default App Clip experience localizations.",
      {
        appClipDefaultExperienceId: appClipDefaultExperienceIdInput,
        locales: s.stringArray("Return only the localizations for these locales.", {
          minItems: 1,
          itemDescription: "An App Store locale, such as en-US.",
        }),
        ...paginationInputs,
      },
      { required: ["appClipDefaultExperienceId"] },
    ),
    outputSchema: pageOutput(
      "appClipDefaultExperienceLocalizations",
      appClipDefaultExperienceLocalizationResource,
      "Localizations returned for this page.",
      "A page of default App Clip experience localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_clip_default_experience_localization",
    operationType: "read",
    description: "Read one default App Clip experience localization by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appClipDefaultExperienceLocalizationId: appClipDefaultExperienceLocalizationIdInput },
      ["appClipDefaultExperienceLocalizationId"],
      "Identifies the localization to read.",
    ),
    outputSchema: s.actionOutput(
      { appClipDefaultExperienceLocalization: appClipDefaultExperienceLocalizationResource },
      "The requested default App Clip experience localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_clip_default_experience_localization",
    operationType: "write",
    description:
      "Add a locale to a default App Clip experience with the subtitle shown on the App Clip card in that locale. The header image is uploaded separately in App Store Connect.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localization to create.",
      {
        appClipDefaultExperienceId: appClipDefaultExperienceIdInput,
        locale: nonEmptyString("App Store locale to add, such as de-DE."),
        subtitle: nonEmptyString("Subtitle shown on the App Clip card in this locale."),
      },
      { required: ["appClipDefaultExperienceId", "locale"] },
    ),
    outputSchema: s.actionOutput(
      { appClipDefaultExperienceLocalization: appClipDefaultExperienceLocalizationResource },
      "The created default App Clip experience localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_clip_default_experience_localization",
    operationType: "destructive",
    description: "Change the subtitle of a default App Clip experience localization, or pass null to remove it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localization field to change.",
      {
        appClipDefaultExperienceLocalizationId: appClipDefaultExperienceLocalizationIdInput,
        subtitle: clearableString("New subtitle, or null to remove it."),
      },
      { required: ["appClipDefaultExperienceLocalizationId", "subtitle"] },
    ),
    outputSchema: s.actionOutput(
      { appClipDefaultExperienceLocalization: appClipDefaultExperienceLocalizationResource },
      "The updated default App Clip experience localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_clip_default_experience_localization",
    operationType: "destructive",
    description: "Remove a locale from a default App Clip experience together with its header image.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { appClipDefaultExperienceLocalizationId: appClipDefaultExperienceLocalizationIdInput },
      ["appClipDefaultExperienceLocalizationId"],
      "Identifies the localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted default App Clip experience localization."),
      "Confirmation that the localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_clip_default_experience_review_detail",
    operationType: "read",
    description:
      "Read the invocation URLs App Review uses to test a default App Clip experience, or null when none were provided yet.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appClipDefaultExperienceId: appClipDefaultExperienceIdInput },
      ["appClipDefaultExperienceId"],
      "Identifies the default App Clip experience whose review detail to read.",
    ),
    outputSchema: s.actionOutput(
      { appClipAppStoreReviewDetail: s.nullable(appClipAppStoreReviewDetailResource) },
      "The review detail of the default App Clip experience, or null.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_clip_app_store_review_detail",
    operationType: "write",
    description:
      "Provide the invocation URLs App Review uses to test a default App Clip experience. Each experience has at most one review detail; use update_app_clip_app_store_review_detail to change it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The review detail to create.",
      {
        appClipDefaultExperienceId: appClipDefaultExperienceIdInput,
        invocationUrls: urlArray("Invocation URLs App Review can use to launch the App Clip.", "An invocation URL."),
      },
      { required: ["appClipDefaultExperienceId"] },
    ),
    outputSchema: s.actionOutput(
      { appClipAppStoreReviewDetail: appClipAppStoreReviewDetailResource },
      "The created review detail.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_clip_app_store_review_detail",
    operationType: "destructive",
    description:
      "Replace the invocation URLs App Review uses to test a default App Clip experience. Pass an empty list to remove them all.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The review detail field to change.",
      {
        appClipAppStoreReviewDetailId: appClipAppStoreReviewDetailIdInput,
        invocationUrls: urlArray(
          "Invocation URLs App Review can use to launch the App Clip; replaces the current list.",
          "An invocation URL.",
        ),
      },
      { required: ["appClipAppStoreReviewDetailId", "invocationUrls"] },
    ),
    outputSchema: s.actionOutput(
      { appClipAppStoreReviewDetail: appClipAppStoreReviewDetailResource },
      "The updated review detail.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_clip_advanced_experiences",
    operationType: "read",
    description:
      "List the advanced experiences of an App Clip with their localized card text. Filter by status, place match status, or action.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing advanced App Clip experiences.",
      {
        appClipId: appClipIdInput,
        statuses: s.array(
          "Return only experiences in any of these statuses.",
          s.stringEnum("An advanced App Clip experience status.", appClipAdvancedExperienceStatuses),
          { minItems: 1 },
        ),
        placeStatuses: s.array(
          "Return only experiences whose place has any of these match statuses.",
          s.stringEnum("A place match status.", appClipPlaceStatuses),
          { minItems: 1 },
        ),
        actions: s.array(
          "Return only experiences with any of these call-to-action verbs.",
          s.stringEnum("A call-to-action verb.", appClipActions),
          { minItems: 1 },
        ),
        ...paginationInputs,
      },
      { required: ["appClipId"] },
    ),
    outputSchema: pageOutput(
      "appClipAdvancedExperiences",
      appClipAdvancedExperienceResource,
      "Advanced App Clip experiences returned for this page.",
      "A page of advanced App Clip experiences.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_clip_advanced_experience",
    operationType: "read",
    description:
      "Read one advanced App Clip experience with its invocation URL, place, status, and localized card text.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appClipAdvancedExperienceId: appClipAdvancedExperienceIdInput },
      ["appClipAdvancedExperienceId"],
      "Identifies the advanced App Clip experience to read.",
    ),
    outputSchema: s.actionOutput(
      { appClipAdvancedExperience: appClipAdvancedExperienceResource },
      "The requested advanced App Clip experience.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_clip_advanced_experience",
    operationType: "write",
    description:
      "Create an advanced App Clip experience for an invocation URL with its localized card text and optional place. App Store Connect requires a header image reserved beforehand through the appClipAdvancedExperienceImages endpoint (a binary upload, available through the proxy); pass its identifier as headerImageId.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The advanced App Clip experience to create.",
      {
        appClipId: appClipIdInput,
        headerImageId: nonEmptyString(
          "App Store Connect identifier of the reserved header image (appClipAdvancedExperienceImages record).",
        ),
        link: urlString("Invocation URL of the experience."),
        defaultLanguage: s.stringEnum("Default language of the experience.", appClipAdvancedExperienceLanguages),
        isPoweredBy: s.boolean(
          "Whether the experience is submitted by a platform provider that serves multiple businesses.",
        ),
        action: s.stringEnum("Call-to-action verb shown on the App Clip card.", appClipActions),
        businessCategory: s.stringEnum("Business category of the experience.", appClipBusinessCategories),
        place: placeObject("Physical place to tie the experience to, so Siri Suggestions and Apple Maps can offer it."),
        localizations: advancedExperienceLocalizationsInput(
          "Localized title and subtitle of the App Clip card, at least one entry.",
          false,
        ),
      },
      {
        required: ["appClipId", "headerImageId", "link", "defaultLanguage", "isPoweredBy", "localizations"],
      },
    ),
    outputSchema: s.actionOutput(
      { appClipAdvancedExperience: appClipAdvancedExperienceResource },
      "The created advanced App Clip experience.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_clip_advanced_experience",
    operationType: "destructive",
    description:
      "Change the action, business category, default language, place, header image, or localized card text of an advanced App Clip experience. Overwrites the given fields; a given localizations list is written inline and replaces the relationship. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The advanced App Clip experience fields to change.",
      {
        appClipAdvancedExperienceId: appClipAdvancedExperienceIdInput,
        headerImageId: nonEmptyString(
          "Identifier of a newly reserved header image (appClipAdvancedExperienceImages record) to replace the current one.",
        ),
        defaultLanguage: s.stringEnum("New default language.", appClipAdvancedExperienceLanguages),
        isPoweredBy: s.boolean(
          "Whether the experience is submitted by a platform provider that serves multiple businesses.",
        ),
        action: s.stringEnum("New call-to-action verb.", appClipActions),
        businessCategory: s.stringEnum("New business category.", appClipBusinessCategories),
        place: placeObject("New physical place for the experience."),
        localizations: advancedExperienceLocalizationsInput(
          "Localized title and subtitle of the App Clip card. Give an existing localization its id to change it in place; omit the id to add a new one.",
          true,
        ),
      },
      { required: ["appClipAdvancedExperienceId"] },
    ),
    outputSchema: s.actionOutput(
      { appClipAdvancedExperience: appClipAdvancedExperienceResource },
      "The updated advanced App Clip experience.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_clip_advanced_experience",
    operationType: "destructive",
    description:
      "Delete an advanced App Clip experience. App Store Connect has no DELETE endpoint for it; the experience is removed by setting its documented removed flag, after which users can no longer invoke it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { appClipAdvancedExperienceId: appClipAdvancedExperienceIdInput },
      ["appClipAdvancedExperienceId"],
      "Identifies the advanced App Clip experience to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the removed advanced App Clip experience."),
      "Confirmation that the advanced App Clip experience was removed.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_nominations",
    operationType: "read",
    description:
      "List the featuring nominations of the team in the given states, optionally narrowed by type, related app, or whether they include in-app events.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing featuring nominations. App Store Connect requires at least one state.",
      {
        states: s.array(
          "Return only nominations in any of these states.",
          s.stringEnum("A nomination state.", nominationStates),
          { minItems: 1 },
        ),
        types: s.array(
          "Return only nominations of any of these types.",
          s.stringEnum("A nomination type.", nominationTypes),
          { minItems: 1 },
        ),
        relatedAppIds: s.stringArray("Return only nominations related to any of these apps.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an app.",
        }),
        hasInAppEvents: s.boolean(
          "Return only nominations that include in-app events when true, or only those without when false.",
        ),
        sort: s.stringEnum("Sort order for the returned nominations.", [
          "lastModifiedDate",
          "-lastModifiedDate",
          "publishStartDate",
          "-publishStartDate",
          "publishEndDate",
          "-publishEndDate",
          "name",
          "-name",
          "type",
          "-type",
        ]),
        ...paginationInputs,
      },
      { required: ["states"] },
    ),
    outputSchema: pageOutput(
      "nominations",
      nominationResource,
      "Nominations returned for this page.",
      "A page of featuring nominations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_nomination",
    operationType: "read",
    description: "Read one featuring nomination by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { nominationId: nominationIdInput },
      ["nominationId"],
      "Identifies the nomination to read.",
    ),
    outputSchema: s.actionOutput({ nomination: nominationResource }, "The requested nomination."),
  }),
  defineProviderAction(service, {
    name: "create_nomination",
    operationType: "write",
    description:
      "Create a featuring nomination for one or more apps. With submitted false it stays a draft you can edit; with submitted true it is sent to Apple's editorial team right away.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The nomination to create.",
      {
        relatedAppIds: s.stringArray("Apps the nomination is about.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an app.",
        }),
        name: nonEmptyString("Name of the nomination."),
        type: s.stringEnum("What the nomination is about.", nominationTypes),
        description: nonEmptyString("Description of the launch or content for the editorial team."),
        submitted: s.boolean("Submit the nomination to Apple immediately when true, or keep it as a draft when false."),
        publishStartDate: s.dateTime("When the launch or content becomes available, as an ISO 8601 timestamp."),
        publishEndDate: s.dateTime("When the content stops being available, as an ISO 8601 timestamp."),
        notes: nonEmptyString("Additional notes for the editorial team."),
        ...nominationAttributeInputs,
        inAppEventIds: s.stringArray("In-app events that accompany the launch.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an in-app event.",
        }),
        supportedTerritoryIds: s.stringArray("Territories the launch or content is available in.", {
          minItems: 1,
          itemDescription: "ISO 3166-1 alpha-3 territory identifier, such as USA.",
        }),
      },
      {
        required: ["relatedAppIds", "name", "type", "description", "submitted", "publishStartDate"],
      },
    ),
    outputSchema: s.actionOutput({ nomination: nominationResource }, "The created nomination."),
  }),
  defineProviderAction(service, {
    name: "update_nomination",
    operationType: "destructive",
    description:
      "Change a featuring nomination, submit a draft with submitted true, or archive it with archived true. Overwrites the given fields; a given list of apps, events, or territories replaces the current one. Pass null for publishEndDate or notes to clear it. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The nomination fields to change.",
      {
        nominationId: nominationIdInput,
        name: nonEmptyString("New name of the nomination."),
        type: s.stringEnum("New nomination type.", nominationTypes),
        description: nonEmptyString("New description for the editorial team."),
        submitted: s.boolean("Submit the nomination to Apple when true."),
        archived: s.boolean("Archive the nomination when true."),
        publishStartDate: s.dateTime("New availability start, as an ISO 8601 timestamp."),
        publishEndDate: s.nullable(s.dateTime("New availability end, as an ISO 8601 timestamp, or null to clear it.")),
        notes: clearableString("New notes for the editorial team, or null to clear them."),
        ...nominationAttributeInputs,
        relatedAppIds: s.stringArray("Apps the nomination is about; replaces the current list.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an app.",
        }),
        inAppEventIds: s.stringArray("In-app events that accompany the launch; replaces the current list.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an in-app event.",
        }),
        supportedTerritoryIds: s.stringArray(
          "Territories the launch or content is available in; replaces the current list.",
          { minItems: 1, itemDescription: "ISO 3166-1 alpha-3 territory identifier, such as USA." },
        ),
      },
      { required: ["nominationId"] },
    ),
    outputSchema: s.actionOutput({ nomination: nominationResource }, "The updated nomination."),
  }),
  defineProviderAction(service, {
    name: "delete_nomination",
    operationType: "destructive",
    description: "Delete a featuring nomination.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { nominationId: nominationIdInput },
      ["nominationId"],
      "Identifies the nomination to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted nomination."),
      "Confirmation that the nomination was deleted.",
    ),
  }),
];
