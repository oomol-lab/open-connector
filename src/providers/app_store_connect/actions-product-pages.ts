import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  clearableString,
  clearableUrl,
  contentPlatforms,
  deletedOutput,
  manageAppStoreRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
  urlString,
} from "./schemas.ts";

export const appCustomProductPageVersionStates: readonly string[] = [
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "ACCEPTED",
  "APPROVED",
  "REPLACED_WITH_NEW_VERSION",
  "REJECTED",
];
export const appStoreVersionExperimentStates: readonly string[] = [
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "ACCEPTED",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "STOPPED",
];

const promotionalTextMaxLength = 170;

const boundedString = (description: string, maxLength: number) => s.nonWhitespaceString(description, { maxLength });

const clearablePromotionalText = (description: string) =>
  s.nullable(boundedString(description, promotionalTextMaxLength));

const localeInput = (description: string) => nonEmptyString(description);
const localesFilter = s.stringArray("Return only localizations for these locales.", {
  minItems: 1,
  itemDescription: "An App Store locale, such as en-US.",
});

export const appCustomProductPageResource: JsonSchema = resourceObject(
  "A custom product page of an app. Each page has its own versions that go through App Review and can be reached through a dedicated App Store URL.",
  "App Store Connect identifier for the custom product page.",
  {
    name: s.nullableString("Internal name of the custom product page shown in App Store Connect."),
    url: s.nullableString("App Store URL that opens this custom product page."),
    visible: s.nullableBoolean(
      "Whether the page is visible on the App Store. A hidden page keeps its URL but is not shown.",
    ),
  },
);

export const appCustomProductPageVersionResource: JsonSchema = resourceObject(
  "One version of a custom product page. A new version is created for each round of edits and App Review.",
  "App Store Connect identifier for the custom product page version.",
  {
    version: s.nullableString("Version number App Store Connect assigned to this page version."),
    state: nullableEnum("Review state of the page version.", appCustomProductPageVersionStates),
    deepLink: s.nullableString("Deep link opened when a user taps Get or Open on this custom product page, or null."),
  },
);

export const appCustomProductPageLocalizationResource: JsonSchema = resourceObject(
  "The metadata of a custom product page version in one locale.",
  "App Store Connect identifier for the custom product page localization.",
  {
    locale: s.nullableString("Locale the metadata is written in, such as en-US."),
    promotionalText: s.nullableString("Promotional text shown above the description on this custom product page."),
  },
);

export const appStoreVersionExperimentResource: JsonSchema = resourceObject(
  "A product page optimization test (App Store version experiment v2) that splits App Store traffic between the default product page and its treatments.",
  "App Store Connect identifier for the experiment.",
  {
    name: s.nullableString("Test name shown in App Store Connect."),
    platform: nullableEnum("Content platform the test runs on.", contentPlatforms),
    trafficProportion: s.nullableInteger(
      "Percentage of App Store traffic directed to the treatments instead of the default product page.",
    ),
    state: nullableEnum("Review and run state of the test.", appStoreVersionExperimentStates),
    reviewRequired: s.nullableBoolean("Whether the treatments must pass App Review before the test can start."),
    startDate: s.nullableString("When the test started, as an ISO 8601 timestamp."),
    endDate: s.nullableString("When the test ended or was stopped, as an ISO 8601 timestamp."),
    latestControlVersionId: s.nullableString(
      "App Store Connect identifier of the App Store version currently serving as the control (the default product page), or null when App Store Connect did not return it.",
    ),
  },
  ["latestControlVersionId"],
);

export const appStoreVersionExperimentTreatmentResource: JsonSchema = resourceObject(
  "One treatment of a product page optimization test: an alternative product page shown to part of the traffic.",
  "App Store Connect identifier for the treatment.",
  {
    name: s.nullableString("Treatment name shown in App Store Connect."),
    appIconName: s.nullableString(
      "Name of the alternate app icon asset the treatment uses, or null for the default icon.",
    ),
    appIcon: s.nullable(
      s.looseObject("Template URL and pixel size of the treatment app icon.", {
        templateUrl: s.string("Template URL with width, height, and format placeholders."),
        width: s.integer("Icon width in pixels."),
        height: s.integer("Icon height in pixels."),
      }),
    ),
    promotedDate: s.nullableString(
      "When the treatment was promoted to the default product page, as an ISO 8601 timestamp, or null.",
    ),
  },
);

