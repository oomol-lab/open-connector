import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { speechmaticsBatchRegions } from "./constants.ts";

const service = "speechmatics";

const processingModeValues = ["batch", "realtime"];

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

const additionalVocabularySchema = s.object(
  "A custom word or phrase that should be recognized.",
  {
    content: s.string("The custom word or phrase."),
    soundsLike: s.stringArray("Alternative pronunciations that can help Speechmatics recognize the content."),
  },
  { optional: ["soundsLike"] },
);

const trackingSchema = s.object(
  "Customer-defined metadata retained with the transcription job.",
  {
    title: s.string("The job title."),
    reference: s.string("An external system reference."),
    tags: s.stringArray("Tags associated with the job."),
    details: s.looseObject("Customer-defined JSON metadata."),
  },
  { optional: ["title", "reference", "tags", "details"] },
);

const jobSchema = s.looseRequiredObject(
  "A Speechmatics Batch transcription job.",
  {
    id: s.string("The transcription job identifier."),
    status: s.stringEnum("The current transcription job status.", [
      "running",
      "done",
      "rejected",
      "deleted",
      "expired",
    ]),
    created_at: s.dateTime("When the job was created."),
    data_name: s.string("The submitted media name."),
    duration: s.nonNegativeInteger("The media duration in seconds."),
    errors: s.array("Errors reported while processing the job.", s.looseObject("A Speechmatics job error.")),
  },
  { optional: ["created_at", "data_name", "duration", "errors"] },
);

function transcriptFormatSchema(description: string) {
  return s.stringEnum(description, ["json-v2", "txt", "srt"]);
}

export const speechmaticsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_transcription",
    operationType: "write",
    description:
      "Submit media by URL to the Speechmatics Batch API and return a job ID for status polling and transcript retrieval.",
    inputSchema: s.object(
      "A URL-first Speechmatics Batch transcription request. For local files, upload the file to a publicly reachable or presigned URL first.",
      {
        mediaUrl: s.url("A publicly reachable or presigned media URL that Speechmatics should fetch."),
        language: s.string(
          "The transcription language, normally an ISO language code or auto for language identification.",
        ),
        region: s.stringEnum(
          "The Batch SaaS region. Defaults to the connection region, then eu1.",
          speechmaticsBatchRegions,
        ),
        model: s.stringEnum("The Speechmatics transcription model.", ["standard", "enhanced", "melia-1"]),
        domain: s.string("A specialized transcription domain such as finance or medical."),
        outputLocale: s.string("The locale used to format transcription output."),
        diarization: s.stringEnum("How speakers or channels should be labelled.", ["none", "speaker", "channel"]),
        enableEntities: s.boolean("Whether entity objects should be included in the transcript."),
        additionalVocabulary: s.array("Custom words or phrases that should be recognized.", additionalVocabularySchema),
        mediaAuthHeaders: s.stringArray(
          "Headers Speechmatics should send when fetching the media URL, in Name: Value form.",
        ),
        tracking: trackingSchema,
      },
      {
        optional: [
          "region",
          "model",
          "domain",
          "outputLocale",
          "diarization",
          "enableEntities",
          "additionalVocabulary",
          "mediaAuthHeaders",
          "tracking",
        ],
      },
    ),
    outputSchema: s.looseRequiredObject("The submitted Speechmatics transcription job.", {
      id: s.string("The job identifier used for status and transcript requests."),
    }),
    followUpActions: ["speechmatics.get_transcription_job", "speechmatics.get_transcript"],
    asyncLifecycle: {
      startActionId: "speechmatics.submit_transcription",
      statusActionId: "speechmatics.get_transcription_job",
    },
  }),
  defineProviderAction(service, {
    name: "get_transcription_job",
    operationType: "read",
    description: "Get the current status, metadata, and errors for a Speechmatics Batch job.",
    inputSchema: s.object(
      "A Speechmatics Batch job status request.",
      {
        jobId: s.string("The transcription job identifier."),
        region: s.stringEnum(
          "The same Batch SaaS region used to submit the job. Defaults to the connection region, then eu1.",
          speechmaticsBatchRegions,
        ),
      },
      { optional: ["region"] },
    ),
    outputSchema: s.object("The current Speechmatics Batch job response.", { job: jobSchema }),
    asyncLifecycle: {
      startActionId: "speechmatics.submit_transcription",
      statusActionId: "speechmatics.get_transcription_job",
    },
  }),
  defineProviderAction(service, {
    name: "get_transcript",
    operationType: "read",
    description: "Retrieve a completed Speechmatics transcript as JSON, plain text, or SRT subtitles.",
    inputSchema: s.object(
      "A Speechmatics transcript retrieval request.",
      {
        jobId: s.string("The completed transcription job identifier."),
        region: s.stringEnum(
          "The same Batch SaaS region used to submit the job. Defaults to the connection region, then eu1.",
          speechmaticsBatchRegions,
        ),
        format: transcriptFormatSchema("The requested transcript format. Defaults to json-v2."),
      },
      { optional: ["region", "format"] },
    ),
    outputSchema: s.object("The retrieved Speechmatics transcript.", {
      format: transcriptFormatSchema("The transcript format."),
      transcript: s.anyOf("The JSON transcript document or text transcript.", [
        s.looseObject("A Speechmatics JSON transcript document."),
        s.string("A plain text or SRT transcript."),
      ]),
    }),
  }),
  defineProviderAction(service, {
    name: "get_service_capabilities",
    operationType: "read",
    description:
      "Query the Speechmatics Discovery API for current Batch transcription, translation, language identification, and language metadata capabilities in a cloud region.",
    inputSchema: s.object(
      "Input parameters for querying Speechmatics service capabilities.",
      {
        region: s.stringEnum(speechmaticsBatchRegions, {
          description: "The Batch SaaS region whose Discovery API should be queried.",
          default: "eu1",
        }),
      },
      { optional: ["region"] },
    ),
    outputSchema: s.object("Speechmatics service capabilities for a cloud region.", {
      region: s.stringEnum("The queried Speechmatics Batch SaaS region.", speechmaticsBatchRegions),
      endpoint: s.url("The Discovery API endpoint that was queried."),
      capabilities: discoveryCapabilitiesSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    operationType: "read",
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
