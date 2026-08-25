import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jobnimbus";

const recordIdSchema = s.nonEmptyString("The JobNimbus record identifier.");
const actorSchema = s.nonEmptyString(
  "The optional JobNimbus actor email used to execute the request as a specific team member.",
);
const fieldsSchema = s.stringArray("The JobNimbus field names to include in the response.", {
  minItems: 1,
  itemDescription: "One JobNimbus field name.",
});
const skipSchema = s.stringArray("The JobNimbus automated steps to bypass, such as automation or notification.", {
  minItems: 1,
  itemDescription: "One JobNimbus skip flag.",
});
const filterSchema = s.looseObject(
  "A JobNimbus Elasticsearch-style filter object that will be JSON-encoded for the filter query parameter.",
);
const contactRecordSchema = s.looseObject("The raw JobNimbus contact record returned by the API.");
const jobRecordSchema = s.looseObject("The raw JobNimbus job record returned by the API.");
const contactWriteDataSchema = s.looseObject(
  "The raw JobNimbus contact payload to send to the API, including standard and custom fields.",
);
const jobWriteDataSchema = s.looseObject(
  "The raw JobNimbus job payload to send to the API, including standard and custom fields.",
);

const sharedListInputProperties = {
  actor: actorSchema,
  size: s.positiveInteger("The maximum number of records to return.", { maximum: 1000 }),
  from: s.nonNegativeInteger("The zero-based starting offset for pagination."),
  sortField: s.nonEmptyString("The JobNimbus field name used for sorting."),
  sortDirection: s.stringEnum("The JobNimbus sort direction.", ["asc", "desc"]),
  fields: fieldsSchema,
  filter: filterSchema,
};

const writeInputProperties = {
  actor: actorSchema,
  bulk: s.boolean("Whether to ask JobNimbus for optimistic bulk persistence on this write request."),
  skip: skipSchema,
};

export const jobnimbusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description:
      "List JobNimbus contacts with the standard pagination, sorting, field selection, actor, and Elasticsearch-style filter options.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing JobNimbus contacts.",
      {
        ...sharedListInputProperties,
        size: s.positiveInteger("The maximum number of contacts to return.", { maximum: 1000 }),
      },
      {
        optional: ["actor", "size", "from", "sortField", "sortDirection", "fields", "filter"],
      },
    ),
    outputSchema: s.object("The normalized JobNimbus contact list response.", {
      count: s.nonNegativeInteger("The total number of contacts returned by the API response."),
      contacts: s.array("The JobNimbus contacts returned for this request.", contactRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one JobNimbus contact by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for reading one JobNimbus contact.",
      {
        contactId: recordIdSchema,
        actor: actorSchema,
        fields: fieldsSchema,
      },
      { optional: ["actor", "fields"] },
    ),
    outputSchema: s.object("The JobNimbus contact detail response.", {
      contact: contactRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description:
      "Create one JobNimbus contact from a raw contact payload, with optional actor, bulk, and skip controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating one JobNimbus contact.",
      {
        ...writeInputProperties,
        data: contactWriteDataSchema,
      },
      { optional: ["actor", "bulk", "skip"] },
    ),
    outputSchema: s.object("The JobNimbus contact create response.", {
      contact: contactRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description:
      "Update one JobNimbus contact by ID from a raw contact payload, with optional actor, bulk, and skip controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating one JobNimbus contact.",
      {
        contactId: recordIdSchema,
        ...writeInputProperties,
        data: contactWriteDataSchema,
      },
      { optional: ["actor", "bulk", "skip"] },
    ),
    outputSchema: s.object("The JobNimbus contact update response.", {
      contact: contactRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    description:
      "List JobNimbus jobs with the standard pagination, sorting, field selection, actor, and Elasticsearch-style filter options.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing JobNimbus jobs.",
      {
        ...sharedListInputProperties,
        size: s.positiveInteger("The maximum number of jobs to return.", { maximum: 1000 }),
      },
      {
        optional: ["actor", "size", "from", "sortField", "sortDirection", "fields", "filter"],
      },
    ),
    outputSchema: s.object("The normalized JobNimbus job list response.", {
      count: s.nonNegativeInteger("The total number of jobs returned by the API response."),
      jobs: s.array("The JobNimbus jobs returned for this request.", jobRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Get one JobNimbus job by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for reading one JobNimbus job.",
      {
        jobId: recordIdSchema,
        actor: actorSchema,
        fields: fieldsSchema,
      },
      { optional: ["actor", "fields"] },
    ),
    outputSchema: s.object("The JobNimbus job detail response.", {
      job: jobRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_job",
    description: "Create one JobNimbus job from a raw job payload, with optional actor, bulk, and skip controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating one JobNimbus job.",
      {
        ...writeInputProperties,
        data: jobWriteDataSchema,
      },
      { optional: ["actor", "bulk", "skip"] },
    ),
    outputSchema: s.object("The JobNimbus job create response.", {
      job: jobRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_job",
    description: "Update one JobNimbus job by ID from a raw job payload, with optional actor, bulk, and skip controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating one JobNimbus job.",
      {
        jobId: recordIdSchema,
        ...writeInputProperties,
        data: jobWriteDataSchema,
      },
      { optional: ["actor", "bulk", "skip"] },
    ),
    outputSchema: s.object("The JobNimbus job update response.", {
      job: jobRecordSchema,
    }),
  }),
];
