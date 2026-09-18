import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "simplelocalize";

const emptyInputSchema = s.object("The input payload for this SimpleLocalize action.", {});
const successOutputSchema = s.object("The acknowledgement returned after the operation succeeds.", {
  success: s.boolean("Whether SimpleLocalize completed the requested operation."),
});
const apiDataOutputSchema = (description: string) =>
  s.object(description, {
    data: s.looseObject("The project data returned by SimpleLocalize."),
  });
const pageDetailsSchema = s.looseObject("The pagination details returned by SimpleLocalize.");

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  operationType: "read",
  description: "Get details and localization statistics for the authenticated SimpleLocalize project.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: apiDataOutputSchema("The authenticated SimpleLocalize project details."),
});

const listTranslationsAction = defineProviderAction(service, {
  name: "list_translations",
  operationType: "read",
  description: "List and filter translations in the authenticated SimpleLocalize project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters and pagination used to list SimpleLocalize translations.",
    {
      key: s.string("The exact translation key to filter by."),
      namespace: s.string("The exact namespace to filter by."),
      language: s.string("The language key to filter by."),
      text: s.string("Text to search for, using a case-insensitive contains match.", {
        minLength: 3,
      }),
      customerId: s.string("The customer identifier to filter by."),
      baseOnly: s.boolean("Whether to exclude customer-specific translations."),
      reviewStatus: s.stringEnum("The review status to filter by.", ["REVIEWED", "NOT_REVIEWED"]),
      page: s.integer("The zero-based result page.", { minimum: 0 }),
      size: s.integer("The number of translations per page.", { minimum: 1, maximum: 2500 }),
      sortBy: s.stringEnum("The field used to sort translations.", ["lastModifiedAt"]),
      sortOrder: s.stringEnum("The translation sort direction.", ["asc", "desc"]),
      version: s.stringEnum("The translation version to return.", ["REVIEWED"]),
    },
    {
      optional: [
        "key",
        "namespace",
        "language",
        "text",
        "customerId",
        "baseOnly",
        "reviewStatus",
        "page",
        "size",
        "sortBy",
        "sortOrder",
        "version",
      ],
    },
  ),
  outputSchema: s.object("A page of translations returned by SimpleLocalize.", {
    translations: s.array(
      "The translations on the requested page.",
      s.looseObject("A translation returned by SimpleLocalize."),
    ),
    pageDetails: s.nullable(pageDetailsSchema),
  }),
});

const updateTranslationAction = defineProviderAction(service, {
  name: "update_translation",
  operationType: "write",
  description: "Update the text or review state of one SimpleLocalize translation.",
  requiredScopes: [],
  inputSchema: s.object(
    "The SimpleLocalize translation to update.",
    {
      key: s.nonEmptyString("The translation key to update."),
      language: s.nonEmptyString("The language key of the translation to update."),
      text: s.string("The new translation text.", { maxLength: 16382 }),
      namespace: s.string("The namespace containing the translation key."),
      customerId: s.string("The customer identifier for a customer-specific translation."),
      reviewStatus: s.stringEnum("The new review status.", ["REVIEWED", "NOT_REVIEWED"]),
    },
    { optional: ["namespace", "customerId", "reviewStatus"] },
  ),
  outputSchema: successOutputSchema,
});

const listTranslationKeysAction = defineProviderAction(service, {
  name: "list_translation_keys",
  operationType: "read",
  description: "List translation keys and their metadata in the authenticated project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters and pagination used to list SimpleLocalize translation keys.",
    {
      key: s.string("The exact translation key to filter by."),
      namespace: s.string("The exact namespace to filter by."),
      sort: s.stringEnum("The field used to sort translation keys.", [
        "last_seen_at",
        "modified_at",
        "created_at",
        "deprecated_at",
      ]),
      page: s.integer("The zero-based result page.", { minimum: 0 }),
      size: s.integer("The number of translation keys per page.", {
        minimum: 1,
        maximum: 2500,
      }),
    },
    { optional: ["key", "namespace", "sort", "page", "size"] },
  ),
  outputSchema: s.object("A page of translation keys returned by SimpleLocalize.", {
    translationKeys: s.array(
      "The translation keys on the requested page.",
      s.looseObject("A translation key and its metadata returned by SimpleLocalize."),
    ),
    pageDetails: s.nullable(pageDetailsSchema),
  }),
});

