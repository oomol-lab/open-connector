import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lokalise";

const projectIdSchema = s.nonEmptyString("The unique Lokalise project identifier.");
const keyIdSchema = s.integer("The unique Lokalise key identifier.", { minimum: 1 });
const translationIdSchema = s.integer("The unique Lokalise translation identifier.", {
  minimum: 1,
});
const pageSchema = s.integer("Return results starting from this page.", { minimum: 1 });
const projectLimitSchema = s.integer("The number of items to include, up to 5000.", {
  minimum: 1,
  maximum: 5000,
});
const keyLimitSchema = s.integer("The number of keys to include, up to 500.", {
  minimum: 1,
  maximum: 500,
});
const commaSeparatedSchema = (description: string) => s.nonEmptyString(description);
const rawObjectSchema = s.looseObject("A raw object returned by the official Lokalise API.");
const keyNameSchema = s.anyOf("A Lokalise key name as a string or per-platform object.", [
  s.string("A shared key name."),
  rawObjectSchema,
]);
const totalCountSchema = s.integer("The total number of items reported by Lokalise.", {
  minimum: 0,
});
const platformSchema = s.stringEnum("A Lokalise platform name.", ["android", "ios", "other", "web"]);
const platformsSchema = s.array("Platforms enabled for the key.", platformSchema, { minItems: 1 });
const filenamesInputSchema = s.object(
  "Filenames for each platform.",
  {
    ios: s.nonEmptyString("The iOS platform filename."),
    android: s.nonEmptyString("The Android platform filename."),
    web: s.nonEmptyString("The Web platform filename."),
    other: s.nonEmptyString("The Other platform filename."),
  },
  { optional: ["ios", "android", "web", "other"] },
);
const tagsInputSchema = s.array("Tags to assign to the key.", s.nonEmptyString("A Lokalise tag."));
const translationContentInputSchema = s.anyOf("Translation content as text or plural-form object.", [
  s.string("Translation text."),
  s.looseObject("Plural-form translation object."),
]);
const keyTranslationInputSchema = s.object(
  "A translation to create with a key.",
  {
    language_iso: s.nonEmptyString("The language code of the translation."),
    translation: translationContentInputSchema,
    is_reviewed: s.boolean("Whether the translation should be marked reviewed."),
    is_unverified: s.boolean("Whether the translation should be marked unverified."),
    custom_translation_status_ids: s.array(
      "Custom translation status IDs to assign.",
      s.nonEmptyString("A custom translation status ID."),
    ),
  },
  {
    optional: ["is_reviewed", "is_unverified", "custom_translation_status_ids"],
  },
);
const commentInputSchema = s.object(
  "A comment to create with a key.",
  {
    comment: s.nonEmptyString("The comment message."),
  },
  { required: ["comment"] },
);

const projectSchema = s.looseObject("A Lokalise project.", {
  project_id: s.string("The unique project identifier."),
  project_type: s.string("The project type descriptor."),
  name: s.string("The project name."),
  description: s.string("The project description."),
  created_at: s.string("When the project was created."),
  created_at_timestamp: s.number("Unix timestamp when the project was created."),
  created_by: s.number("The user identifier that created the project."),
  created_by_email: s.string("The email address of the user that created the project."),
  team_id: s.number("The team identifier the project belongs to."),
  base_language_id: s.number("The default project language identifier."),
  base_language_iso: s.string("The default project language code."),
  settings: rawObjectSchema,
  statistics: rawObjectSchema,
});

const languageSchema = s.looseObject("A Lokalise language assigned to a project.", {
  lang_id: s.number("The unique language identifier."),
  lang_iso: s.string("The language or locale code."),
  lang_name: s.string("The language name."),
  is_rtl: s.boolean("Whether the language is right-to-left."),
  plural_forms: s.array("The supported plural forms.", s.unknown("A plural form value.")),
  cc_iso: s.string("The associated country code."),
});

