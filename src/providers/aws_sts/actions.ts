import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aws_sts";

const roleArnSchema = s.nonEmptyString(
  "The AWS IAM role ARN to assume. Required when the connection has no saved Role ARN; otherwise the saved Role ARN is used when this field is omitted.",
);
const roleSessionNameSchema = s.string("The AWS STS role session name.", { minLength: 2 });
const durationSecondsSchema = s.integer(
  "The temporary credential duration in seconds. AWS STS accepts 900 to 43200, limited by the role maximum session duration.",
  { minimum: 900, maximum: 43200 },
);
const policyArnsSchema = s.array(
  "Optional managed policy ARNs used only to narrow the temporary credential permissions.",
  s.object("A managed policy reference for the AssumeRole request.", {
    arn: s.nonEmptyString("The ARN of the managed session policy."),
  }),
  { minItems: 1, maxItems: 10 },
);
const tagSchema = s.object("A session tag to pass to AWS STS AssumeRole.", {
  key: s.nonEmptyString("The session tag key."),
  value: s.string("The session tag value."),
});

const stsCredentialOutputSchema = s.object("The normalized AWS STS temporary credential returned by the connector.", {
  accessKeyId: s.string("The temporary AWS access key ID."),
  secretAccessKey: s.string("The temporary AWS secret access key."),
  sessionToken: s.string("The AWS STS session token used with the temporary access key pair."),
  expiration: s.string("The ISO timestamp when the temporary credential expires."),
  requestId: s.nullable(s.string("The AWS STS request ID.")),
  assumedRoleUser: s.nullable(
    s.object("The assumed role user identity returned by AWS STS.", {
      arn: s.nullable(s.string("The assumed role user ARN.")),
      assumedRoleId: s.nullable(s.string("The assumed role user ID.")),
    }),
  ),
  packedPolicySize: s.nullable(
    s.integer("The percentage of the packed policy and tag size quota used by the request."),
  ),
  sourceIdentity: s.nullable(s.string("The source identity associated with the role session.")),
});

export const awsStsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "assume_role",
    description: "Use a connected AWS access key pair to call STS AssumeRole and return temporary credentials.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for assuming an AWS IAM role with saved AWS access key credentials.",
      {
        roleArn: roleArnSchema,
        roleSessionName: roleSessionNameSchema,
        durationSeconds: durationSecondsSchema,
        policy: s.nonEmptyString(
          "An optional inline session policy JSON string used only to narrow the temporary credential permissions.",
        ),
        policyArns: policyArnsSchema,
        externalId: s.nonEmptyString("The external ID to pass when the target role requires one."),
        serialNumber: s.nonEmptyString("The MFA device serial number or ARN."),
        tokenCode: s.nonEmptyString("The time-based MFA token code."),
        sourceIdentity: s.nonEmptyString("The source identity to attach to the role session."),
        tags: s.array("Session tags to pass to the assumed role session.", tagSchema, { minItems: 1, maxItems: 50 }),
        transitiveTagKeys: s.array(
          "Session tag keys that AWS should mark as transitive for role chaining.",
          s.nonEmptyString("A transitive session tag key."),
          { minItems: 1, maxItems: 50 },
        ),
      },
      {
        optional: [
          "roleArn",
          "roleSessionName",
          "durationSeconds",
          "policy",
          "policyArns",
          "externalId",
          "serialNumber",
          "tokenCode",
          "sourceIdentity",
          "tags",
          "transitiveTagKeys",
        ],
      },
    ),
    outputSchema: stsCredentialOutputSchema,
  }),
];

export type AwsStsActionName = (typeof awsStsActions)[number]["name"];
