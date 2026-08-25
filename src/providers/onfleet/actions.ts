import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "onfleet" as const;

const taskIdSchema = s.nonWhitespaceString("The Onfleet task identifier.");
const rawTaskSchema = s.looseObject("The task object returned by Onfleet.");
const destinationSchema = s.anyOf("An existing destination ID or an inline destination object.", [
  s.nonWhitespaceString("An existing Onfleet destination identifier."),
  s.looseObject("An inline Onfleet destination object."),
]);
const recipientSchema = s.anyOf("An existing recipient ID or an inline recipient object.", [
  s.nonWhitespaceString("An existing Onfleet recipient identifier."),
  s.looseObject("An inline Onfleet recipient object."),
]);
const metadataSchema = s.array(
  "Provider-defined metadata entries attached to the task.",
  s.looseObject("An Onfleet metadata entry."),
);
const customFieldsSchema = s.array(
  "Custom field values attached to the task.",
  s.looseObject("An Onfleet task custom field value."),
);
const recipientsSchema = s.array("Zero or one recipients for the task.", recipientSchema, {
  maxItems: 1,
});
const requirementsSchema = s.object(
  "Completion requirements for the task.",
  {
    signature: s.boolean("Whether a signature is required to complete the task."),
    photo: s.boolean("Whether a photo is required to complete the task."),
    notes: s.boolean("Whether notes are required to complete the task."),
    minimumAge: s.number("The minimum recipient age required to complete the task."),
    pin: s.nullable(s.boolean("Whether PIN verification is required for the task.")),
  },
  { optional: ["signature", "photo", "notes", "minimumAge", "pin"] },
);
const additionalQuantitiesSchema = s.object(
  "Additional route optimization quantities attached to the task.",
  {
    quantityA: s.number("The arbitrary quantity for capacity type A."),
    quantityB: s.number("The arbitrary quantity for capacity type B."),
    quantityC: s.number("The arbitrary quantity for capacity type C."),
  },
  { optional: ["quantityA", "quantityB", "quantityC"] },
);

const createTaskAction = defineProviderAction(service, {
  name: "create_task",
  description: "Create a pickup or delivery task in Onfleet.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating an Onfleet task.",
    {
      destination: destinationSchema,
      recipients: recipientsSchema,
      merchant: s.nonWhitespaceString("The organization ID displayed to the recipient."),
      executor: s.nonWhitespaceString("The organization ID responsible for fulfilling the task."),
      completeAfter: s.integer("The earliest completion time in Unix milliseconds."),
      completeBefore: s.integer("The latest completion time in Unix milliseconds."),
      pickupTask: s.boolean("Whether this is a pickup task instead of a delivery task."),
      dependencies: s.stringArray("Task IDs that must be completed before this task."),
      notes: s.string("Notes for the task.", { maxLength: 10_000 }),
      autoAssign: s.looseObject("Automatic worker assignment options."),
      container: s.looseObject("The organization, team, or worker container for the task."),
      quantity: s.number("The quantity associated with the task."),
      serviceTime: s.number("The expected service time at the destination in minutes."),
      recipientName: s.string("A task-level recipient name override."),
      recipientNotes: s.string("Task-level recipient notes."),
      recipientSkipSMSNotifications: s.boolean("Whether to suppress SMS notifications for this task recipient."),
      useMerchantForProxy: s.boolean(
        "Whether to use the merchant organization for recipient-facing proxy communication.",
      ),
      requirements: requirementsSchema,
      scanOnlyRequiredBarcodes: s.boolean("Whether workers may scan only barcodes required by this task."),
      barcode: s.array("Barcode requirements attached to the task.", s.looseObject("An Onfleet barcode requirement.")),
      appearance: s.object("Map-pin appearance settings for the task.", {
        triangleColor: s.integer("The map-pin color: 0 teal, 1 orange, or 2 magenta.", {
          minimum: 0,
          maximum: 2,
        }),
      }),
      metadata: metadataSchema,
      customFields: customFieldsSchema,
      additionalQuantities: additionalQuantitiesSchema,
      priority: s.number("The route optimization priority for the task.", {
        minimum: 0,
        maximum: 499,
      }),
      group: s.string("The route optimization group for the task.", { maxLength: 100 }),
    },
    {
      optional: [
        "merchant",
        "executor",
        "completeAfter",
        "completeBefore",
        "pickupTask",
        "dependencies",
        "notes",
        "autoAssign",
        "container",
        "quantity",
        "serviceTime",
        "recipientName",
        "recipientNotes",
        "recipientSkipSMSNotifications",
        "useMerchantForProxy",
        "requirements",
        "scanOnlyRequiredBarcodes",
        "barcode",
        "appearance",
        "metadata",
        "customFields",
        "additionalQuantities",
        "priority",
        "group",
      ],
    },
  ),
  outputSchema: rawTaskSchema,
});

