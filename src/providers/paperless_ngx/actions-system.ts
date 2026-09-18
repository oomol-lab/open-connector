import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  correspondentSchema,
  customFieldSchema,
  documentSchema,
  documentTypeSchema,
  emptyInputSchema,
  groupSchema,
  mailAccountSchema,
  mailRuleSchema,
  savedViewSchema,
  storagePathSchema,
  tagSchema,
  userSchema,
  workflowSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const systemStatusOutputSchema = s.looseRequiredObject("The Paperless-ngx system status report.", {
  pngx_version: s.string("The Paperless-ngx server version."),
  server_os: s.string("Operating system description of the server."),
  install_type: s.string("Installation type: bare-metal, docker or kubernetes."),
  storage: s.looseObject("Media storage usage in bytes.", {
    total: s.integer("Total bytes of the media volume."),
    available: s.integer("Available bytes on the media volume."),
  }),
  database: s.looseObject("Database connection status.", {
    type: s.string("Database vendor such as postgresql, sqlite or mysql."),
    url: s.string("Database name or path."),
    status: s.string("OK or ERROR."),
    error: s.nullableString("Connection error detail, or null."),
    migration_status: s.looseObject("Migration state.", {
      latest_migration: s.string("Name of the most recently applied migration."),
      unapplied_migrations: s.array("Migrations that have not been applied yet.", s.string("A migration name.")),
    }),
  }),
  tasks: s.looseObject("Background service health.", {
    redis_url: s.string("Redis URL without credentials."),
    redis_status: s.string("OK or ERROR."),
    redis_error: s.nullableString("Redis error detail, or null."),
    celery_status: s.string("OK, WARNING or ERROR."),
    celery_url: s.nullableString("Name of the first Celery worker that answered, or null."),
    celery_error: s.nullableString("Celery error detail, or null."),
    index_status: s.string("Search index status."),
    index_last_modified: s.nullableString("ISO 8601 timestamp of the last index write, or null."),
    index_error: s.nullableString("Index error detail, or null."),
    classifier_status: s.string("Classifier training status."),
    classifier_last_trained: s.nullableString("ISO 8601 timestamp of the last training, or null."),
    classifier_error: s.nullableString("Classifier error detail, or null."),
    sanity_check_status: s.string("Sanity check status."),
    sanity_check_last_run: s.nullableString("ISO 8601 timestamp of the last sanity check, or null."),
    sanity_check_error: s.nullableString("Sanity check error detail, or null."),
    llmindex_status: s.string("LLM index status, DISABLED when AI is off."),
    llmindex_last_modified: s.nullableString("ISO 8601 timestamp of the last LLM index update, or null."),
    llmindex_error: s.nullableString("LLM index error detail, or null."),
    summary: s.looseObject("Task counts over the last 30 days.", {
      days: s.integer("Number of days aggregated."),
      total_count: s.integer("Total tasks."),
      pending_count: s.integer("Pending tasks."),
      success_count: s.integer("Successful tasks."),
      failure_count: s.integer("Failed tasks."),
    }),
  }),
});

const statisticsOutputSchema = s.looseRequiredObject("Document statistics visible to the connected user.", {
  documents_total: s.integer("Total number of documents."),
  documents_inbox: s.nullableInteger("Number of documents carrying an inbox tag, or null when no inbox tag exists."),
  inbox_tag: s.nullableInteger("Id of the first inbox tag, or null."),
  inbox_tags: s.nullable(s.array("Ids of all inbox tags.", s.integer("A tag id."))),
  document_file_type_counts: s.array(
    "Document counts per MIME type.",
    s.looseObject("A MIME type bucket.", {
      mime_type: s.string("The MIME type."),
      mime_type_count: s.integer("Number of documents with this MIME type."),
    }),
  ),
  character_count: s.integer("Total characters of extracted content."),
  tag_count: s.integer("Number of tags."),
  correspondent_count: s.integer("Number of correspondents."),
  document_type_count: s.integer("Number of document types."),
  storage_path_count: s.integer("Number of storage paths."),
  current_asn: s.integer("Highest archive serial number in use."),
});