const keySchema = s.looseObject("A Lokalise key.", {
  key_id: s.number("The unique key identifier."),
  created_at: s.string("When the key was created."),
  created_at_timestamp: s.number("Unix timestamp when the key was created."),
  key_name: keyNameSchema,
  filenames: rawObjectSchema,
  description: s.string("The key description."),
  platforms: s.array("The platforms enabled for this key.", s.string("A Lokalise platform name.")),
  tags: s.array("The tags assigned to this key.", s.string("A Lokalise tag.")),
  comments: s.array("Comments attached to this key.", rawObjectSchema),
  screenshots: s.array("Screenshots attached to this key.", rawObjectSchema),
  translations: s.array("Translations included with this key.", rawObjectSchema),
  is_plural: s.boolean("Whether this key is plural."),
  plural_name: s.string("The custom plural name."),
  is_hidden: s.boolean("Whether this key is hidden from non-admin contributors."),
  is_archived: s.boolean("Whether this key is archived."),
  context: s.string("The optional key context."),
  base_words: s.number("The number of words in the base language."),
  char_limit: s.number("The maximum allowed number of characters."),
  custom_attributes: s.array("Custom attributes assigned to this key.", s.unknown("A custom attribute.")),
  modified_at: s.string("When the key was last modified."),
  modified_at_timestamp: s.number("Unix timestamp when the key was last modified."),
  translations_modified_at: s.string("When translations for this key were last modified."),
  translations_modified_at_timestamp: s.number("Unix timestamp when translations for this key were last modified."),
});

const translationSchema = s.looseObject("A Lokalise translation item.", {
  translation_id: s.number("The unique translation identifier."),
  key_id: s.number("The key identifier this translation belongs to."),
  language_iso: s.string("The language code for this translation."),
  modified_at: s.string("When the translation was last modified."),
  modified_at_timestamp: s.number("Unix timestamp when the translation was last modified."),
  modified_by: s.number("The user identifier that last modified the translation."),
  modified_by_email: s.string("The email address of the user that last modified the translation."),
  translation: s.unknown("The translation content returned by Lokalise."),
  is_unverified: s.boolean("Whether the translation is marked unverified."),
  is_reviewed: s.boolean("Whether the translation is marked reviewed."),
  reviewed_by: s.number("The user identifier that reviewed the translation."),
  words: s.number("The number of words in the translation."),
  custom_translation_statuses: s.array(
    "Custom translation statuses assigned to this translation.",
    s.unknown("A custom translation status."),
  ),
  task_id: s.nullableNumber("The task identifier when the translation belongs to a task."),
  segment_number: s.number("The segment number when segmentation is used."),
});

const listProjectsInputSchema = s.object(
  "Query parameters for listing Lokalise projects.",
  {
    filter_team_id: s.integer("Limit results to this Lokalise team ID.", { minimum: 1 }),
    filter_names: commaSeparatedSchema("One or more project names to filter by, comma-separated."),
    include_statistics: s.boolean("Whether to include project statistics."),
    include_settings: s.boolean("Whether to include project settings."),
    limit: projectLimitSchema,
    page: pageSchema,
  },
  {
    optional: ["filter_team_id", "filter_names", "include_statistics", "include_settings", "limit", "page"],
  },
);

const listProjectLanguagesInputSchema = s.object(
  "Query parameters for listing project languages.",
  {
    project_id: projectIdSchema,
    limit: projectLimitSchema,
    page: pageSchema,
  },
  { optional: ["limit", "page"] },
);

const listKeysInputSchema = s.object(
  "Query parameters for listing Lokalise keys.",
  {
    project_id: projectIdSchema,
    disable_references: s.boolean("Whether to disable key references."),
    include_comments: s.boolean("Whether to include comments."),
    include_screenshots: s.boolean("Whether to include screenshot URLs."),
    include_translations: s.boolean("Whether to include translations."),
    filter_translation_lang_ids: commaSeparatedSchema(
      "One or more language IDs to include translations for, comma-separated.",
    ),
    filter_tags: commaSeparatedSchema("One or more tags to filter by, comma-separated."),
    filter_filenames: commaSeparatedSchema("One or more filenames to filter by, comma-separated."),
    filter_keys: commaSeparatedSchema("One or more key names to filter by, comma-separated."),
    filter_key_ids: commaSeparatedSchema("One or more key identifiers to filter by, comma-separated."),
    filter_platforms: commaSeparatedSchema("One or more platforms to filter by, comma-separated."),
    filter_untranslated: s.boolean("Whether to filter untranslated keys."),
    filter_qa_issues: commaSeparatedSchema("One or more QA issue codes to filter by, comma-separated."),
    filter_archived: s.stringEnum("The archive filter to apply.", ["exclude", "include", "only"]),
    limit: keyLimitSchema,
    page: pageSchema,
  },
  {
    optional: [
      "disable_references",
      "include_comments",
      "include_screenshots",
      "include_translations",
      "filter_translation_lang_ids",
      "filter_tags",
      "filter_filenames",
      "filter_keys",
      "filter_key_ids",
      "filter_platforms",
      "filter_untranslated",
      "filter_qa_issues",
      "filter_archived",
      "limit",
      "page",
    ],
  },
);

