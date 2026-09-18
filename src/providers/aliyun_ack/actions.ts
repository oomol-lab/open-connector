import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aliyun_ack";

export const aliyunAckActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_temporary_kubeconfig",
    operationType: "read",
    description:
      "Generate a short-lived kubeconfig for an Alibaba Cloud Container Service for Kubernetes (ACK) cluster.",
    providerPermissions: ["cs:DescribeClusterUserKubeconfig"],
    inputSchema: s.object(
      "Input parameters for generating a temporary ACK cluster kubeconfig.",
      {
        clusterId: s.nonEmptyString("The ACK cluster ID.", {}),
        regionId: s.nonEmptyString("The Alibaba Cloud region ID that contains the cluster, for example cn-hangzhou.", {
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        }),
        temporaryDurationMinutes: s.integer(
          "The temporary kubeconfig validity period in minutes, from 15 minutes to 3 days.",
          { minimum: 15, maximum: 4320 },
        ),
        privateIpAddress: s.boolean({
          description:
            "Whether the kubeconfig should use the cluster's internal API server endpoint. Defaults to false for the public endpoint.",
          default: false,
        }),
      },
      { optional: ["privateIpAddress"] },
    ),
    outputSchema: s.requiredObject("The generated temporary ACK kubeconfig and its expiration time.", {
      config: s.nonEmptyString("The kubeconfig YAML containing credentials for the connected Alibaba Cloud identity."),
      expiration: s.dateTime("The RFC3339 UTC timestamp when the kubeconfig expires."),
    }),
  }),
];