export const appStoreVersionExperimentTreatmentLocalizationResource: JsonSchema = resourceObject(
  "A locale of a treatment. Screenshots and app previews for the treatment are attached to this localization.",
  "App Store Connect identifier for the treatment localization.",
  {
    locale: s.nullableString("Locale the treatment metadata is shown in, such as en-US."),
  },
);

export const appStoreVersionPromotionResource: JsonSchema = resourceObject(
  "The promotion record App Store Connect created when a treatment became the default product page.",
  "App Store Connect identifier for the promotion.",
  {},
);

export const appStoreConnectProductPageActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_app_custom_product_pages",
    operationType: "read",
    description: "List the custom product pages of one app, optionally only the visible or only the hidden ones.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing custom product pages.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        visible: s.boolean("Return only pages visible on the App Store when true, or only hidden pages when false."),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "appCustomProductPages",
      appCustomProductPageResource,
      "Custom product pages returned for this page.",
      "A page of custom product pages.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_custom_product_page",
    operationType: "read",
    description: "Read one custom product page by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appCustomProductPageId: nonEmptyString("App Store Connect identifier of the custom product page."),
      },
      ["appCustomProductPageId"],
      "Identifies the custom product page to read.",
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPage: appCustomProductPageResource },
      "The requested custom product page.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_custom_product_page",
    operationType: "write",
    description:
      "Create a custom product page for an app. Copy the metadata of an App Store version (appStoreVersionTemplateId) or of another custom product page (customProductPageTemplateId), or create the first page version inline with a deep link and localized promotional text. The page starts hidden until its first version passes App Review; use list_app_custom_product_page_versions to find the version to work on.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The custom product page to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app the page belongs to."),
        name: nonEmptyString("Internal name of the custom product page."),
        appStoreVersionTemplateId: nonEmptyString(
          "App Store version whose metadata is copied into the first page version. Mutually exclusive with customProductPageTemplateId.",
        ),
        customProductPageTemplateId: nonEmptyString(
          "Existing custom product page whose metadata is copied into the first page version. Mutually exclusive with appStoreVersionTemplateId.",
        ),
        deepLink: urlString("Deep link for the first page version, created inline together with the page."),
        localizations: s.array(
          "Locales to create inline on the first page version, each with optional promotional text.",
          s.object(
            "One localization of the first page version.",
            {
              locale: localeInput("App Store locale of the localization, such as en-US."),
              promotionalText: boundedString(
                "Promotional text shown above the description, up to 170 characters.",
                promotionalTextMaxLength,
              ),
            },
            { required: ["locale"] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["appId", "name"] },
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPage: appCustomProductPageResource },
      "The created custom product page.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_custom_product_page",
    operationType: "destructive",
    description:
      "Rename a custom product page or toggle its visibility on the App Store. Overwrites the given fields; pass at least one.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The custom product page fields to change.",
      {
        appCustomProductPageId: nonEmptyString("App Store Connect identifier of the custom product page."),
        name: nonEmptyString("New internal name of the page."),
        visible: s.boolean(
          "Show the page on the App Store when true, or hide it when false. Only an approved page can be made visible.",
        ),
      },
      { required: ["appCustomProductPageId"] },
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPage: appCustomProductPageResource },
      "The updated custom product page.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_custom_product_page",
    operationType: "destructive",
    description:
      "Delete a custom product page together with all of its versions and localizations. Its App Store URL stops working.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appCustomProductPageId: nonEmptyString("App Store Connect identifier of the custom product page."),
      },
      ["appCustomProductPageId"],
      "Identifies the custom product page to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted custom product page."),
      "Confirmation that the custom product page was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_custom_product_page_versions",
    operationType: "read",
    description: "List the versions of one custom product page, optionally narrowed to some review states.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of a custom product page.",
      {
        appCustomProductPageId: nonEmptyString("App Store Connect identifier of the custom product page."),
        states: s.array(
          "Return only versions in these review states.",
          s.stringEnum("A custom product page version state.", appCustomProductPageVersionStates),
          { minItems: 1 },
        ),
        ...paginationInputs,
      },
      { required: ["appCustomProductPageId"] },
    ),
    outputSchema: pageOutput(
      "appCustomProductPageVersions",
      appCustomProductPageVersionResource,
      "Custom product page versions returned for this page.",
      "A page of custom product page versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_custom_product_page_version",
    operationType: "read",
    description: "Read one custom product page version by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appCustomProductPageVersionId: nonEmptyString(
          "App Store Connect identifier of the custom product page version.",
        ),
      },
      ["appCustomProductPageVersionId"],
      "Identifies the custom product page version to read.",
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPageVersion: appCustomProductPageVersionResource },
      "The requested custom product page version.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_custom_product_page_version",
    operationType: "write",
    description:
      "Create a new editable version of a custom product page, for example to change it after the current version was approved. App Store Connect rejects a new version while the page already has one that is still being prepared or reviewed.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The custom product page version to create.",
      {
        appCustomProductPageId: nonEmptyString("App Store Connect identifier of the custom product page."),
        deepLink: urlString("Deep link opened when a user taps Get or Open on the custom product page."),
      },
      { required: ["appCustomProductPageId"] },
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPageVersion: appCustomProductPageVersionResource },
      "The created custom product page version.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_custom_product_page_version",
    operationType: "destructive",
    description:
      "Set or clear the deep link of a custom product page version. Overwrites the existing deep link; pass null to remove it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The deep link to store on the page version.",
      {
        appCustomProductPageVersionId: nonEmptyString(
          "App Store Connect identifier of the custom product page version.",
        ),
        deepLink: clearableUrl("New deep link, or null to remove it."),
      },
      { required: ["appCustomProductPageVersionId", "deepLink"] },
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPageVersion: appCustomProductPageVersionResource },
      "The updated custom product page version.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_custom_product_page_localizations",
    operationType: "read",
    description: "List the localizations of one custom product page version, optionally narrowed to some locales.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing custom product page localizations.",
      {
        appCustomProductPageVersionId: nonEmptyString(
          "App Store Connect identifier of the custom product page version.",
        ),
        locales: localesFilter,
        ...paginationInputs,
      },
      { required: ["appCustomProductPageVersionId"] },
    ),
    outputSchema: pageOutput(
      "appCustomProductPageLocalizations",
      appCustomProductPageLocalizationResource,
      "Custom product page localizations returned for this page.",
      "A page of custom product page localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_custom_product_page_localization",
    operationType: "read",
    description: "Read one custom product page localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appCustomProductPageLocalizationId: nonEmptyString(
          "App Store Connect identifier of the custom product page localization.",
        ),
      },
      ["appCustomProductPageLocalizationId"],
      "Identifies the custom product page localization to read.",
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPageLocalization: appCustomProductPageLocalizationResource },
      "The requested custom product page localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_custom_product_page_localization",
    operationType: "write",
    description:
      "Add a locale to a custom product page version with optional promotional text. Screenshots and app previews for the locale are uploaded separately. App Store Connect rejects a locale the version already has.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The custom product page localization to create.",
      {
        appCustomProductPageVersionId: nonEmptyString(
          "App Store Connect identifier of the custom product page version.",
        ),
        locale: localeInput("App Store locale to add, such as en-US."),
        promotionalText: boundedString(
          "Promotional text shown above the description, up to 170 characters.",
          promotionalTextMaxLength,
        ),
      },
      { required: ["appCustomProductPageVersionId", "locale"] },
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPageLocalization: appCustomProductPageLocalizationResource },
      "The created custom product page localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_custom_product_page_localization",
    operationType: "destructive",
    description: "Replace the promotional text of a custom product page localization, or clear it with null.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The promotional text to store for the localization.",
      {
        appCustomProductPageLocalizationId: nonEmptyString(
          "App Store Connect identifier of the custom product page localization.",
        ),
        promotionalText: clearablePromotionalText("New promotional text, up to 170 characters, or null to clear it."),
      },
      { required: ["appCustomProductPageLocalizationId", "promotionalText"] },
    ),
    outputSchema: s.actionOutput(
      { appCustomProductPageLocalization: appCustomProductPageLocalizationResource },
      "The updated custom product page localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_custom_product_page_localization",
    operationType: "destructive",
    description:
      "Remove a locale from a custom product page version, including the screenshots and previews attached to it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appCustomProductPageLocalizationId: nonEmptyString(
          "App Store Connect identifier of the custom product page localization.",
        ),
      },
      ["appCustomProductPageLocalizationId"],
      "Identifies the custom product page localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted localization."),
      "Confirmation that the custom product page localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_store_version_experiments",
    operationType: "read",
    description:
      "List the product page optimization tests of one app, optionally narrowed to some states, with the App Store version each test uses as its control.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing product page optimization tests.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        states: s.array(
          "Return only tests in these states.",
          s.stringEnum("A product page optimization test state.", appStoreVersionExperimentStates),
          { minItems: 1 },
        ),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "appStoreVersionExperiments",
      appStoreVersionExperimentResource,
      "Product page optimization tests returned for this page.",
      "A page of product page optimization tests.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_experiment",
    operationType: "read",
    description: "Read one product page optimization test, including the App Store version that serves as its control.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appStoreVersionExperimentId: nonEmptyString(
          "App Store Connect identifier of the product page optimization test.",
        ),
      },
      ["appStoreVersionExperimentId"],
      "Identifies the product page optimization test to read.",
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionExperiment: appStoreVersionExperimentResource },
      "The requested product page optimization test.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_store_version_experiment",
    operationType: "write",
    description:
      "Create a product page optimization test for an app on one platform. The test starts in PREPARE_FOR_SUBMISSION; add treatments with create_app_store_version_experiment_treatment, then start it with update_app_store_version_experiment once its treatments are approved.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The product page optimization test to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        name: nonEmptyString("Test name shown in App Store Connect."),
        platform: s.stringEnum("Content platform the test runs on.", contentPlatforms),
        trafficProportion: s.integer(
          "Percentage of App Store traffic directed to the treatments instead of the default product page.",
        ),
      },
      { required: ["appId", "name", "platform", "trafficProportion"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionExperiment: appStoreVersionExperimentResource },
      "The created product page optimization test.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_store_version_experiment",
    operationType: "destructive",
    description:
      "Rename a product page optimization test, change its traffic proportion, or start it by passing started true. Starting a test is not reversible: it begins serving treatments to App Store traffic and can only be stopped, not returned to draft. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The product page optimization test fields to change.",
      {
        appStoreVersionExperimentId: nonEmptyString(
          "App Store Connect identifier of the product page optimization test.",
        ),
        name: nonEmptyString("New test name."),
        trafficProportion: s.integer("New percentage of App Store traffic directed to the treatments."),
        started: s.boolean(
          "Pass true to start the test once its treatments are approved. Passing false has no effect on a running test.",
        ),
      },
      { required: ["appStoreVersionExperimentId"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionExperiment: appStoreVersionExperimentResource },
      "The updated product page optimization test.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_store_version_experiment",
    operationType: "destructive",
    description:
      "Delete a product page optimization test together with its treatments. A running test is stopped; results already collected are lost.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appStoreVersionExperimentId: nonEmptyString(
          "App Store Connect identifier of the product page optimization test.",
        ),
      },
      ["appStoreVersionExperimentId"],
      "Identifies the product page optimization test to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted test."),
      "Confirmation that the product page optimization test was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_store_version_experiment_treatments",
    operationType: "read",
    description: "List the treatments of one product page optimization test.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the test whose treatments to list.",
      {
        appStoreVersionExperimentId: nonEmptyString(
          "App Store Connect identifier of the product page optimization test.",
        ),
        ...paginationInputs,
      },
      { required: ["appStoreVersionExperimentId"] },
    ),
    outputSchema: pageOutput(
      "appStoreVersionExperimentTreatments",
      appStoreVersionExperimentTreatmentResource,
      "Treatments returned for this page.",
      "A page of product page optimization treatments.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_experiment_treatment",
    operationType: "read",
    description: "Read one treatment of a product page optimization test.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appStoreVersionExperimentTreatmentId: nonEmptyString("App Store Connect identifier of the treatment."),
      },
      ["appStoreVersionExperimentTreatmentId"],
      "Identifies the treatment to read.",
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionExperimentTreatment: appStoreVersionExperimentTreatmentResource },
      "The requested treatment.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_store_version_experiment_treatment",
    operationType: "write",
    description:
      "Add a treatment to a product page optimization test, optionally using an alternate app icon bundled with the app. Add locales to the treatment with create_app_store_version_experiment_treatment_localization before uploading its screenshots.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The treatment to create.",
      {
        appStoreVersionExperimentId: nonEmptyString(
          "App Store Connect identifier of the product page optimization test.",
        ),
        name: nonEmptyString("Treatment name shown in App Store Connect."),
        appIconName: nonEmptyString(
          "Name of an alternate app icon asset included in the build, shown instead of the default icon.",
        ),
      },
      { required: ["appStoreVersionExperimentId", "name"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionExperimentTreatment: appStoreVersionExperimentTreatmentResource },
      "The created treatment.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_store_version_experiment_treatment",
    operationType: "destructive",
    description:
      "Rename a treatment or change its alternate app icon. Overwrites the given fields; pass null as appIconName to return to the default icon. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The treatment fields to change.",
      {
        appStoreVersionExperimentTreatmentId: nonEmptyString("App Store Connect identifier of the treatment."),
        name: nonEmptyString("New treatment name."),
        appIconName: clearableString("Name of the alternate app icon asset to use, or null to use the default icon."),
      },
      { required: ["appStoreVersionExperimentTreatmentId"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionExperimentTreatment: appStoreVersionExperimentTreatmentResource },
      "The updated treatment.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_store_version_experiment_treatment",
    operationType: "destructive",
    description:
      "Delete a treatment from a product page optimization test, including its localizations and screenshots.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appStoreVersionExperimentTreatmentId: nonEmptyString("App Store Connect identifier of the treatment."),
      },
      ["appStoreVersionExperimentTreatmentId"],
      "Identifies the treatment to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted treatment."),
      "Confirmation that the treatment was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_store_version_experiment_treatment_localizations",
    operationType: "read",
    description:
      "List the locales of one treatment, optionally narrowed to some locales. Screenshots and previews of a treatment are attached to these localizations.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing treatment localizations.",
      {
        appStoreVersionExperimentTreatmentId: nonEmptyString("App Store Connect identifier of the treatment."),
        locales: localesFilter,
        ...paginationInputs,
      },
      { required: ["appStoreVersionExperimentTreatmentId"] },
    ),
    outputSchema: pageOutput(
      "appStoreVersionExperimentTreatmentLocalizations",
      appStoreVersionExperimentTreatmentLocalizationResource,
      "Treatment localizations returned for this page.",
      "A page of treatment localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_experiment_treatment_localization",
    operationType: "read",
    description: "Read one treatment localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appStoreVersionExperimentTreatmentLocalizationId: nonEmptyString(
          "App Store Connect identifier of the treatment localization.",
        ),
      },
      ["appStoreVersionExperimentTreatmentLocalizationId"],
      "Identifies the treatment localization to read.",
    ),
    outputSchema: s.actionOutput(
      {
        appStoreVersionExperimentTreatmentLocalization: appStoreVersionExperimentTreatmentLocalizationResource,
      },
      "The requested treatment localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_store_version_experiment_treatment_localization",
    operationType: "write",
    description:
      "Add a locale to a treatment so screenshots and app previews can be uploaded for it. App Store Connect rejects a locale the treatment already has.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The treatment localization to create.",
      {
        appStoreVersionExperimentTreatmentId: nonEmptyString("App Store Connect identifier of the treatment."),
        locale: localeInput("App Store locale to add, such as en-US."),
      },
      { required: ["appStoreVersionExperimentTreatmentId", "locale"] },
    ),
    outputSchema: s.actionOutput(
      {
        appStoreVersionExperimentTreatmentLocalization: appStoreVersionExperimentTreatmentLocalizationResource,
      },
      "The created treatment localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_store_version_experiment_treatment_localization",
    operationType: "destructive",
    description: "Remove a locale from a treatment, including the screenshots and previews attached to it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appStoreVersionExperimentTreatmentLocalizationId: nonEmptyString(
          "App Store Connect identifier of the treatment localization.",
        ),
      },
      ["appStoreVersionExperimentTreatmentLocalizationId"],
      "Identifies the treatment localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted treatment localization."),
      "Confirmation that the treatment localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_store_version_promotion",
    operationType: "destructive",
    description:
      "Promote the winning treatment of a product page optimization test to the default product page: its screenshots, previews, and app icon are applied to the given App Store version, replacing that version's current product page assets. Use list_app_store_version_experiments to find the control version (latestControlVersionId) the test ran against.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The treatment to promote and the App Store version that receives its product page.",
      {
        appStoreVersionId: nonEmptyString(
          "App Store Connect identifier of the App Store version whose default product page is replaced.",
        ),
        appStoreVersionExperimentTreatmentId: nonEmptyString(
          "App Store Connect identifier of the treatment to promote.",
        ),
      },
      { required: ["appStoreVersionId", "appStoreVersionExperimentTreatmentId"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionPromotion: appStoreVersionPromotionResource },
      "The promotion App Store Connect recorded.",
    ),
  }),
];