const createKeyInputSchema = s.object(
  "One Lokalise key to create.",
  {
    key_name: s.nonEmptyString("The key identifier."),
    platforms: platformsSchema,
    description: s.string("The key description."),
    filenames: filenamesInputSchema,
    tags: tagsInputSchema,
    comments: s.array("Comments to attach to this key.", commentInputSchema),
    translations: s.array("Translations to create with this key.", keyTranslationInputSchema),
    is_plural: s.boolean("Whether this key is plural."),
    plural_name: s.string("The custom plural name."),
    is_hidden: s.boolean("Whether this key is hidden from non-admin contributors."),
    is_archived: s.boolean("Whether this key is archived."),
    context: s.string("The optional key context."),
    char_limit: s.number("The maximum allowed number of characters."),
    custom_attributes: s.string("JSON encoded custom key attributes."),
  },
  {
    optional: [
      "description",
      "filenames",
      "tags",
      "comments",
      "translations",
      "is_plural",
      "plural_name",
      "is_hidden",
      "is_archived",
      "context",
      "char_limit",
      "custom_attributes",
    ],
  },
);

const createKeysInputSchema = s.object(
  "Input for creating Lokalise keys.",
  {
    project_id: projectIdSchema,
    keys: s.array("Keys to add to the project.", createKeyInputSchema, { minItems: 1 }),
    use_automations: s.boolean("Whether to run automations on the new key translations."),
  },
  { optional: ["use_automations"] },
);

const getKeyInputSchema = s.object(
  "Input for retrieving one Lokalise key.",
  {
    project_id: projectIdSchema,
    key_id: keyIdSchema,
    disable_references: s.boolean("Whether to disable key references."),
  },
  { optional: ["disable_references"] },
);

const updateKeyInputSchema = s.object(
  "Input for updating one Lokalise key.",
  {
    project_id: projectIdSchema,
    key_id: keyIdSchema,
    key_name: s.nonEmptyString("The key identifier."),
    description: s.string("The key description."),
    platforms: platformsSchema,
    filenames: filenamesInputSchema,
    tags: tagsInputSchema,
    merge_tags: s.boolean("Whether to merge supplied tags with existing tags."),
    is_plural: s.boolean("Whether this key is plural."),
    plural_name: s.string("The custom plural name."),
    is_hidden: s.boolean("Whether this key is hidden from non-admin contributors."),
    is_archived: s.boolean("Whether this key is archived."),
    context: s.string("The optional key context."),
    char_limit: s.number("The maximum allowed number of characters."),
    custom_attributes: s.string("JSON encoded custom key attributes."),
  },
  {
    optional: [
      "key_name",
      "description",
      "platforms",
      "filenames",
      "tags",
      "merge_tags",
      "is_plural",
      "plural_name",
      "is_hidden",
      "is_archived",
      "context",
      "char_limit",
      "custom_attributes",
    ],
  },
);

const listTranslationsInputSchema = s.object(
  "Query parameters for listing Lokalise translations.",
  {
    project_id: projectIdSchema,
    disable_references: s.boolean("Whether to disable key references."),
    filter_lang_id: s.integer("Return translations only for this language ID.", { minimum: 1 }),
    filter_is_reviewed: s.boolean("Whether to filter reviewed translations."),
    filter_unverified: s.boolean("Whether to filter unverified translations."),
    filter_untranslated: s.boolean("Whether to filter untranslated translations."),
    filter_qa_issues: commaSeparatedSchema("One or more QA issue codes to filter by, comma-separated."),
    filter_active_task_id: s.integer("Filter translations by this active task ID.", { minimum: 1 }),
    limit: projectLimitSchema,
    page: pageSchema,
  },
  {
    optional: [
      "disable_references",
      "filter_lang_id",
      "filter_is_reviewed",
      "filter_unverified",
      "filter_untranslated",
      "filter_qa_issues",
      "filter_active_task_id",
      "limit",
      "page",
    ],
  },
);

const getTranslationInputSchema = s.object(
  "Input for retrieving one Lokalise translation.",
  {
    project_id: projectIdSchema,
    translation_id: translationIdSchema,
    disable_references: s.boolean("Whether to disable key references."),
  },
  { optional: ["disable_references"] },
);

const updateTranslationInputSchema = s.object(
  "Input for updating one Lokalise translation.",
  {
    project_id: projectIdSchema,
    translation_id: translationIdSchema,
    translation: translationContentInputSchema,
    is_unverified: s.boolean("Whether the translation should be marked unverified."),
    is_reviewed: s.boolean("Whether the translation should be marked reviewed."),
    custom_translation_status_ids: s.array(
      "Custom translation status IDs to assign, replacing existing statuses.",
      s.nonEmptyString("A custom translation status ID."),
    ),
  },
  { optional: ["is_unverified", "is_reviewed", "custom_translation_status_ids"] },
);

