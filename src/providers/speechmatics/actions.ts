import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { speechmaticsBatchRegions } from "./constants.ts";

const service = "speechmatics";

const processingModeValues = ["batch", "realtime"];

const projectSchema = s.looseRequiredObject(
  "A Speechmatics workspace project.",
  {
    project_id: s.integer("The numeric project identifier."),
    is_default: s.nullableBoolean("Whether this is the workspace default project."),
    is_active: s.nullableBoolean("Whether the project is active."),
    name: s.string("The project name."),
    description: s.string("The project description."),
    created_at: s.dateTime("When the project was created."),
    deleted_at: s.nullable(s.dateTime("When the project was deleted, when applicable.")),
  },
  { optional: ["is_default", "is_active", "name", "description", "created_at", "deleted_at"] },
);

const stringArrayRecordSchema = s.record(
  "A map from a language or capability name to its supported values.",
  s.stringArray("Supported values."),
);

const transcriptionCapabilitySchema = s.looseRequiredObject(
  "Speechmatics Batch transcription capabilities for one API version.",
  {
    version: s.string("The capability version."),
    languages: s.stringArray("Supported transcription language codes."),
    locales: stringArrayRecordSchema,
    domains: stringArrayRecordSchema,
    domains_availability: stringArrayRecordSchema,
  },
  { optional: ["locales", "domains", "domains_availability"] },
);

const translationCapabilitySchema = s.looseRequiredObject(
  "Speechmatics Batch translation capabilities for one API version.",
  {
    version: s.string("The capability version."),
    languages: stringArrayRecordSchema,
  },
);

const discoveryCapabilitiesSchema = s.looseRequiredObject(
  "The Speechmatics Discovery API capability document.",
  {
    metadata: s.looseObject("Language metadata returned by Speechmatics.", {
      language_pack_info: s.record(
        "Language pack metadata keyed by Speechmatics language code.",
        s.looseObject("Metadata for one language pack."),
      ),
    }),
    batch: s.looseObject("Capabilities exposed by the Speechmatics Batch API.", {
      transcription: s.array("Batch transcription capabilities.", transcriptionCapabilitySchema),
      translation: s.array("Batch translation capabilities.", translationCapabilitySchema),
      languageid: s.looseObject("Batch language identification capabilities.", {
        languages: s.stringArray("Languages supported by language identification."),
      }),
    }),
  },
  { optional: ["metadata", "batch"] },
);

const deploymentSchema = s.object("A documented Speechmatics cloud API deployment.", {
  mode: s.stringEnum("The processing mode served by this deployment.", processingModeValues),
  region: s.string("The Speechmatics region code."),
  location: s.string("The geographic location of the deployment."),
  customerType: s.stringEnum("Which customers can use the deployment.", ["all", "enterprise"]),
  endpoint: s.string("The production API hostname."),
  protocol: s.stringEnum("The protocol used to connect to the deployment.", ["https", "wss"]),
  apiVersion: s.string("The API version path used by the deployment."),
});

export const speechmaticsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List projects in the Speechmatics workspace associated with the configured Management Token.",
    providerPermissions: ["View projects"],
    inputSchema: s.object("Input parameters for listing Speechmatics projects.", {}),
    outputSchema: s.object("Speechmatics workspace projects.", {
      projects: s.array("Projects returned by the Speechmatics Management API.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_service_capabilities",
    description:
      "Query the Speechmatics Discovery API for current Batch transcription, translation, language identification, and language metadata capabilities in a cloud region.",
    inputSchema: s.object(
      "Input parameters for querying Speechmatics service capabilities.",
      {
        region: s.stringEnum([...speechmaticsBatchRegions], {
          description: "The Batch SaaS region whose Discovery API should be queried.",
          default: "eu1",
        }),
      },
      { optional: ["region"] },
    ),
    outputSchema: s.object("Speechmatics service capabilities for a cloud region.", {
      region: s.stringEnum("The queried Speechmatics Batch SaaS region.", [...speechmaticsBatchRegions]),
      endpoint: s.url("The Discovery API endpoint that was queried."),
      capabilities: discoveryCapabilitiesSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    description:
      "List the Speechmatics Batch and Realtime SaaS production deployments documented for general and enterprise customers.",
    inputSchema: s.object(
      "Input parameters for listing Speechmatics cloud deployments.",
      {
        mode: s.stringEnum("Only return deployments for this processing mode.", processingModeValues),
      },
      { optional: ["mode"] },
    ),
    outputSchema: s.object("Documented Speechmatics cloud deployments.", {
      deployments: s.array("Speechmatics cloud API deployments.", deploymentSchema),
    }),
  }),
];