const uiSettingsOutputSchema = s.looseRequiredObject("UI settings, permissions and identity of the connected user.", {
  user: s.looseObject("The connected user.", {
    id: s.integer("The user id."),
    username: s.string("The username."),
    is_staff: s.boolean("Whether the user may access the admin site."),
    is_superuser: s.boolean("Whether the user is a superuser."),
    groups: s.array("Ids of the user's groups.", s.integer("A group id.")),
    first_name: s.string("The first name, only present when set."),
    last_name: s.string("The last name, only present when set."),
  }),
  settings: s.looseObject(
    "Stored UI settings merged with server-provided values such as version, app_title, trash_delay, auditlog_enabled, email_enabled and ai_enabled.",
  ),
  permissions: s.array(
    "Permission codenames held by the user without the app label prefix.",
    s.string("A permission codename such as view_document."),
  ),
});

const applicationConfigSchema = s.looseObject(
  "The application configuration singleton. Fields mirror the OCR, barcode, remote OCR and AI settings documented at https://docs.paperless-ngx.com/configuration/; secret values such as llm_api_key and remote_ocr_api_key are returned obfuscated.",
  {
    id: s.integer("The configuration row id."),
    output_type: s.nullableString("OCR output type: pdf, pdfa, pdfa-1, pdfa-2 or pdfa-3."),
    pages: s.nullableInteger("Maximum number of pages to OCR, or null for all."),
    language: s.nullableString("OCR languages, or null for the environment default."),
    mode: s.nullableString("OCR mode: auto, force, redo or off."),
    archive_file_generation: s.nullableString("Archive file generation: auto, always or never."),
    app_title: s.nullableString("Custom application title, or null."),
    app_logo: s.nullableString("URL of the custom logo, or null."),
    barcodes_enabled: s.nullableBoolean("Whether barcode scanning is enabled."),
    ai_enabled: s.nullableBoolean("Whether AI features are enabled."),
    llm_backend: s.nullableString("LLM backend: openai-like or ollama."),
    llm_model: s.nullableString("LLM model name."),
  },
);

const configValuesInputSchema = s.record(
  "Configuration fields to change, keyed by the field names documented at https://docs.paperless-ngx.com/configuration/ and returned by get_application_config (for example output_type, language, mode, pages, app_title, barcodes_enabled, ai_enabled, llm_backend, llm_model, llm_api_key). Pass null to reset a field to the environment default. app_logo cannot be changed through this action.",
  s.unknown("A configuration value."),
);

const logNamesDescription = "Log file key: paperless, mail or celery. Only files that exist on the server are listed.";