const listProjectsOutputSchema = s.object(
  "A page of Lokalise projects.",
  {
    projects: s.array("Projects returned by Lokalise.", projectSchema),
    totalCount: totalCountSchema,
  },
  { optional: ["totalCount"] },
);

const getProjectOutputSchema = s.object(
  "A Lokalise project response.",
  {
    project: projectSchema,
  },
  { required: ["project"] },
);

const listProjectLanguagesOutputSchema = s.object(
  "A page of Lokalise project languages.",
  {
    projectId: s.string("The Lokalise project identifier."),
    languages: s.array("Project languages returned by Lokalise.", languageSchema),
    totalCount: totalCountSchema,
  },
  { optional: ["totalCount"] },
);

const listKeysOutputSchema = s.object(
  "A page of Lokalise keys.",
  {
    projectId: s.string("The Lokalise project identifier."),
    keys: s.array("Keys returned by Lokalise.", keySchema),
    totalCount: totalCountSchema,
  },
  { optional: ["totalCount"] },
);

const keyOutputSchema = s.object(
  "A Lokalise key response.",
  {
    projectId: s.string("The Lokalise project identifier."),
    key: keySchema,
  },
  { required: ["projectId", "key"] },
);

const createKeysOutputSchema = s.object(
  "Created Lokalise keys.",
  {
    projectId: s.string("The Lokalise project identifier."),
    keys: s.array("Keys returned by Lokalise.", keySchema),
  },
  { required: ["projectId", "keys"] },
);

const deleteKeyOutputSchema = s.object(
  "The result returned after deleting a Lokalise key.",
  {
    projectId: s.string("The Lokalise project identifier."),
    keyRemoved: s.boolean("Whether Lokalise removed the key."),
    keysLocked: s.integer("The number of locked keys reported by Lokalise.", { minimum: 0 }),
  },
  { required: ["projectId", "keyRemoved", "keysLocked"] },
);

const listTranslationsOutputSchema = s.object(
  "A page of Lokalise translations.",
  {
    projectId: s.string("The Lokalise project identifier."),
    translations: s.array("Translations returned by Lokalise.", translationSchema),
    totalCount: totalCountSchema,
  },
  { optional: ["totalCount"] },
);

const translationOutputSchema = s.object(
  "A Lokalise translation response.",
  {
    projectId: s.string("The Lokalise project identifier."),
    translation: translationSchema,
  },
  { required: ["projectId", "translation"] },
);

export const lokaliseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Lokalise projects visible to the API token.",
    requiredScopes: [],
    inputSchema: listProjectsInputSchema,
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve one Lokalise project by project ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving one Lokalise project.",
      {
        project_id: projectIdSchema,
      },
      { required: ["project_id"] },
    ),
    outputSchema: getProjectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_project_languages",
    description: "List languages configured on a Lokalise project.",
    requiredScopes: [],
    inputSchema: listProjectLanguagesInputSchema,
    outputSchema: listProjectLanguagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_keys",
    description: "List translation keys in a Lokalise project.",
    requiredScopes: [],
    inputSchema: listKeysInputSchema,
    outputSchema: listKeysOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_keys",
    description: "Create one or more translation keys in a Lokalise project.",
    requiredScopes: [],
    inputSchema: createKeysInputSchema,
    outputSchema: createKeysOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_key",
    description: "Retrieve one Lokalise key by key ID.",
    requiredScopes: [],
    inputSchema: getKeyInputSchema,
    outputSchema: keyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_key",
    description: "Update one Lokalise key by key ID.",
    requiredScopes: [],
    inputSchema: updateKeyInputSchema,
    outputSchema: keyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_key",
    description: "Delete one Lokalise key by key ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for deleting one Lokalise key.",
      {
        project_id: projectIdSchema,
        key_id: keyIdSchema,
      },
      { required: ["project_id", "key_id"] },
    ),
    outputSchema: deleteKeyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_translations",
    description: "List translation items in a Lokalise project.",
    requiredScopes: [],
    inputSchema: listTranslationsInputSchema,
    outputSchema: listTranslationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_translation",
    description: "Retrieve one Lokalise translation by translation ID.",
    requiredScopes: [],
    inputSchema: getTranslationInputSchema,
    outputSchema: translationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_translation",
    description: "Update one Lokalise translation by translation ID.",
    requiredScopes: [],
    inputSchema: updateTranslationInputSchema,
    outputSchema: translationOutputSchema,
  }),
];
