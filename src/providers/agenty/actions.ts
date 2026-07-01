import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "agenty";

const agentTypes = ["scraping", "changedetection", "crawling", "mapmonitoring", "brandmonitoring"];
const sortOrderSchema = s.stringEnum("The sort order for the request.", ["asc", "desc"]);
const jsonValueSchema = s.unknown("A JSON-compatible value.");

const nonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });
const positiveInteger = (description: string): JsonSchema => s.integer(description, { minimum: 1 });
const nonNegativeInteger = (description: string): JsonSchema => s.integer(description, { minimum: 0 });
const jsonRecord = (description: string): JsonSchema => s.record(jsonValueSchema, { description });
const looseObject = (description: string, properties: Record<string, JsonSchema>): JsonSchema =>
  s.looseObject(properties, { description });

const listIdentifierSchema = s.anyOf("The Agenty list identifier.", [
  nonEmptyString("The Agenty list identifier as a string."),
  positiveInteger("The Agenty list identifier as a positive integer."),
]);

const paginationInputFields = {
  limit: positiveInteger("The maximum number of records to return."),
  offset: nonNegativeInteger("The number of records to skip before returning results."),
  sort: nonEmptyString("The field used for sorting the results."),
  order: sortOrderSchema,
};

const urlInputSchema = s.object(
  "The input payload for one Agenty browser request.",
  {
    url: s.url("The public HTTP or HTTPS URL to process."),
  },
  { required: ["url"] },
);

const downloadableFileSchema = s.requiredObject("A downloadable file uploaded to connector transit storage.", {
  name: s.string("The generated file name."),
  mimetype: s.string("The generated file MIME type."),
  s3url: s.string("The transit URL for downloading the generated file."),
});

const agentSchema = looseObject("An Agenty agent object.", {
  agent_id: s.string("The Agenty agent identifier."),
  name: s.string("The Agenty agent name."),
  description: s.string("The Agenty agent description."),
  type: s.stringEnum("The Agenty agent type.", agentTypes),
  tags: s.array("The tags assigned to the agent.", s.string("One tag assigned to the agent.")),
  version: s.integer("The Agenty agent version number."),
  config: jsonRecord("The Agenty agent configuration object."),
  is_public: s.anyOf("Whether the agent is public.", [
    s.boolean("Whether the agent is public as a boolean."),
    s.integer("Whether the agent is public as an integer flag."),
  ]),
  is_managed: s.anyOf("Whether the agent is managed.", [
    s.boolean("Whether the agent is managed as a boolean."),
    s.integer("Whether the agent is managed as an integer flag."),
  ]),
  created_at: s.string("The creation timestamp of the agent."),
  updated_at: s.string("The update timestamp of the agent."),
});

const templateSchema = looseObject("An Agenty agent template object.", {
  agent_id: s.string("The Agenty template identifier."),
  name: s.string("The Agenty template name."),
  type: s.stringEnum("The Agenty template type.", agentTypes),
  version: s.integer("The Agenty template version number."),
  is_public: s.anyOf("Whether the template is public.", [
    s.boolean("Whether the template is public as a boolean."),
    s.integer("Whether the template is public as an integer flag."),
  ]),
});

const inputConfigSchema = looseObject("An Agenty input configuration object.", {
  type: s.string("The Agenty input source type."),
  id: s.string("The upstream Agenty input source identifier."),
  field: s.string("The upstream Agenty source field name."),
  collection: s.integer("The Agenty collection index."),
  data: s.array("The Agenty input values.", s.string("One Agenty input value.")),
});

const listSchema = looseObject("An Agenty list object.", {
  list_id: s.anyOf("The Agenty list identifier.", [
    s.string("The Agenty list identifier as a string."),
    s.integer("The Agenty list identifier as a number."),
  ]),
  name: s.string("The Agenty list name."),
  description: s.string("The Agenty list description."),
  account_id: s.integer("The Agenty account identifier."),
  user_id: s.integer("The Agenty user identifier."),
  created_at: s.string("The Agenty list creation timestamp."),
  updated_at: s.string("The Agenty list update timestamp."),
});

const listRowSchema = looseObject("An Agenty list row object.", {
  _id: s.string("The Agenty list row identifier."),
});

