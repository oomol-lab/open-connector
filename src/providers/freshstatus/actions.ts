import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "freshstatus";

const idSchema = s.positiveInteger("Freshstatus object identifier.");
const serviceDisplayOptionsSchema: JsonSchema = {
  ...s.object(
    "Freshstatus service display options.",
    {
      serviceStartDate: s.date("Service history start date in YYYY-MM-DD format."),
      uptimeHistoryEnabled: s.stringEnum("Whether uptime history is enabled, encoded as required by Freshstatus.", [
        "true",
        "false",
      ]),
    },
    { optional: ["serviceStartDate", "uptimeHistoryEnabled"] },
  ),
  minProperties: 1,
};
const groupDisplayOptionsSchema: JsonSchema = {
  ...s.object(
    "Freshstatus service group display options.",
    {
      expandOnLoad: s.stringEnum("Whether the group is expanded on page load, encoded as required by Freshstatus.", [
        "true",
        "false",
      ]),
      uptimeHistoryEnabled: s.stringEnum("Whether uptime history is enabled, encoded as required by Freshstatus.", [
        "true",
        "false",
      ]),
    },
    { optional: ["expandOnLoad", "uptimeHistoryEnabled"] },
  ),
  minProperties: 1,
};

const serviceSchema = s.unknownObject("A service object returned by Freshstatus.");
const groupSchema = s.unknownObject("A service group object returned by Freshstatus.");
const paginationFields = {
  count: s.integer("Total number of matching Freshstatus objects."),
  next: s.nullableString("URL of the next page when another page exists."),
  previous: s.nullableString("URL of the previous page when one exists."),
};

export const freshstatusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_services",
    description: "List the services configured on a Freshstatus status page.",
    inputSchema: s.object("Input for listing Freshstatus services.", {}),
    outputSchema: s.object("Paginated Freshstatus service list.", {
      ...paginationFields,
      services: s.array("Services returned by Freshstatus.", serviceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_service",
    description: "Get one Freshstatus service by identifier.",
    inputSchema: s.object("Input for reading a Freshstatus service.", { serviceId: idSchema }),
    outputSchema: s.object("Freshstatus service response.", { service: serviceSchema }),
  }),
  defineProviderAction(service, {
    name: "create_service",
    description: "Create a service on a Freshstatus status page.",
    inputSchema: s.object(
      "Input for creating a Freshstatus service.",
      {
        name: s.nonEmptyString("Service name."),
        description: s.string("Service description."),
        order: s.integer("Display order of the service."),
        groupId: s.positiveInteger("Parent service group identifier."),
        displayOptions: serviceDisplayOptionsSchema,
      },
      { optional: ["description", "groupId", "displayOptions"] },
    ),
    outputSchema: s.object("Created Freshstatus service response.", { service: serviceSchema }),
  }),
  defineProviderAction(service, {
    name: "update_service",
    description: "Update a Freshstatus service.",
    inputSchema: s.requireAnyProperty(
      s.object(
        "Input for updating a Freshstatus service.",
        {
          serviceId: idSchema,
          name: s.nonEmptyString("Replacement service name."),
          description: s.string("Replacement service description."),
          order: s.integer("Replacement display order."),
          groupId: s.nullable(s.positiveInteger("Replacement parent group identifier.")),
          displayOptions: serviceDisplayOptionsSchema,
        },
        { optional: ["name", "description", "order", "groupId", "displayOptions"] },
      ),
      ["name", "description", "order", "groupId", "displayOptions"],
    ),
    outputSchema: s.object("Updated Freshstatus service response.", { service: serviceSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_service",
    description: "Delete a Freshstatus service.",
    inputSchema: s.object("Input for deleting a Freshstatus service.", { serviceId: idSchema }),
    outputSchema: s.object("Freshstatus service deletion acknowledgement.", {
      deleted: s.boolean("Whether the service was deleted."),
      serviceId: idSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List service groups configured on a Freshstatus status page.",
    inputSchema: s.object("Input for listing Freshstatus service groups.", {}),
    outputSchema: s.object("Paginated Freshstatus service group list.", {
      ...paginationFields,
      groups: s.array("Service groups returned by Freshstatus.", groupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Freshstatus service group by identifier.",
    inputSchema: s.object("Input for reading a Freshstatus service group.", { groupId: idSchema }),
    outputSchema: s.object("Freshstatus service group response.", { group: groupSchema }),
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create a service group on a Freshstatus status page.",
    inputSchema: s.object(
      "Input for creating a Freshstatus service group.",
      {
        name: s.nonEmptyString("Service group name."),
        description: s.string("Service group description."),
        order: s.integer("Display order of the service group."),
        parentId: s.nullable(s.positiveInteger("Parent service group identifier.")),
        displayOptions: groupDisplayOptionsSchema,
      },
      { optional: ["description", "order", "parentId", "displayOptions"] },
    ),
    outputSchema: s.object("Created Freshstatus service group response.", { group: groupSchema }),
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Update a Freshstatus service group.",
    inputSchema: s.requireAnyProperty(
      s.object(
        "Input for updating a Freshstatus service group.",
        {
          groupId: idSchema,
          name: s.nonEmptyString("Replacement service group name."),
          description: s.string("Replacement service group description."),
          order: s.integer("Replacement display order."),
          parentId: s.nullable(s.positiveInteger("Replacement parent group identifier.")),
          displayOptions: groupDisplayOptionsSchema,
        },
        { optional: ["name", "description", "order", "parentId", "displayOptions"] },
      ),
      ["name", "description", "order", "parentId", "displayOptions"],
    ),
    outputSchema: s.object("Updated Freshstatus service group response.", { group: groupSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Delete a Freshstatus service group.",
    inputSchema: s.object("Input for deleting a Freshstatus service group.", { groupId: idSchema }),
    outputSchema: s.object("Freshstatus service group deletion acknowledgement.", {
      deleted: s.boolean("Whether the service group was deleted."),
      groupId: idSchema,
    }),
  }),
];
