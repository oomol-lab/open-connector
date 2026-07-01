import type { ProviderDefinition } from "../../core/types.ts";

import { aliyunStsActions } from "./actions.ts";

const service = "aliyun_sts";

export const provider: ProviderDefinition = {
  service,
  displayName: "Alibaba Cloud STS",
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
          placeholder: "LTAI...",
          description:
            "Alibaba Cloud RAM AccessKey ID used as the source credential for STS AssumeRole. Create or manage RAM AccessKey pairs here: https://www.alibabacloud.com/help/en/ram/user-guide/create-an-accesskey-pair",
        },
        {
          key: "accessKeySecret",
          label: "Access Key Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Your AccessKey secret",
          description:
            "Alibaba Cloud RAM AccessKey secret from the same AccessKey pair. Alibaba Cloud only shows it when the key pair is created: https://www.alibabacloud.com/help/en/ram/user-guide/create-an-accesskey-pair",
        },
        {
          key: "defaultRoleArn",
          label: "Default Role ARN",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "acs:ram::1234567890123456:role/demo",
          description:
            "Optional default RAM role ARN used by assume_role when the action input omits roleArn. If this is left blank, each assume_role action call must provide roleArn. Create or view RAM roles in the RAM console: https://ram.console.aliyun.com/roles",
        },
      ],
    },
  ],
  homepageUrl: "https://www.alibabacloud.com/product/ram",
  actions: aliyunStsActions,
};
