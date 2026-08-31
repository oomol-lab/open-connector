import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { supabaseScopes } from "./scopes.ts";

const service = "supabase";

const projectStatuses = [
  "ACTIVE_HEALTHY",
  "ACTIVE_UNHEALTHY",
  "COMING_UP",
  "GOING_DOWN",
  "INACTIVE",
  "INIT_FAILED",
  "REMOVED",
  "RESTARTING",
  "UNKNOWN",
  "UPGRADING",
  "PAUSING",
  "RESTORING",
  "RESTORE_FAILED",
  "PAUSE_FAILED",
  "RESIZING",
];
const apiKeyTypes = ["legacy", "publishable", "secret", "unknown"];
const healthServices = ["auth", "db", "db_postgres_user", "pooler", "realtime", "rest", "storage", "pg_bouncer"];
const continents = ["NA", "SA", "EU", "AF", "AS", "OC", "AN"];
const projectSorts = ["name_asc", "name_desc", "created_asc", "created_desc"];

const projectRef = s.string({
  minLength: 1,
  maxLength: 64,
  description: "The Supabase project reference, for example 'abcdefghijklmnopqrst'.",
});
const organizationSlug = s.nonEmptyString("The Supabase organization slug.");
const apiKeyId = s.nonEmptyString("The unique identifier of the project API key.");
const apiKeyName = s.string({
  minLength: 4,
  maxLength: 64,
  pattern: "^[a-z_][a-z0-9_]+$",
  description:
    "The API key name. Use lowercase letters, numbers, and underscores; it must start with a lowercase letter or underscore.",
});
const projectStatus = s.stringEnum(projectStatuses, { description: "The current status of the Supabase project." });
const apiKeyType = s.stringEnum(apiKeyTypes, { description: "The type of the API key." });
const apiKeyCreateType = s.stringEnum(["publishable", "secret"], { description: "The type of API key to create." });
const healthService = s.stringEnum(healthServices, { description: "A Supabase service name to check health for." });
const jsonRecord = s.record(true, { description: "A JSON object returned by Supabase." });

