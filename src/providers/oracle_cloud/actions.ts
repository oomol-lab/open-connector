import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "oracle_cloud";

export const oracleInstanceActions: string[] = [
  "START",
  "STOP",
  "RESET",
  "SOFTSTOP",
  "SOFTRESET",
  "SENDDIAGNOSTICINTERRUPT",
  "DIAGNOSTICREBOOT",
  "REBOOTMIGRATE",
];
export const oracleInstanceAgentMaxWaitSeconds = 240;

const ocid = (description: string): JsonSchema => s.nonEmptyString(description);
const compartmentId = ocid("Compartment or tenancy OCID. Defaults to the connection's default compartment.");
const instanceId = ocid("Compute instance OCID.");
const page = s.nonEmptyString("Opaque OCI pagination token.");
const limit = s.integer("Maximum resources to return.", { minimum: 1, maximum: 1_000 });
const resource = s.looseObject("OCI resource. Additional official response fields are preserved.");
const requestMetadata = {
  opcRequestId: s.nullableString("Oracle request identifier."),
};
const listMetadata = {
  ...requestMetadata,
  nextPage: s.nullableString("Token for the next page, or null."),
};

/** Every call must name its optional properties; `s.object` treats an empty list as "all required". */
function input(description: string, properties: Record<string, JsonSchema>, optional: string[]): JsonSchema {
  return s.object(description, properties, { optional });
}

function entityOutput(name: string): JsonSchema {
  return s.requiredObject(`OCI ${name} response.`, { [name]: resource, ...requestMetadata });
}

function listOutput(name: string): JsonSchema {
  return s.requiredObject(`OCI ${name} list response.`, {
    [name]: s.array(`Returned ${name}.`, resource),
    ...listMetadata,
  });
}

function responseOutput(description: string): JsonSchema {
  return s.requiredObject(description, {
    status: s.integer("HTTP response status."),
    ...requestMetadata,
  });
}

const pagination = { limit, page };