const createTranslationKeyAction = defineProviderAction(service, {
  name: "create_translation_key",
  operationType: "write",
  description: "Create a translation key in the authenticated SimpleLocalize project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The SimpleLocalize translation key to create.",
    {
      key: s.nonEmptyString("The translation key to create.", { maxLength: 500 }),
      namespace: s.string("The namespace for the translation key.", { maxLength: 128 }),
      description: s.string("A translator-facing description for the key.", { maxLength: 500 }),
      codeDescription: s.string("A code-facing description for the key.", { maxLength: 500 }),
      charactersLimit: s.integer("The maximum translated-text length, or -1 for no limit."),
      lock: s.boolean("Whether to prevent the translation key from being modified."),
      deprecated: s.boolean("Whether to mark the translation key as deprecated."),
      tags: s.array("Up to five tags assigned to the key.", s.string("A tag name."), {
        maxItems: 5,
      }),
      attributes: s.record(
        "Provider-defined attributes assigned to the translation key.",
        s.unknown("An attribute value."),
      ),
    },
    {
      optional: [
        "namespace",
        "description",
        "codeDescription",
        "charactersLimit",
        "lock",
        "deprecated",
        "tags",
        "attributes",
      ],
    },
  ),
  outputSchema: successOutputSchema,
});

const listLanguagesAction = defineProviderAction(service, {
  name: "list_languages",
  operationType: "read",
  description: "List languages configured in the authenticated SimpleLocalize project.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: s.object("The project languages returned by SimpleLocalize.", {
    languages: s.array(
      "The languages configured in the project.",
      s.looseObject("A language returned by SimpleLocalize."),
    ),
  }),
});

const createLanguageAction = defineProviderAction(service, {
  name: "create_language",
  operationType: "write",
  description: "Create a language in the authenticated SimpleLocalize project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The SimpleLocalize language to create.",
    {
      key: s.nonEmptyString("The case-sensitive language key.", { maxLength: 20 }),
      name: s.string("The display name for the language.", { maxLength: 200 }),
    },
    { optional: ["name"] },
  ),
  outputSchema: s.object("The language created by SimpleLocalize.", {
    language: s.looseObject("The created language."),
  }),
});

const updateLanguageInputSchema = s.object(
  "The SimpleLocalize language update.",
  {
    languageKey: s.nonEmptyString("The current case-sensitive language key."),
    key: s.nonEmptyString("The replacement language key.", { maxLength: 20 }),
    name: s.string("The replacement display name.", { maxLength: 200 }),
  },
  { optional: ["key", "name"] },
);

const updateLanguageAction = defineProviderAction(service, {
  name: "update_language",
  operationType: "write",
  description: "Update a language in the authenticated SimpleLocalize project.",
  requiredScopes: [],
  inputSchema: updateLanguageInputSchema,
  outputSchema: successOutputSchema,
});

const deleteLanguageAction = defineProviderAction(service, {
  name: "delete_language",
  operationType: "destructive",
  description: "Delete a language from the authenticated SimpleLocalize project.",
  requiredScopes: [],
  inputSchema: s.object("The SimpleLocalize language to delete.", {
    languageKey: s.nonEmptyString("The case-sensitive language key to delete."),
  }),
  outputSchema: successOutputSchema,
});

export const simpleLocalizeActions: ActionDefinition[] = [
  getProjectAction,
  listTranslationsAction,
  updateTranslationAction,
  listTranslationKeysAction,
  createTranslationKeyAction,
  listLanguagesAction,
  createLanguageAction,
  updateLanguageAction,
  deleteLanguageAction,
];