const organizationSummary = s.object(
  {
    id: s.string({ description: "The unique identifier of the organization." }),
    name: s.string({ description: "The name of the organization." }),
    slug: s.nullable(s.string({ description: "The URL slug of the organization." })),
  },
  {
    required: ["id", "name"],
    description: "A Supabase organization summary.",
  },
);
const organizationDetail = s.object(
  {
    id: s.string({ description: "The unique identifier of the organization." }),
    name: s.string({ description: "The name of the organization." }),
    plan: s.string({ description: "The subscription plan of the organization." }),
  },
  {
    required: ["id", "name", "plan"],
    additionalProperties: true,
    description: "The Supabase organization detail payload.",
  },
);
const organizationMember = s.object(
  {
    userId: s.string({ description: "The unique identifier of the member." }),
    userName: s.string({ description: "The display name of the member." }),
    email: s.string({ description: "The email address of the member." }),
    roleName: s.string({ description: "The organization role name of the member." }),
    mfaEnabled: s.boolean({ description: "Whether the member has MFA enabled." }),
  },
  {
    required: ["userId", "userName", "email", "roleName", "mfaEnabled"],
    additionalProperties: true,
    description: "A Supabase organization member.",
  },
);
const database = s.object(
  {
    host: s.string({ description: "The database host address." }),
    version: s.string({ description: "The database version." }),
    postgresEngine: s.nullable(s.string({ description: "The Postgres engine identifier." })),
    releaseChannel: s.nullable(s.string({ description: "The release channel of the database." })),
  },
  {
    required: ["host", "version"],
    description: "A Supabase project database configuration.",
  },
);
const projectSummary = s.object(
  {
    id: s.string({ description: "The unique identifier of the project." }),
    organizationId: s.string({ description: "The organization ID this project belongs to." }),
    name: s.string({ description: "The name of the project." }),
    region: s.string({ description: "The cloud region of the project." }),
    status: projectStatus,
    createdAt: s.string({ description: "The timestamp when the project was created." }),
    database,
  },
  {
    required: ["id", "organizationId", "name", "region", "createdAt"],
    description: "A Supabase project summary.",
  },
);
const projectDetail = s.object(
  {
    id: s.string({ description: "The unique identifier of the project." }),
    ref: s.string({ description: "The project reference identifier." }),
    organizationId: s.string({ description: "The organization ID this project belongs to." }),
    organizationSlug: s.string({ description: "The organization slug." }),
    name: s.string({ description: "The name of the project." }),
    region: s.string({ description: "The cloud region of the project." }),
    status: projectStatus,
    createdAt: s.string({ description: "The timestamp when the project was created." }),
    database,
  },
  {
    required: ["id", "ref", "organizationId", "organizationSlug", "name", "region", "status", "createdAt", "database"],
    description: "A Supabase project detail record.",
  },
);
const organizationProject = s.object(
  {
    ref: s.string({ description: "The project reference identifier." }),
    name: s.string({ description: "The project name." }),
    region: s.string({ description: "The project region." }),
    status: projectStatus,
  },
  {
    required: ["ref", "name", "region", "status"],
    additionalProperties: true,
    description: "A project returned from an organization listing.",
  },
);
const pagination = s.object(
  {
    count: s.number({ description: "The total number of matching records." }),
    limit: s.number({ description: "The maximum number of records returned." }),
    offset: s.number({ description: "The number of records skipped." }),
  },
  {
    required: ["count", "limit", "offset"],
    description: "Pagination metadata returned by Supabase.",
  },
);
const apiKeyRecord = s.object(
  {
    id: s.string({ description: "The unique identifier of the API key." }),
    name: s.string({ description: "The name of the API key." }),
    type: apiKeyType,
    prefix: s.string({ description: "The prefix portion of the API key." }),
    hash: s.string({ description: "The hash of the API key." }),
    description: s.nullable(s.string({ description: "The description of the API key." })),
    apiKey: s.string({ description: "The full API key value when reveal is true and Supabase returns it." }),
    insertedAt: s.string({ description: "The timestamp when the API key was created." }),
    updatedAt: s.string({ description: "The timestamp when the API key was last updated." }),
    secretJwtTemplate: s.nullable(s.record(true, { description: "The JWT template for secret API keys." })),
  },
  {
    required: ["id", "name", "type", "prefix", "hash"],
    description: "A Supabase API key record.",
  },
);
const secretRecord = s.object(
  {
    name: s.string({ description: "The secret name." }),
    value: s.string({ description: "The secret value when Supabase returns it." }),
    updatedAt: s.string({ description: "The timestamp when the secret was last updated." }),
  },
  {
    required: ["name"],
    description: "A Supabase project secret.",
  },
);
const secretInput = s.object(
  {
    name: s.string({
      minLength: 1,
      maxLength: 256,
      description: "The secret name. It must not start with the reserved SUPABASE_ prefix.",
    }),
    value: s.string({ maxLength: 24576, description: "The secret value." }),
  },
  {
    required: ["name", "value"],
    description: "A secret name/value pair to upsert.",
  },
);
const healthRecord = s.object(
  {
    name: healthService,
    healthy: s.boolean({ description: "Deprecated upstream health flag. Prefer status when present." }),
    status: s.string({ description: "The service health status." }),
    error: s.string({ description: "The service health error message when present." }),
  },
  {
    required: ["name", "healthy", "status", "error"],
    additionalProperties: true,
    description: "A Supabase service health result.",
  },
);
const downloadedStorageObject = s.requiredObject("A downloaded Supabase Storage object in local transit storage.", {
  fileId: s.nonEmptyString("The bucket-qualified Supabase Storage object path."),
  name: s.nonEmptyString("The filename used for the local transit file."),
  mimeType: s.nonEmptyString("The downloaded object MIME type."),
  sizeBytes: s.nonNegativeInteger("The downloaded object size in bytes."),
  file: s.requiredObject("The downloaded object in local transit file storage.", {
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit URL for downloading the stored object."),
    sizeBytes: s.nonNegativeInteger("The stored transit file size in bytes."),
    name: s.nonEmptyString("The stored transit file name."),
    mimeType: s.nonEmptyString("The stored transit file MIME type."),
  }),
});
const projectRefInput = s.actionInput(
  { projectRef },
  ["projectRef"],
  "Input parameters identifying a Supabase project.",
);