const listTasksAction = defineProviderAction(service, {
  name: "list_tasks",
  description: "List Onfleet tasks in a time range with cursor pagination and task filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Onfleet tasks.",
    {
      from: s.integer("The inclusive start time in Unix milliseconds."),
      to: s.integer("The exclusive end time in Unix milliseconds."),
      lastId: s.nonWhitespaceString("The pagination cursor returned by the previous page."),
      state: s.array(
        "Task states to include: 0 unassigned, 1 assigned, 2 active, or 3 completed.",
        s.integer("An Onfleet task state.", { minimum: 0, maximum: 3 }),
      ),
      worker: s.nonWhitespaceString("The worker ID used to filter tasks."),
      completeBeforeBefore: s.integer(
        "Only include tasks whose completeBefore is before this Unix millisecond timestamp.",
      ),
      completeAfterAfter: s.integer("Only include tasks whose completeAfter is after this Unix millisecond timestamp."),
      dependencies: s.stringArray("Dependency task IDs used to filter tasks."),
      containers: s.stringArray("Worker, team, or organization container IDs used to filter tasks."),
    },
    {
      optional: [
        "to",
        "lastId",
        "state",
        "worker",
        "completeBeforeBefore",
        "completeAfterAfter",
        "dependencies",
        "containers",
      ],
    },
  ),
  outputSchema: s.object(
    "A page of Onfleet tasks.",
    {
      tasks: s.array("The tasks returned for this page.", rawTaskSchema),
      lastId: s.nonWhitespaceString("The cursor for the next page, when another page exists."),
    },
    { optional: ["lastId"] },
  ),
});

const getTaskAction = defineProviderAction(service, {
  name: "get_task",
  description: "Get one Onfleet task by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving an Onfleet task.", {
    taskId: taskIdSchema,
  }),
  outputSchema: rawTaskSchema,
});

const updateTaskAction = defineProviderAction(service, {
  name: "update_task",
  description: "Update supported fields on an Onfleet task.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating an Onfleet task.",
    {
      taskId: taskIdSchema,
      notes: s.string("Updated notes for the task.", { maxLength: 10_000 }),
      metadata: metadataSchema,
      customFields: customFieldsSchema,
      destination: s.nonWhitespaceString("The ID of the updated destination for the task."),
      container: s.looseObject("The organization, team, or worker container for the task."),
    },
    { optional: ["notes", "metadata", "customFields", "destination", "container"] },
  ),
  outputSchema: rawTaskSchema,
});

const cloneTaskAction = defineProviderAction(service, {
  name: "clone_task",
  description: "Clone an existing Onfleet task with optional metadata and field overrides.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for cloning an Onfleet task.",
    {
      taskId: taskIdSchema,
      options: s.object(
        "Options controlling which task data is copied and overridden.",
        {
          includeMetadata: s.boolean("Whether to copy metadata to the cloned task."),
          includeBarcodes: s.boolean("Whether to copy barcodes to the cloned task."),
          includeDependencies: s.boolean("Whether to copy dependencies to the cloned task."),
          overrides: s.object(
            "Values that replace fields copied from the source task.",
            {
              destination: destinationSchema,
              recipients: recipientsSchema,
              notes: s.string("Notes for the cloned task.", { maxLength: 10_000 }),
              pickupTask: s.boolean("Whether the cloned task is a pickup task."),
              serviceTime: s.number("The service time for the cloned task in minutes."),
              metadata: metadataSchema,
              completeAfter: s.integer("The earliest completion time for the cloned task in Unix milliseconds."),
              completeBefore: s.integer("The latest completion time for the cloned task in Unix milliseconds."),
            },
            {
              optional: [
                "destination",
                "recipients",
                "notes",
                "pickupTask",
                "serviceTime",
                "metadata",
                "completeAfter",
                "completeBefore",
              ],
            },
          ),
        },
        {
          optional: ["includeMetadata", "includeBarcodes", "includeDependencies", "overrides"],
        },
      ),
    },
    { optional: ["options"] },
  ),
  outputSchema: rawTaskSchema,
});

const completeTaskAction = defineProviderAction(service, {
  name: "complete_task",
  description: "Force complete an active Onfleet task as successful or failed.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for completing an Onfleet task.", {
    taskId: taskIdSchema,
    completionDetails: s.object(
      "The outcome recorded for the completed task.",
      {
        success: s.boolean("Whether the task completion was successful."),
        notes: s.string("Optional completion notes."),
      },
      { optional: ["notes"] },
    ),
  }),
  outputSchema: s.object("The completion result returned by Onfleet.", {
    success: s.boolean("Whether Onfleet accepted the task completion."),
  }),
});

const deleteTaskAction = defineProviderAction(service, {
  name: "delete_task",
  description: "Delete an unstarted Onfleet task.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting an Onfleet task.", {
    taskId: taskIdSchema,
  }),
  outputSchema: s.object("The deletion result returned by Onfleet.", {
    success: s.boolean("Whether Onfleet accepted the task deletion."),
  }),
});

export const onfleetActions: ActionDefinition[] = [
  createTaskAction,
  listTasksAction,
  getTaskAction,
  updateTaskAction,
  cloneTaskAction,
  completeTaskAction,
  deleteTaskAction,
];
