import type { ProviderDefinition } from "../../core/types.ts";

import { awsStsActions } from "./actions.ts";

const service = "aws_sts";

export const provider: ProviderDefinition = {
  service,
  displayName: "AWS STS",
  categories: ["Security", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "accessKeyId",
          label: "Access Key ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "AKIA...",
          description:
            "AWS access key ID used as the source credential for STS AssumeRole. Create or manage access keys with the official IAM guide: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
        },
        {
          key: "secretAccessKey",
          label: "Secret Access Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Your AWS secret access key",
          description:
            "AWS secret access key from the same access key pair. AWS shows it only when you create the access key: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
        },
        {
          key: "sessionToken",
          label: "Session Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Optional source STS session token",
          description:
            "Optional AWS STS session token from the same temporary source credential set when the source access key is already temporary.",
        },
        {
          key: "defaultRoleArn",
          label: "Default Role ARN",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "arn:aws:iam::123456789012:role/demo",
          description:
            "Optional default IAM role ARN used by assume_role when the action input omits roleArn. If this is left blank, each assume_role action call must provide roleArn.",
        },
      ],
    },
  ],
  homepageUrl: "https://aws.amazon.com/iam/",
  actions: awsStsActions,
};