export const supabaseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List the organizations available to the authenticated Supabase account.",
    requiredScopes: [supabaseScopes.organizationsRead],
    inputSchema: s.actionInput({}, [], "No input parameters are required for this action."),
    outputSchema: s.actionOutput({
      organizations: s.array(organizationSummary, { description: "The list of organizations." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get details for a Supabase organization by slug.",
    requiredScopes: [supabaseScopes.organizationsRead],
    inputSchema: s.actionInput(
      { organizationSlug },
      ["organizationSlug"],
      "Input parameters for fetching an organization.",
    ),
    outputSchema: s.actionOutput({ organization: organizationDetail }),
  }),
  defineProviderAction(service, {
    name: "list_organization_members",
    description: "List members of a Supabase organization.",
    requiredScopes: [supabaseScopes.organizationsRead],
    inputSchema: s.actionInput(
      { organizationSlug },
      ["organizationSlug"],
      "Input parameters for listing organization members.",
    ),
    outputSchema: s.actionOutput({
      members: s.array(organizationMember, { description: "The organization members." }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_organization_projects",
    description: "List projects in a Supabase organization with optional search and pagination.",
    requiredScopes: [supabaseScopes.projectsRead],
    inputSchema: s.actionInput(
      {
        organizationSlug,
        offset: s.integer({ minimum: 0, description: "The number of projects to skip." }),
        limit: s.integer({
          minimum: 1,
          maximum: 100,
          description: "The maximum number of projects to return, up to 100.",
        }),
        search: s.nonEmptyString("Search projects by name."),
        sort: s.stringEnum(projectSorts, { description: "The sort order for projects." }),
        statuses: s.array(projectStatus, { minItems: 1, description: "Project statuses to include." }),
      },
      ["organizationSlug"],
      "Input parameters for listing organization projects.",
    ),
    outputSchema: s.actionOutput({
      projects: s.array(organizationProject, { description: "The projects in the organization." }),
      pagination,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Supabase projects visible to the authenticated account.",
    requiredScopes: [supabaseScopes.projectsRead],
    inputSchema: s.actionInput({}, [], "No input parameters are required for this action."),
    outputSchema: s.actionOutput({ projects: s.array(projectSummary, { description: "The list of projects." }) }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get detailed metadata for a Supabase project by project ref.",
    requiredScopes: [supabaseScopes.projectsRead],
    inputSchema: projectRefInput,
    outputSchema: s.actionOutput({ project: projectDetail }),
  }),
  defineProviderAction(service, {
    name: "list_available_regions",
    description: "List Supabase regions available for creating projects in an organization.",
    requiredScopes: [supabaseScopes.organizationsRead],
    inputSchema: s.actionInput(
      {
        organizationSlug,
        continent: s.stringEnum(continents, { description: "Optional continent code for regional recommendations." }),
        desiredInstanceSize: s.nonEmptyString("Optional desired instance size for availability."),
      },
      ["organizationSlug"],
      "Input parameters for listing available project regions.",
    ),
    outputSchema: s.actionOutput({ regions: jsonRecord }),
  }),
  defineProviderAction(service, {
    name: "get_project_health",
    description: "Check health for selected services in a Supabase project.",
    requiredScopes: [supabaseScopes.projectsRead],
    inputSchema: s.actionInput(
      {
        projectRef,
        services: s.array(healthService, { minItems: 1, description: "The services to check." }),
        timeoutMs: s.integer({
          minimum: 0,
          maximum: 10000,
          description: "Optional timeout in milliseconds, up to 10000.",
        }),
      },
      ["projectRef", "services"],
      "Input parameters for checking project service health.",
    ),
    outputSchema: s.actionOutput({
      services: s.array(healthRecord, { description: "The health results returned by Supabase." }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_project_api_keys",
    description: "List API keys for a Supabase project.",
    requiredScopes: [supabaseScopes.secretsRead],
    inputSchema: s.actionInput(
      { projectRef, reveal: s.boolean({ description: "Whether to reveal the full API key values." }) },
      ["projectRef"],
      "Input parameters for listing project API keys.",
    ),
    outputSchema: s.actionOutput({ apiKeys: s.array(apiKeyRecord, { description: "The list of API keys." }) }),
  }),
  defineProviderAction(service, {
    name: "get_project_api_key",
    description: "Get one API key record from a Supabase project.",
    requiredScopes: [supabaseScopes.secretsRead],
    inputSchema: s.actionInput(
      {
        projectRef,
        apiKeyId,
        reveal: s.boolean({ description: "Whether to reveal the full API key value." }),
      },
      ["projectRef", "apiKeyId"],
      "Input parameters for fetching one project API key.",
    ),
    outputSchema: s.actionOutput({ apiKey: apiKeyRecord }),
  }),
  defineProviderAction(service, {
    name: "create_project_api_key",
    description: "Create a publishable or secret API key for a Supabase project.",
    requiredScopes: [supabaseScopes.secretsWrite],
    inputSchema: s.actionInput(
      {
        projectRef,
        name: apiKeyName,
        type: apiKeyCreateType,
        description: s.nonEmptyString("The optional description for the API key."),
        reveal: s.boolean({ description: "Whether to reveal the full API key value in the response." }),
        secretJwtTemplate: s.record(true, { description: "The JWT template for secret API keys." }),
      },
      ["projectRef", "name", "type"],
      "Input parameters for creating a project API key.",
    ),
    outputSchema: s.actionOutput({ apiKey: apiKeyRecord }),
  }),
  defineProviderAction(service, {
    name: "update_project_api_key",
    description: "Update the name, description, or JWT template for a Supabase project API key.",
    requiredScopes: [supabaseScopes.secretsWrite],
    inputSchema: s.actionInput(
      {
        projectRef,
        apiKeyId,
        name: apiKeyName,
        description: s.nullable(s.string({ description: "The updated API key description." })),
        reveal: s.boolean({ description: "Whether to reveal the full API key value in the response." }),
        secretJwtTemplate: s.nullable(s.record(true, { description: "The updated JWT template for secret API keys." })),
      },
      ["projectRef", "apiKeyId"],
      "Input parameters for updating a project API key.",
    ),
    outputSchema: s.actionOutput({ apiKey: apiKeyRecord }),
  }),
  defineProviderAction(service, {
    name: "delete_project_api_key",
    description: "Delete a Supabase project API key.",
    requiredScopes: [supabaseScopes.secretsWrite],
    inputSchema: s.actionInput(
      {
        projectRef,
        apiKeyId,
        reveal: s.boolean({ description: "Whether Supabase should reveal key data in the delete response." }),
        wasCompromised: s.boolean({ description: "Whether the key is being deleted because it was compromised." }),
        reason: s.nonEmptyString("Optional deletion reason sent to Supabase."),
      },
      ["projectRef", "apiKeyId"],
      "Input parameters for deleting a project API key.",
    ),
    outputSchema: s.actionOutput({ apiKey: apiKeyRecord }),
  }),
  defineProviderAction(service, {
    name: "list_project_secrets",
    description: "List secrets configured for a Supabase project.",
    requiredScopes: [supabaseScopes.secretsRead],
    inputSchema: projectRefInput,
    outputSchema: s.actionOutput({
      secrets: s.array(secretRecord, { description: "The project secrets returned by Supabase." }),
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_project_secrets",
    description: "Bulk create or update secrets for a Supabase project.",
    requiredScopes: [supabaseScopes.secretsWrite],
    inputSchema: s.actionInput(
      { projectRef, secrets: s.array(secretInput, { minItems: 1, description: "The secrets to create or update." }) },
      ["projectRef", "secrets"],
      "Input parameters for upserting project secrets.",
    ),
    outputSchema: s.actionOutput({
      success: s.boolean({ description: "Whether Supabase accepted the secret upsert request." }),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_project_secrets",
    description: "Bulk delete secrets from a Supabase project.",
    requiredScopes: [supabaseScopes.secretsWrite],
    inputSchema: s.actionInput(
      {
        projectRef,
        names: s.array(s.nonEmptyString("A secret name."), {
          minItems: 1,
          description: "The names of secrets to delete.",
        }),
      },
      ["projectRef", "names"],
      "Input parameters for deleting project secrets.",
    ),
    outputSchema: s.actionOutput({
      success: s.boolean({ description: "Whether Supabase accepted the secret delete request." }),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_typescript_types",
    description: "Generate TypeScript database types for a Supabase project.",
    requiredScopes: [supabaseScopes.databaseRead],
    inputSchema: s.actionInput(
      {
        projectRef,
        includedSchemas: s.stringArray("Database schemas to include, such as public or auth.", { minItems: 1 }),
      },
      ["projectRef"],
      "Input parameters for generating TypeScript types.",
    ),
    outputSchema: s.actionOutput({
      typescript: s.string({ description: "The generated TypeScript type definitions." }),
    }),
  }),
  defineProviderAction(service, {
    name: "run_read_only_query",
    description: "Run a SQL query through Supabase as the read-only database user.",
    requiredScopes: [supabaseScopes.databaseRead],
    inputSchema: s.actionInput(
      {
        projectRef,
        query: s.nonEmptyString("The SQL query to run with read-only permissions."),
        parameters: s.array(s.unknown("A query parameter."), { description: "Optional positional query parameters." }),
      },
      ["projectRef", "query"],
      "Input parameters for running a read-only SQL query.",
    ),
    outputSchema: s.actionOutput({
      result: s.unknown(
        "The raw read-only query response returned by Supabase, or null when Supabase returns no response body.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_storage_buckets",
    description: "List Storage buckets for a Supabase project.",
    requiredScopes: [supabaseScopes.storageRead],
    inputSchema: projectRefInput,
    outputSchema: s.actionOutput({
      buckets: s.array(jsonRecord, { description: "The Storage buckets returned by Supabase." }),
    }),
  }),
  defineProviderAction(service, {
    name: "download_storage_object",
    description: "Download an object from Supabase Storage into local transit file storage.",
    requiredScopes: [supabaseScopes.storageRead, supabaseScopes.secretsRead],
    inputSchema: s.actionInput(
      {
        projectRef: s.string({
          minLength: 1,
          maxLength: 64,
          pattern: "^[a-z0-9]+$",
          description: "The lowercase Supabase project reference used by the project API hostname.",
        }),
        bucketId: s.nonEmptyString("The Storage bucket identifier."),
        objectPath: s.nonEmptyString("The complete object path inside the bucket, without a leading slash."),
        apiKeyId: s.nonEmptyString(
          "An optional secret or legacy service_role API key ID. When omitted, the first revealed elevated key is used.",
        ),
        fileName: s.nonEmptyString("An optional filename override for the local transit file."),
      },
      ["projectRef", "bucketId", "objectPath"],
      "Input parameters for downloading one Supabase Storage object.",
    ),
    outputSchema: downloadedStorageObject,
  }),
  defineProviderAction(service, {
    name: "upload_storage_object",
    description: "Upload a local transit file to Supabase Storage.",
    requiredScopes: [supabaseScopes.storageWrite, supabaseScopes.secretsRead],
    inputSchema: s.actionInput(
      {
        projectRef: s.string({
          minLength: 1,
          maxLength: 64,
          pattern: "^[a-z0-9]+$",
          description: "The lowercase Supabase project reference used by the project API hostname.",
        }),
        bucketId: s.nonEmptyString("The Storage bucket identifier."),
        objectPath: s.nonEmptyString("The complete object path inside the bucket, without a leading slash."),
        file: s.object(
          "A local transit file reference to upload.",
          {
            fileId: s.nonEmptyString("The transit file identifier."),
            name: s.nonEmptyString("Optional filename override for the uploaded object."),
            mimeType: s.nonEmptyString("Optional MIME type override."),
          },
          { optional: ["name", "mimeType"] },
        ),
        apiKeyId: s.nonEmptyString(
          "An optional secret or legacy service_role API key ID. When omitted, the first revealed elevated key is used.",
        ),
        contentType: s.nonEmptyString("Optional Content-Type override; defaults to the transit file MIME type."),
        upsert: s.boolean("When true, replace the object if it exists. Defaults to true."),
        cacheControl: s.nonEmptyString("Optional Cache-Control header value."),
      },
      ["projectRef", "bucketId", "objectPath", "file"],
      "Input parameters for uploading one Supabase Storage object.",
    ),
    outputSchema: s.actionOutput({
      bucketId: s.nonEmptyString("The bucket that received the object."),
      objectPath: s.nonEmptyString("The uploaded object path."),
      fileId: s.nonEmptyString("The bucket-qualified Supabase Storage object path."),
      name: s.nonEmptyString("The uploaded filename."),
      mimeType: s.nonEmptyString("The MIME type of the uploaded object."),
      sizeBytes: s.nonNegativeInteger("The uploaded object size in bytes."),
      etag: s.nullable(s.string("The uploaded object ETag, or null when Storage did not return it.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_edge_functions",
    description: "List Edge Functions in a Supabase project.",
    requiredScopes: [supabaseScopes.edgeFunctionsRead],
    inputSchema: projectRefInput,
    outputSchema: s.actionOutput({
      functions: s.array(jsonRecord, { description: "The Edge Functions returned by Supabase." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_edge_function",
    description: "Get metadata for one Supabase Edge Function by slug.",
    requiredScopes: [supabaseScopes.edgeFunctionsRead],
    inputSchema: s.actionInput(
      {
        projectRef,
        functionSlug: s.nonEmptyString("The Edge Function slug."),
      },
      ["projectRef", "functionSlug"],
      "Input parameters for fetching an Edge Function.",
    ),
    outputSchema: s.actionOutput({ function: jsonRecord }),
  }),
];