const jobSchema = looseObject("An Agenty job object.", {
  job_id: s.integer("The Agenty job identifier."),
  agent_id: s.string("The Agenty agent identifier associated with the job."),
  type: s.string("The Agenty job type."),
  status: s.string("The Agenty job status."),
  priority: s.integer("The Agenty job priority."),
  account_id: s.integer("The Agenty account identifier."),
  created_at: s.string("The Agenty job creation timestamp."),
  started_at: s.string("The Agenty job start timestamp."),
  stopped_at: s.string("The Agenty job stop timestamp."),
  completed_at: s.string("The Agenty job completion timestamp."),
  pages_total: s.integer("The total pages scheduled for the job."),
  pages_processed: s.integer("The processed pages count for the job."),
  pages_succeeded: s.integer("The succeeded pages count for the job."),
  pages_failed: s.integer("The failed pages count for the job."),
  pages_credit: s.integer("The page credits consumed by the job."),
  is_scheduled: s.anyOf("Whether the job is scheduled.", [
    s.boolean("Whether the job is scheduled as a boolean."),
    s.integer("Whether the job is scheduled as an integer flag."),
  ]),
  queue_time: s.string("The Agenty queue time string."),
  run_duration: s.string("The Agenty run duration string."),
});

const messageOutputSchema = s.object(
  "A normalized Agenty message response.",
  {
    statusCode: s.integer("The status code returned by Agenty."),
    message: s.string("The message returned by Agenty."),
  },
  { required: ["message"] },
);

const pagedAgentsOutputSchema = s.requiredObject("A paginated Agenty agent response.", {
  total: s.integer("The total number of Agenty agents available."),
  limit: s.integer("The page size returned by Agenty."),
  offset: s.integer("The offset returned by Agenty."),
  returned: s.integer("The number of Agenty agents returned in this page."),
  agents: s.array("The Agenty agents returned by the request.", agentSchema),
});

const pagedTemplatesOutputSchema = s.requiredObject("A paginated Agenty template response.", {
  total: s.integer("The total number of Agenty templates available."),
  limit: s.integer("The page size returned by Agenty."),
  offset: s.integer("The offset returned by Agenty."),
  returned: s.integer("The number of Agenty templates returned in this page."),
  templates: s.array("The Agenty templates returned by the request.", templateSchema),
});

const pagedJobsOutputSchema = s.requiredObject("A paginated Agenty job response.", {
  total: s.integer("The total number of Agenty jobs available."),
  limit: s.integer("The page size returned by Agenty."),
  offset: s.integer("The offset returned by Agenty."),
  returned: s.integer("The number of Agenty jobs returned in this page."),
  jobs: s.array("The Agenty jobs returned by the request.", jobSchema),
});

const jobResultOutputSchema = s.requiredObject("A paginated Agenty result response.", {
  total: s.integer("The total number of Agenty result rows available."),
  limit: s.integer("The page size returned by Agenty."),
  offset: s.integer("The offset returned by Agenty."),
  returned: s.integer("The number of Agenty result rows returned in this page."),
  result: s.array("The Agenty result rows returned by the request.", jsonRecord("One Agenty result row.")),
});

const jobFilesOutputSchema = s.requiredObject("The Agenty job files response.", {
  files: s.array(
    "The Agenty job files returned by the request.",
    s.requiredObject("One Agenty job file item.", {
      name: s.string("The Agenty job file name."),
      size: s.integer("The Agenty job file size in bytes."),
    }),
  ),
});

const textContentOutputSchema = s.requiredObject("A raw Agenty text content response.", {
  content: s.string("The raw text content returned by Agenty."),
});