export const paperlessNgxSystemActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_statistics",
    operationType: "read",
    description:
      "Get document statistics for the connected user: document totals, inbox counts, MIME type breakdown, character count, object counts and the current archive serial number. Users with the global statistics permission see instance-wide numbers, everyone else sees only the documents they can access.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: statisticsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_system_status",
    operationType: "read",
    description:
      "Get the Paperless-ngx system status: server version, install type, storage usage, database and migration state, Redis and Celery health, search index, classifier, sanity check and LLM index status plus a 30 day task summary. Requires the system status permission (superuser or a user with the view_paperlesstask permission).",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: systemStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_remote_version",
    operationType: "read",
    description:
      "Check the latest released Paperless-ngx version on GitHub and whether it is newer than the connected instance. The instance performs the GitHub lookup and caches it for 15 minutes; when the lookup fails it reports version 0.0.0 with update_available false.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.looseRequiredObject("The remote version check result.", {
      version: s.string("Latest release tag without the ngx- prefix, or 0.0.0 when the lookup failed."),
      update_available: s.boolean("Whether the latest release is newer than the running instance."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_ui_settings",
    operationType: "read",
    description:
      "Get the UI settings, effective permissions and basic identity (id, username, staff and superuser flags, groups) of the user that owns the API token. The settings object also carries server facts such as the Paperless-ngx version, app title, trash delay, audit log, email and AI availability.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: uiSettingsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_ui_settings",
    operationType: "destructive",
    description:
      "Replace the stored UI settings of the connected user with the given settings object. Paperless-ngx overwrites the whole settings document, so send the complete object as returned by get_ui_settings with your changes applied; the update_checking.backend_setting value is never stored.",
    requiredScopes: [],
    inputSchema: s.object("The UI settings to store.", {
      settings: s.record(
        "The complete UI settings document to store for the connected user.",
        s.unknown("A settings value."),
      ),
    }),
    outputSchema: s.requiredObject("The update result.", {
      success: s.boolean("Whether Paperless-ngx stored the settings."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_application_config",
    operationType: "read",
    description:
      "Get the instance-wide application configuration (OCR, archive generation, barcode, remote OCR and AI settings, app title and logo). Values set to null fall back to the corresponding environment variable. Requires the view_applicationconfiguration permission.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: applicationConfigSchema,
  }),
  defineProviderAction(service, {
    name: "update_application_config",
    operationType: "destructive",
    description:
      "Partially update the instance-wide application configuration. Only the fields in values are changed; pass null to reset a field to its environment default. Changing the AI embedding settings makes Paperless-ngx rebuild the LLM index in the background. Requires the change_applicationconfiguration permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The configuration fields to update.",
      {
        id: s.positiveInteger(
          "Id of the configuration row. Defaults to the single existing configuration, so it can normally be omitted.",
        ),
        values: configValuesInputSchema,
      },
      { optional: ["id"] },
    ),
    outputSchema: applicationConfigSchema,
  }),
  defineProviderAction(service, {
    name: "list_logs",
    operationType: "read",
    description:
      "List the log files available on the Paperless-ngx server (paperless, mail and celery when present). Requires admin (staff) access.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.requiredObject("The available log files.", {
      logs: s.array("Log file keys that exist on the server.", s.string(logNamesDescription)),
    }),
  }),
  defineProviderAction(service, {
    name: "get_log",
    operationType: "read",
    description:
      "Read the lines of one Paperless-ngx log file, optionally limited to the last N entries. Requires admin (staff) access.",
    requiredScopes: [],
    inputSchema: s.object(
      "The log file to read.",
      {
        name: s.stringEnum(logNamesDescription, ["paperless", "mail", "celery"]),
        limit: s.positiveInteger("Return only the last N lines of the log file."),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.requiredObject("The log lines.", {
      lines: s.array("Log lines in file order.", s.string("A log line.")),
    }),
  }),
  defineProviderAction(service, {
    name: "global_search",
    operationType: "read",
    description:
      "Search across documents, saved views, tags, correspondents, document types, storage paths, users, groups, mail rules, mail accounts, workflows and custom fields by name or title, returning at most three matches per object type. Documents are matched through the full text index unless db_only is true, in which case only titles are compared.",
    requiredScopes: [],
    inputSchema: s.object(
      "The global search query.",
      {
        query: s.string("Search text, at least three characters.", { minLength: 3 }),
        db_only: s.boolean(
          "When true, match documents by title in the database instead of the full text index. Defaults to false.",
        ),
      },
      { optional: ["db_only"] },
    ),
    outputSchema: s.looseRequiredObject("Global search results, at most three per object type.", {
      total: s.integer("Total number of matches across all object types."),
      documents: s.array("Matching documents.", documentSchema),
      saved_views: s.array("Matching saved views.", savedViewSchema),
      tags: s.array("Matching tags.", tagSchema),
      correspondents: s.array("Matching correspondents.", correspondentSchema),
      document_types: s.array("Matching document types.", documentTypeSchema),
      storage_paths: s.array("Matching storage paths.", storagePathSchema),
      users: s.array("Matching users.", userSchema),
      groups: s.array("Matching groups.", groupSchema),
      mail_rules: s.array("Matching mail rules.", mailRuleSchema),
      mail_accounts: s.array("Matching mail accounts.", mailAccountSchema),
      workflows: s.array("Matching workflows.", workflowSchema),
      custom_fields: s.array("Matching custom fields.", customFieldSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "autocomplete_search",
    operationType: "read",
    description:
      "Get search term completions for a partial word from the full text index, ordered by how many of the user's documents contain each candidate.",
    requiredScopes: [],
    inputSchema: s.object(
      "The autocomplete query.",
      {
        term: s.nonEmptyString("The incomplete search term."),
        limit: s.positiveInteger("Maximum number of completions to return. Defaults to 10."),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.requiredObject("The completion candidates.", {
      terms: s.array("Completion candidates, most frequent first.", s.string("A completed term.")),
    }),
  }),
];