export const oracleCloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_instances",
    description: "List OCI compute instances in a compartment.",
    inputSchema: input(
      "Instance filters.",
      {
        compartmentId,
        lifecycleState: s.stringEnum("Instance lifecycle state.", [
          "MOVING",
          "PROVISIONING",
          "RUNNING",
          "STARTING",
          "STOPPING",
          "STOPPED",
          "CREATING_IMAGE",
          "TERMINATING",
          "TERMINATED",
        ]),
        ...pagination,
      },
      ["compartmentId", "lifecycleState", "limit", "page"],
    ),
    outputSchema: listOutput("instances"),
    followUpActions: ["oracle_cloud.get_instance", "oracle_cloud.list_vnic_attachments"],
  }),
  defineProviderAction(service, {
    name: "get_instance",
    description: "Get a compute instance by OCID.",
    inputSchema: s.requiredObject("Instance lookup.", { instanceId }),
    outputSchema: entityOutput("instance"),
    followUpActions: ["oracle_cloud.instance_action", "oracle_cloud.list_vnic_attachments"],
  }),
  defineProviderAction(service, {
    name: "launch_instance",
    description: "Launch a compute instance from an image in a subnet.",
    inputSchema: input(
      "Instance launch details.",
      {
        compartmentId,
        displayName: s.nonEmptyString("Instance display name."),
        availabilityDomain: s.nonEmptyString("Availability domain name."),
        subnetId: ocid("Primary VNIC subnet OCID."),
        imageId: ocid("Boot image OCID."),
        shape: s.nonEmptyString("Compute shape name."),
        ocpus: s.positiveInteger("OCPU count for a flexible shape."),
        memoryInGBs: s.number("Memory in GB for a flexible shape.", { minimum: 1 }),
      },
      ["compartmentId", "shape", "ocpus", "memoryInGBs"],
    ),
    outputSchema: entityOutput("instance"),
    followUpActions: ["oracle_cloud.get_instance"],
  }),
  defineProviderAction(service, {
    name: "terminate_instance",
    description: "Permanently terminate a compute instance. This destructive operation cannot be undone.",
    inputSchema: s.requiredObject("Instance termination.", { instanceId }),
    outputSchema: responseOutput("Instance termination response."),
  }),
  defineProviderAction(service, {
    name: "update_instance",
    description: "Update flexible shape resources for an instance; OCI may restart the instance.",
    inputSchema: input(
      "Instance shape update.",
      {
        instanceId,
        ocpus: s.positiveInteger("New OCPU count."),
        memoryInGBs: s.number("New memory in GB.", { minimum: 1 }),
      },
      ["ocpus", "memoryInGBs"],
    ),
    outputSchema: entityOutput("instance"),
  }),
  defineProviderAction(service, {
    name: "list_images",
    description: "List compute images, optionally filtered by operating system.",
    inputSchema: input(
      "Image filters.",
      {
        compartmentId,
        operatingSystem: s.nonEmptyString("Operating system name."),
        ...pagination,
      },
      ["compartmentId", "operatingSystem", "limit", "page"],
    ),
    outputSchema: listOutput("images"),
    followUpActions: ["oracle_cloud.get_image", "oracle_cloud.launch_instance"],
  }),
  defineProviderAction(service, {
    name: "get_image",
    description: "Get a compute image by OCID.",
    inputSchema: s.requiredObject("Image lookup.", { imageId: ocid("Image OCID.") }),
    outputSchema: entityOutput("image"),
  }),
  defineProviderAction(service, {
    name: "instance_action",
    description: "Perform one of the instance actions exposed by Oracle's official Compute MCP server.",
    inputSchema: s.requiredObject("Instance action.", {
      instanceId,
      action: s.stringEnum("Action to perform.", oracleInstanceActions),
    }),
    outputSchema: entityOutput("instance"),
    followUpActions: ["oracle_cloud.get_instance"],
  }),
  defineProviderAction(service, {
    name: "list_vnic_attachments",
    description: "List VNIC attachments in a compartment, optionally for one instance.",
    inputSchema: input("VNIC attachment filters.", { compartmentId, instanceId, ...pagination }, [
      "compartmentId",
      "instanceId",
      "limit",
      "page",
    ]),
    outputSchema: listOutput("vnicAttachments"),
    followUpActions: ["oracle_cloud.get_vnic_attachment", "oracle_cloud.get_vnic"],
  }),
  defineProviderAction(service, {
    name: "get_vnic_attachment",
    description: "Get a VNIC attachment by OCID.",
    inputSchema: s.requiredObject("VNIC attachment lookup.", {
      vnicAttachmentId: ocid("VNIC attachment OCID."),
    }),
    outputSchema: entityOutput("vnicAttachment"),
  }),

  defineProviderAction(service, {
    name: "list_vcns",
    description: "List virtual cloud networks in a compartment.",
    inputSchema: input("VCN filters.", { compartmentId, ...pagination }, ["compartmentId", "limit", "page"]),
    outputSchema: listOutput("vcns"),
    followUpActions: ["oracle_cloud.get_vcn", "oracle_cloud.list_subnets"],
  }),
  defineProviderAction(service, {
    name: "get_vcn",
    description: "Get a virtual cloud network by OCID.",
    inputSchema: s.requiredObject("VCN lookup.", { vcnId: ocid("VCN OCID.") }),
    outputSchema: entityOutput("vcn"),
  }),
  defineProviderAction(service, {
    name: "delete_vcn",
    description: "Permanently delete an empty VCN. This is destructive.",
    inputSchema: s.requiredObject("VCN deletion.", { vcnId: ocid("VCN OCID.") }),
    outputSchema: responseOutput("VCN deletion response."),
  }),
  defineProviderAction(service, {
    name: "create_vcn",
    description: "Create a virtual cloud network.",
    inputSchema: input(
      "VCN creation.",
      {
        compartmentId,
        cidrBlock: s.nonEmptyString("IPv4 CIDR block."),
        displayName: s.nonEmptyString("VCN display name."),
      },
      ["compartmentId"],
    ),
    outputSchema: entityOutput("vcn"),
  }),
  defineProviderAction(service, {
    name: "list_subnets",
    description: "List subnets in a compartment, optionally filtered by VCN.",
    inputSchema: input("Subnet filters.", { compartmentId, vcnId: ocid("VCN OCID."), ...pagination }, [
      "compartmentId",
      "vcnId",
      "limit",
      "page",
    ]),
    outputSchema: listOutput("subnets"),
  }),
  defineProviderAction(service, {
    name: "get_subnet",
    description: "Get a subnet by OCID.",
    inputSchema: s.requiredObject("Subnet lookup.", { subnetId: ocid("Subnet OCID.") }),
    outputSchema: entityOutput("subnet"),
  }),
  defineProviderAction(service, {
    name: "create_subnet",
    description: "Create a subnet in a VCN.",
    inputSchema: input(
      "Subnet creation.",
      {
        vcnId: ocid("VCN OCID."),
        compartmentId,
        cidrBlock: s.nonEmptyString("Subnet IPv4 CIDR block."),
        displayName: s.nonEmptyString("Subnet display name."),
      },
      ["compartmentId"],
    ),
    outputSchema: entityOutput("subnet"),
  }),
  defineProviderAction(service, {
    name: "list_security_lists",
    description: "List security lists in a compartment, optionally filtered by VCN.",
    inputSchema: input("Security list filters.", { compartmentId, vcnId: ocid("VCN OCID."), ...pagination }, [
      "compartmentId",
      "vcnId",
      "limit",
      "page",
    ]),
    outputSchema: listOutput("securityLists"),
  }),
  defineProviderAction(service, {
    name: "get_security_list",
    description: "Get a security list by OCID.",
    inputSchema: s.requiredObject("Security list lookup.", {
      securityListId: ocid("Security list OCID."),
    }),
    outputSchema: entityOutput("securityList"),
  }),
  defineProviderAction(service, {
    name: "list_network_security_groups",
    description: "List network security groups, optionally filtered by VCN or VLAN.",
    inputSchema: input(
      "Network security group filters.",
      {
        compartmentId,
        vcnId: ocid("VCN OCID."),
        vlanId: ocid("VLAN OCID."),
        ...pagination,
      },
      ["compartmentId", "vcnId", "vlanId", "limit", "page"],
    ),
    outputSchema: listOutput("networkSecurityGroups"),
  }),
  defineProviderAction(service, {
    name: "get_network_security_group",
    description: "Get a network security group by OCID.",
    inputSchema: s.requiredObject("Network security group lookup.", {
      networkSecurityGroupId: ocid("Network security group OCID."),
    }),
    outputSchema: entityOutput("networkSecurityGroup"),
  }),
  defineProviderAction(service, {
    name: "get_vnic",
    description: "Get a VNIC and its assigned IP addresses by OCID.",
    inputSchema: s.requiredObject("VNIC lookup.", { vnicId: ocid("VNIC OCID.") }),
    outputSchema: entityOutput("vnic"),
  }),

  defineProviderAction(service, {
    name: "list_alarms",
    description: "List Monitoring alarms in a compartment.",
    inputSchema: input("Alarm filters.", { compartmentId, ...pagination }, ["compartmentId", "limit", "page"]),
    outputSchema: listOutput("alarms"),
  }),
  defineProviderAction(service, {
    name: "list_metric_definitions",
    description: "List available OCI Monitoring metric definitions.",
    inputSchema: input(
      "Metric definition filters.",
      {
        compartmentId,
        groupBy: s.array("Fields to group by.", s.stringEnum(["namespace", "name", "resourceGroup"])),
        metricName: s.nonEmptyString("Metric name."),
        namespace: s.nonEmptyString("Metric namespace."),
        resourceGroup: s.nonEmptyString("Metric resource group."),
        compartmentIdInSubtree: s.boolean("Search subcompartments."),
        ...pagination,
      },
      [
        "compartmentId",
        "groupBy",
        "metricName",
        "namespace",
        "resourceGroup",
        "compartmentIdInSubtree",
        "limit",
        "page",
      ],
    ),
    outputSchema: listOutput("metrics"),
  }),
  defineProviderAction(service, {
    name: "get_metrics_data",
    description: "Retrieve aggregated OCI Monitoring metric data using an MQL expression.",
    inputSchema: input(
      "Metric query.",
      {
        compartmentId,
        query: s.nonEmptyString("Monitoring Query Language expression."),
        namespace: s.nonEmptyString("Metric namespace."),
        startTime: s.dateTime("Inclusive RFC3339 start time; defaults to three hours ago."),
        endTime: s.dateTime("Exclusive RFC3339 end time; defaults to now."),
        resourceGroup: s.nonEmptyString("Metric resource group."),
        resolution: s.nonEmptyString("Aggregation resolution, such as 1m or 1h."),
        compartmentIdInSubtree: s.boolean("Search subcompartments."),
      },
      ["compartmentId", "startTime", "endTime", "resourceGroup", "resolution", "compartmentIdInSubtree"],
    ),
    outputSchema: listOutput("metricData"),
  }),

  defineProviderAction(service, {
    name: "list_compartments",
    description: "List child compartments, optionally traversing the tenancy subtree.",
    inputSchema: input(
      "Compartment filters.",
      {
        compartmentId,
        compartmentIdInSubtree: s.boolean("Traverse the entire tenancy subtree."),
        accessLevel: s.stringEnum("Permission filtering mode.", ["ANY", "ACCESSIBLE"]),
        includeRoot: s.boolean({
          description:
            "Include the tenancy root compartment on the first page. Applies only when listing the tenancy itself.",
          default: true,
        }),
        ...pagination,
      },
      ["compartmentId", "compartmentIdInSubtree", "accessLevel", "includeRoot", "limit", "page"],
    ),
    outputSchema: listOutput("compartments"),
  }),
  defineProviderAction(service, {
    name: "get_tenancy",
    description: "Get a tenancy by OCID.",
    inputSchema: s.requiredObject("Tenancy lookup.", { tenancyId: ocid("Tenancy OCID.") }),
    outputSchema: entityOutput("tenancy"),
  }),
  defineProviderAction(service, {
    name: "list_availability_domains",
    description: "List availability domains accessible from a compartment or tenancy.",
    inputSchema: input("Availability domain lookup.", { compartmentId }, ["compartmentId"]),
    outputSchema: listOutput("availabilityDomains"),
  }),
  defineProviderAction(service, {
    name: "get_current_tenancy",
    description: "Get the tenancy configured on this connection.",
    inputSchema: s.object("No input.", {}),
    outputSchema: entityOutput("tenancy"),
  }),
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the IAM user configured on this connection.",
    inputSchema: s.object("No input.", {}),
    outputSchema: entityOutput("user"),
  }),
  defineProviderAction(service, {
    name: "get_compartment_by_name",
    description: "Find a direct child compartment by exact name.",
    inputSchema: s.requiredObject("Compartment name lookup.", {
      name: s.nonEmptyString("Exact compartment name."),
      parentCompartmentId: compartmentId,
    }),
    outputSchema: s.requiredObject("Compartment lookup response.", {
      compartment: s.nullable(resource),
      ...requestMetadata,
    }),
  }),
  defineProviderAction(service, {
    name: "list_subscribed_regions",
    description: "List regions to which a tenancy is subscribed.",
    inputSchema: input("Region subscription lookup.", { tenancyId: ocid("Tenancy OCID.") }, ["tenancyId"]),
    outputSchema: listOutput("regions"),
  }),

  defineProviderAction(service, {
    name: "run_instance_agent_command",
    description:
      "Run a shell or batch script through Oracle Cloud Agent. The script executes on the target host with the agent service account's privileges.",
    inputSchema: input(
      "Agent command.",
      {
        compartmentId,
        instanceId,
        displayName: s.nonEmptyString("Command display name."),
        script: s.nonEmptyString("Plain-text script to execute."),
        executionTimeoutInSeconds: s.positiveInteger(
          "On-host command timeout in seconds. OpenConnector waits at most four minutes for completion.",
          { maximum: oracleInstanceAgentMaxWaitSeconds },
        ),
      },
      ["compartmentId", "executionTimeoutInSeconds"],
    ),
    outputSchema: entityOutput("commandExecution"),
    followUpActions: ["oracle_cloud.list_instance_agent_command_executions"],
  }),
  defineProviderAction(service, {
    name: "list_instance_agent_command_executions",
    description: "List Oracle Cloud Agent command executions for a compute instance.",
    inputSchema: input("Agent command execution filters.", { compartmentId, instanceId, ...pagination }, [
      "compartmentId",
      "limit",
      "page",
    ]),
    outputSchema: listOutput("commandExecutions"),
  }),
];