export const agentyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_page_content",
    description: "Fetch the rendered HTML content for one web page.",
    inputSchema: urlInputSchema,
    outputSchema: s.requiredObject("The rendered page content returned by Agenty.", {
      content: s.string("The rendered HTML content returned by Agenty."),
    }),
  }),
  defineProviderAction(service, {
    name: "extract_structured_data",
    description: "Extract structured metadata such as JSON-LD, RDFa, microdata, and meta tags.",
    inputSchema: urlInputSchema,
    outputSchema: s.requiredObject("The structured data payload returned by Agenty.", {
      rdfa: jsonValueSchema,
      jsonld: jsonValueSchema,
      metatags: jsonValueSchema,
      microdata: jsonValueSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "capture_screenshot",
    description: "Capture a screenshot for one web page and return a downloadable file.",
    inputSchema: urlInputSchema,
    outputSchema: s.requiredObject("The screenshot payload returned by Agenty.", {
      screenshot: downloadableFileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "convert_url_to_pdf",
    description: "Convert one web page into a PDF document and return a downloadable file.",
    inputSchema: urlInputSchema,
    outputSchema: s.requiredObject("The PDF payload returned by Agenty.", {
      pdf: downloadableFileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_redirects",
    description: "Return the ordered redirect chain for one URL.",
    inputSchema: urlInputSchema,
    outputSchema: s.requiredObject("The redirect chain payload returned by Agenty.", {
      redirects: s.array(
        "The ordered redirect steps returned by Agenty.",
        s.requiredObject("One redirect step returned by Agenty.", {
          url: s.string("The URL at this redirect step."),
          status: s.integer("The HTTP status code at this redirect step."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_agents",
    description: "List Agenty agents with optional pagination and sorting parameters.",
    inputSchema: s.object("The input payload for listing Agenty agents.", paginationInputFields),
    outputSchema: pagedAgentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Get one Agenty agent by agent identifier.",
    inputSchema: s.object(
      "The input payload for retrieving one Agenty agent.",
      {
        agent_id: nonEmptyString("The Agenty agent identifier."),
      },
      { required: ["agent_id"] },
    ),
    outputSchema: s.requiredObject("The single-agent response returned by Agenty.", {
      agent: agentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_agent",
    description: "Create one Agenty agent with the provided configuration.",
    inputSchema: s.object(
      "The input payload for creating one Agenty agent.",
      {
        name: nonEmptyString("The Agenty agent name."),
        type: s.stringEnum("The Agenty agent type.", agentTypes),
        config: jsonRecord("The Agenty agent configuration object."),
        description: s.string("The Agenty agent description."),
        icon: s.string("The Agenty agent icon URL."),
        tags: s.array("The Agenty agent tags.", s.string("One Agenty agent tag.")),
        start: s.boolean("Whether Agenty should start the agent immediately."),
        scripts: jsonRecord("The Agenty scripts configuration."),
      },
      { required: ["name", "type", "config"] },
    ),
    outputSchema: s.requiredObject("The create-agent response returned by Agenty.", {
      agent: agentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_agent",
    description: "Update one Agenty agent by agent identifier.",
    inputSchema: s.object(
      "The input payload for updating one Agenty agent.",
      {
        agent_id: nonEmptyString("The Agenty agent identifier."),
        name: nonEmptyString("The Agenty agent name."),
        type: s.stringEnum("The Agenty agent type.", agentTypes),
        config: jsonRecord("The Agenty agent configuration object."),
        description: s.string("The Agenty agent description."),
        icon: s.string("The Agenty agent icon URL."),
        tags: s.array("The Agenty agent tags.", s.string("One Agenty agent tag.")),
        scripts: jsonRecord("The Agenty scripts configuration."),
      },
      { required: ["agent_id"] },
    ),
    outputSchema: s.requiredObject("The update-agent response returned by Agenty.", {
      agent: agentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "copy_agent",
    description: "Clone one Agenty agent by agent identifier.",
    inputSchema: s.object(
      "The input payload for cloning one Agenty agent.",
      {
        agent_id: nonEmptyString("The Agenty agent identifier."),
      },
      { required: ["agent_id"] },
    ),
    outputSchema: s.requiredObject("The clone-agent response returned by Agenty.", {
      agent: agentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_agent",
    description: "Delete one Agenty agent by agent identifier.",
    inputSchema: s.object(
      "The input payload for deleting one Agenty agent.",
      {
        agent_id: nonEmptyString("The Agenty agent identifier."),
      },
      { required: ["agent_id"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent_templates",
    description: "List public Agenty agent templates with optional pagination and sorting parameters.",
    inputSchema: s.object("The input payload for listing Agenty agent templates.", paginationInputFields),
    outputSchema: pagedTemplatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent_inputs",
    description: "Get the current Agenty input configuration for one agent.",
    inputSchema: s.object(
      "The input payload for retrieving one Agenty input configuration.",
      {
        agent_id: nonEmptyString("The Agenty agent identifier."),
      },
      { required: ["agent_id"] },
    ),
    outputSchema: s.requiredObject("The input-configuration response returned by Agenty.", {
      input: inputConfigSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_agent_inputs",
    description: "Update the Agenty input configuration for one agent.",
    inputSchema: s.object(
      "The input payload for updating one Agenty input configuration.",
      {
        agent_id: nonEmptyString("The Agenty agent identifier."),
        type: nonEmptyString("The Agenty input source type."),
        id: s.string("The upstream Agenty input source identifier."),
        field: s.string("The upstream Agenty source field name."),
        collection: s.integer("The Agenty collection index."),
        data: s.array("The Agenty input values.", s.string("One Agenty input value.")),
      },
      { required: ["agent_id", "type"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_list",
    description: "Create one Agenty list.",
    inputSchema: s.object(
      "The input payload for creating one Agenty list.",
      {
        name: nonEmptyString("The Agenty list name."),
        description: s.string("The Agenty list description."),
      },
      { required: ["name"] },
    ),
    outputSchema: s.requiredObject("The create-list response returned by Agenty.", {
      list: listSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Get one Agenty list by list identifier.",
    inputSchema: s.object(
      "The input payload for retrieving one Agenty list.",
      {
        list_id: listIdentifierSchema,
      },
      { required: ["list_id"] },
    ),
    outputSchema: s.requiredObject("The single-list response returned by Agenty.", {
      list: listSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_list_rows",
    description: "Insert one or more rows into one Agenty list.",
    inputSchema: s.object(
      "The input payload for inserting Agenty list rows.",
      {
        list_id: listIdentifierSchema,
        rows: s.array("The Agenty list rows to insert.", jsonRecord("One Agenty list row payload."), {
          minItems: 1,
        }),
      },
      { required: ["list_id", "rows"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_list_row",
    description: "Get one Agenty list row by list and row identifiers.",
    inputSchema: s.object(
      "The input payload for retrieving one Agenty list row.",
      {
        list_id: listIdentifierSchema,
        row_id: nonEmptyString("The Agenty list row identifier."),
      },
      { required: ["list_id", "row_id"] },
    ),
    outputSchema: s.requiredObject("The single-row response returned by Agenty.", {
      row: listRowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_list_row",
    description: "Delete one Agenty list row by list and row identifiers.",
    inputSchema: s.object(
      "The input payload for deleting one Agenty list row.",
      {
        list_id: listIdentifierSchema,
        row_id: nonEmptyString("The Agenty list row identifier."),
      },
      { required: ["list_id", "row_id"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_list_rows",
    description: "Delete multiple Agenty list rows by list identifier and row identifiers.",
    inputSchema: s.object(
      "The input payload for deleting multiple Agenty list rows.",
      {
        list_id: listIdentifierSchema,
        row_id: s.array(
          "The Agenty list row identifiers to delete.",
          nonEmptyString("One Agenty list row identifier."),
          {
            minItems: 1,
          },
        ),
      },
      { required: ["list_id", "row_id"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "clear_list_rows",
    description: "Delete all rows from one Agenty list.",
    inputSchema: s.object(
      "The input payload for clearing one Agenty list.",
      {
        list_id: listIdentifierSchema,
      },
      { required: ["list_id"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "download_list_rows",
    description: "Download all rows from one Agenty list as raw text content.",
    inputSchema: s.object(
      "The input payload for downloading Agenty list rows.",
      {
        list_id: listIdentifierSchema,
      },
      { required: ["list_id"] },
    ),
    outputSchema: textContentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_job",
    description: "Start one Agenty job for an existing agent.",
    inputSchema: s.object(
      "The input payload for starting one Agenty job.",
      {
        agent_id: nonEmptyString("The Agenty agent identifier."),
      },
      { required: ["agent_id"] },
    ),
    outputSchema: s.requiredObject("The start-job response returned by Agenty.", {
      job: jobSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Get one Agenty job by job identifier.",
    inputSchema: s.object(
      "The input payload for retrieving one Agenty job.",
      {
        job_id: positiveInteger("The Agenty job identifier."),
      },
      { required: ["job_id"] },
    ),
    outputSchema: s.requiredObject("The single-job response returned by Agenty.", {
      job: jobSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    description: "List Agenty jobs with optional pagination, sorting, and agent filtering parameters.",
    inputSchema: s.object("The input payload for listing Agenty jobs.", {
      ...paginationInputFields,
      agent_id: nonEmptyString("The Agenty agent identifier used to filter jobs."),
    }),
    outputSchema: pagedJobsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "stop_job",
    description: "Stop one running Agenty job by job identifier.",
    inputSchema: s.object(
      "The input payload for stopping one Agenty job.",
      {
        job_id: positiveInteger("The Agenty job identifier."),
      },
      { required: ["job_id"] },
    ),
    outputSchema: s.requiredObject("The stop-job response returned by Agenty.", {
      job: jobSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_job_logs",
    description: "Get raw log content for one Agenty job.",
    inputSchema: s.object(
      "The input payload for retrieving Agenty job logs.",
      {
        job_id: positiveInteger("The Agenty job identifier."),
        limit: positiveInteger("The maximum number of log lines to return."),
        offset: nonNegativeInteger("The number of log lines to skip before returning results."),
      },
      { required: ["job_id"] },
    ),
    outputSchema: textContentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job_result",
    description: "Get paginated result rows for one Agenty job.",
    inputSchema: s.object(
      "The input payload for retrieving Agenty job results.",
      {
        job_id: positiveInteger("The Agenty job identifier."),
        limit: positiveInteger("The maximum number of result rows to return."),
        offset: nonNegativeInteger("The number of result rows to skip before returning results."),
        sort: nonEmptyString("The field used for sorting the Agenty job results."),
        order: sortOrderSchema,
        search: nonEmptyString("The search term used to filter Agenty job results."),
        format: nonEmptyString("The Agenty result format selector."),
        collection: s.anyOf("The Agenty collection selector.", [
          nonEmptyString("The Agenty collection selector as a string."),
          positiveInteger("The Agenty collection selector as a positive integer."),
        ]),
      },
      { required: ["job_id"] },
    ),
    outputSchema: jobResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "download_job_result",
    description: "Download one Agenty job export as raw text content.",
    inputSchema: s.object(
      "The input payload for downloading one Agenty job export.",
      {
        job_id: positiveInteger("The Agenty job identifier."),
        format: s.stringEnum("The export format requested from Agenty.", ["CSV", "TSV", "JSON"]),
        collection: positiveInteger("The Agenty collection number to export."),
        modified: s.boolean("Whether Agenty should export the modified result set."),
        filename: nonEmptyString("The custom export file name requested from Agenty."),
      },
      { required: ["job_id", "format"] },
    ),
    outputSchema: textContentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_job_files",
    description: "List the files generated for one Agenty job.",
    inputSchema: s.object(
      "The input payload for listing Agenty job files.",
      {
        job_id: positiveInteger("The Agenty job identifier."),
      },
      { required: ["job_id"] },
    ),
    outputSchema: jobFilesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "download_job_file",
    description: "Download one named Agenty job file and return a downloadable file.",
    inputSchema: s.object(
      "The input payload for downloading one Agenty job file.",
      {
        job_id: positiveInteger("The Agenty job identifier."),
        name: nonEmptyString("The Agenty job file name."),
      },
      { required: ["job_id", "name"] },
    ),
    outputSchema: s.requiredObject("The downloaded Agenty job file payload.", {
      file: downloadableFileSchema,
    }),
  }),
];

export type AgentyActionName =
  | "get_page_content"
  | "extract_structured_data"
  | "capture_screenshot"
  | "convert_url_to_pdf"
  | "get_redirects"
  | "list_agents"
  | "get_agent"
  | "create_agent"
  | "update_agent"
  | "copy_agent"
  | "delete_agent"
  | "get_agent_templates"
  | "get_agent_inputs"
  | "update_agent_inputs"
  | "create_list"
  | "get_list"
  | "add_list_rows"
  | "get_list_row"
  | "delete_list_row"
  | "delete_list_rows"
  | "clear_list_rows"
  | "download_list_rows"
  | "start_job"
  | "get_job"
  | "list_jobs"
  | "stop_job"
  | "get_job_logs"
  | "get_job_result"
  | "download_job_result"
  | "list_job_files"
  | "download_job_file";
