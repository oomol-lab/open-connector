import type { ProviderDefinition } from "../../core/types.ts";

import { awsActions } from "./actions.ts";

const service = "aws_s3";

export const provider: ProviderDefinition = {
  service,
  displayName: "AWS S3",
  categories: ["Storage", "Developer Tools"],
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
            "AWS access key ID. Create or manage IAM user access keys here: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
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
          key: "region",
          label: "Region",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "us-east-1",
          description:
            "The default AWS region used for validation and S3 action execution. See the official S3 endpoints and region list: https://docs.aws.amazon.com/general/latest/gr/s3.html",
        },
        {
          key: "bucket",
          label: "Default Bucket",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "my-bucket",
          description:
            "Optional default bucket reused by object-level actions. Use a bucket from your own S3 resources as documented here: https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html",
        },
        {
          key: "sessionToken",
          label: "Session Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Optional STS session token",
          description:
            "Optional STS session token from the same temporary AWS credential set when you use STS or AssumeRole credentials.",
        },
      ],
    },
  ],
  homepageUrl: "https://aws.amazon.com/s3/",
  actions: awsActions,
};
