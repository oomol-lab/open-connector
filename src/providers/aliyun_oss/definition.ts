import type { ProviderDefinition } from "../../core/types.ts";

import { aliyunOssActions } from "./actions.ts";

const service = "aliyun_oss";

export const provider: ProviderDefinition = {
  service,
  displayName: "Alibaba Cloud OSS",
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
          placeholder: "LTAI...",
          description:
            "Alibaba Cloud AccessKey ID. Create or manage an AccessKey pair in RAM: https://www.alibabacloud.com/help/en/ram/user-guide/create-an-accesskey-pair",
        },
        {
          key: "accessKeySecret",
          label: "Access Key Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Your AccessKey secret",
          description:
            "Alibaba Cloud AccessKey secret from the same RAM AccessKey pair. Alibaba Cloud shows it only when you create the key pair: https://www.alibabacloud.com/help/en/ram/user-guide/create-an-accesskey-pair",
        },
        {
          key: "endpoint",
          label: "OSS Endpoint",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "oss-cn-hangzhou.aliyuncs.com",
          description:
            "The default OSS endpoint used for validation and action execution. Find the endpoint for your region here: https://www.alibabacloud.com/help/en/oss/user-guide/regions-and-endpoints",
        },
        {
          key: "bucket",
          label: "Default Bucket",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "my-bucket",
          description:
            "Optional default bucket reused by object-level actions. Use a bucket from your own OSS resources in the OSS console: https://oss.console.aliyun.com/overview",
        },
        {
          key: "securityToken",
          label: "Security Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Optional STS token",
          description:
            "Optional STS security token when using temporary AK/SK credentials from your own Alibaba Cloud STS flow.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.alibabacloud.com",
  actions: aliyunOssActions,
};
