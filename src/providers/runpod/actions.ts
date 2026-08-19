import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "runpod";
const podIdField = s.nonEmptyString("The Runpod Pod ID.");
const includeFields = {
  includeMachine: s.boolean("Whether to include machine details for each returned Pod."),
  includeNetworkVolume: s.boolean("Whether to include attached network volume details for each returned Pod."),
  includeSavingsPlans: s.boolean("Whether to include savings plan details applied to each returned Pod."),
  includeTemplate: s.boolean("Whether to include template details for each returned Pod."),
  includeWorkers: s.boolean("Whether to include Pods that are serving as Serverless workers."),
};
const stringArrayFilter = (description: string, itemDescription: string) =>
  s.stringArray(description, { minItems: 1, itemDescription });
const podSchema = s.looseRequiredObject(
  "A Runpod Pod payload.",
  {
    id: s.nonEmptyString("The Runpod Pod ID."),
    name: s.string("The Pod name."),
    desiredStatus: s.string("The desired Pod status such as RUNNING, EXITED, or TERMINATED."),
    image: s.string("The image tag used by the Pod."),
    machineId: s.string("The backing machine ID."),
    endpointId: s.string("The attached Serverless endpoint ID when present."),
    templateId: s.string("The template ID used to create the Pod."),
    publicIp: s.string("The Pod public IPv4 address when available."),
    costPerHr: s.number("The Pod hourly cost before savings plans."),
    adjustedCostPerHr: s.number("The Pod hourly cost after active savings plans are applied."),
    interruptible: s.boolean("Whether the Pod is interruptible rather than reserved."),
    locked: s.boolean("Whether the Pod is locked against stop or reset."),
    lastStartedAt: s.string("The UTC timestamp when the Pod was last started."),
    lastStatusChange: s.string("The last Pod lifecycle status message."),
    cpuFlavorId: s.string("The Runpod CPU flavor ID for CPU Pods."),
    vcpuCount: s.number("The number of vCPUs assigned to the Pod."),
    memoryInGb: s.number("The amount of memory assigned to the Pod in GB."),
    containerDiskInGb: s.integer("The container disk size assigned to the Pod in GB."),
    volumeInGb: s.integer("The Pod volume size assigned in GB."),
    volumeMountPath: s.string("The filesystem mount path for the Pod or attached network volume."),
    ports: s.stringArray("The exposed Pod ports."),
    portMappings: s.record("A map from internal Pod ports to public ports.", s.integer("A public port.")),
    env: s.record("The environment variables configured on the Pod.", s.string("An environment variable value.")),
    gpu: s.looseObject("The GPU summary for the Pod when present."),
    machine: s.looseObject("Machine details for the Pod when included."),
    networkVolume: s.looseObject("The attached network volume when includeNetworkVolume is enabled."),
    savingsPlans: s.array("Savings plans applied to the Pod when includeSavingsPlans is enabled.", s.looseObject()),
  },
  {
    optional: [
      "name",
      "desiredStatus",
      "image",
      "machineId",
      "endpointId",
      "templateId",
      "publicIp",
      "costPerHr",
      "adjustedCostPerHr",
      "interruptible",
      "locked",
      "lastStartedAt",
      "lastStatusChange",
      "cpuFlavorId",
      "vcpuCount",
      "memoryInGb",
      "containerDiskInGb",
      "volumeInGb",
      "volumeMountPath",
      "ports",
      "portMappings",
      "env",
      "gpu",
      "machine",
      "networkVolume",
      "savingsPlans",
    ],
  },
);
const podDetailInputSchema = s.object(
  "The input payload for fetching one Runpod Pod.",
  {
    podId: podIdField,
    ...includeFields,
  },
  { optional: Object.keys(includeFields) },
);
const lifecycleInputSchema = s.object("The input payload for a Runpod Pod lifecycle request.", {
  podId: podIdField,
});
const lifecycleResultSchema = (action: string, description: string) =>
  s.object(`The response returned after requesting to ${action} a Runpod Pod.`, {
    podId: s.nonEmptyString("The Pod ID targeted by the lifecycle request."),
    action: s.literal(action, { description }),
    success: s.boolean("Whether the lifecycle request completed successfully."),
  });

export const runpodActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_pods",
    description: "List Runpod Pods with optional official filter parameters.",
    inputSchema: s.object(
      "The input payload for listing Runpod Pods.",
      {
        computeType: s.stringEnum("Filter to GPU Pods or CPU Pods only.", ["GPU", "CPU"]),
        cpuFlavorId: stringArrayFilter(
          "Filter to CPU Pods with any of the provided Runpod CPU flavor IDs.",
          "One Runpod CPU flavor ID such as cpu3c.",
        ),
        dataCenterId: stringArrayFilter(
          "Filter to Pods located in any of the provided Runpod data centers.",
          "One Runpod data center ID such as EU-RO-1.",
        ),
        desiredStatus: s.stringEnum("Filter to Pods in the provided desired status.", [
          "RUNNING",
          "EXITED",
          "TERMINATED",
        ]),
        endpointId: s.nonEmptyString("Filter to Pods attached to the provided Runpod Serverless endpoint."),
        gpuTypeId: stringArrayFilter(
          "Filter to GPU Pods with any of the provided Runpod GPU type IDs.",
          "One Runpod GPU type ID such as NVIDIA RTX A5000.",
        ),
        id: s.nonEmptyString("Filter to a specific Pod by ID."),
        imageName: s.nonEmptyString("Filter to Pods created from the provided image name."),
        ...includeFields,
        name: s.nonEmptyString("Filter to Pods with the provided name."),
        networkVolumeId: s.nonEmptyString("Filter to Pods with the provided attached network volume ID."),
        templateId: s.nonEmptyString("Filter to Pods created from the provided template ID."),
      },
      {
        optional: [
          "computeType",
          "cpuFlavorId",
          "dataCenterId",
          "desiredStatus",
          "endpointId",
          "gpuTypeId",
          "id",
          "imageName",
          ...Object.keys(includeFields),
          "name",
          "networkVolumeId",
          "templateId",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Runpod Pods.", {
      pods: s.array("The Pods returned by Runpod.", podSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_pod",
    description: "Get one Runpod Pod by ID.",
    inputSchema: podDetailInputSchema,
    outputSchema: s.object("The response returned when fetching one Runpod Pod.", { pod: podSchema }),
  }),
  defineProviderAction(service, {
    name: "start_pod",
    description: "Start or resume a Runpod Pod.",
    inputSchema: lifecycleInputSchema,
    outputSchema: lifecycleResultSchema("start", "The lifecycle operation that was requested."),
  }),
  defineProviderAction(service, {
    name: "stop_pod",
    description: "Stop a Runpod Pod.",
    inputSchema: lifecycleInputSchema,
    outputSchema: lifecycleResultSchema("stop", "The lifecycle operation that was requested."),
  }),
  defineProviderAction(service, {
    name: "restart_pod",
    description: "Restart a Runpod Pod.",
    inputSchema: lifecycleInputSchema,
    outputSchema: lifecycleResultSchema("restart", "The lifecycle operation that was requested."),
  }),
  defineProviderAction(service, {
    name: "reset_pod",
    description: "Reset a Runpod Pod.",
    inputSchema: lifecycleInputSchema,
    outputSchema: lifecycleResultSchema("reset", "The lifecycle operation that was requested."),
  }),
  defineProviderAction(service, {
    name: "delete_pod",
    description: "Delete a Runpod Pod.",
    inputSchema: lifecycleInputSchema,
    outputSchema: lifecycleResultSchema("delete", "The lifecycle operation that was requested."),
  }),
];
