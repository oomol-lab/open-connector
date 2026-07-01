import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aliyun_sts";

const roleArnSchema = s.string(
  "The Alibaba Cloud RAM role ARN to assume. Required when the connection has no saved Role ARN; otherwise the saved Role ARN is used when this field is omitted.",
  { minLength: 1 },
);
const durationSecondsSchema = s.integer(
  "The temporary credential duration in seconds. Alibaba Cloud STS accepts 900 to 43200, limited by the RAM role maximum session duration.",
  { minimum: 900, maximum: 43200 },
);

const stsCredentialOutputSchema = s.object(
  "The normalized Alibaba Cloud STS temporary credential returned by the connector.",
  {
    accessKeyId: s.string("The temporary AccessKey ID."),
    accessKeySecret: s.string("The temporary AccessKey secret."),
    securityToken: s.string("The STS security token used with the temporary AccessKey pair."),
    expiration: s.string("The ISO timestamp when the temporary credential expires."),
    requestId: s.nullable(s.string("The Alibaba Cloud STS request ID.")),
    assumedRoleUser: s.nullable(
      s.object("The assumed role user identity returned by Alibaba Cloud STS.", {
        arn: s.nullable(s.string("The assumed role user ARN.")),
        assumedRoleId: s.nullable(s.string("The assumed role user ID.")),
      }),
    ),
  },
);

export const aliyunStsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "assume_role",
    description:
      "Use a connected Alibaba Cloud RAM AccessKey pair to call STS AssumeRole and return temporary credentials.",
    inputSchema: s.object(
      "Input parameters for assuming an Alibaba Cloud RAM role with saved RAM AK/SK credentials.",
      {
        roleArn: roleArnSchema,
        roleSessionName: s.string("The STS role session name.", { minLength: 1 }),
        durationSeconds: durationSecondsSchema,
        policy: s.string("An optional inline session policy JSON string used only to narrow the temporary credential permissions.", {
          minLength: 1,
        }),
      },
      { optional: ["roleArn", "roleSessionName", "durationSeconds", "policy"] },
    ),
    outputSchema: stsCredentialOutputSchema,
  }),
];

export type AliyunStsActionName = (typeof aliyunStsActions)[number]["name"];
