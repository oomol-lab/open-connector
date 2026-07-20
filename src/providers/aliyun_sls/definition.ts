import type { ProviderDefinition } from "../../core/types.ts";

import { aliyunSlsActions } from "./actions.ts";

const service = "aliyun_sls";

export const provider: ProviderDefinition = {
  service,
  displayName: "Alibaba Cloud SLS",
  description:
    "Discover Alibaba Cloud Simple Log Service Projects and Logstores, query logs and histograms, and aggregate Project discovery across selected regions.",
  categories: ["Data", "Developer Tools"],
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
            "The Alibaba Cloud RAM AccessKey ID used to call Simple Log Service. Use a RAM identity with only the required SLS permissions.",
        },
        {
          key: "accessKeySecret",
          label: "Access Key Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Your AccessKey secret",
          description: "The AccessKey secret from the same Alibaba Cloud RAM AccessKey pair.",
        },
        {
          key: "endpoint",
          label: "Default Regional Endpoint",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "cn-hangzhou.log.aliyuncs.com",
          description:
            "The default regional Simple Log Service endpoint used by actions that omit endpoint, for example cn-hangzhou.log.aliyuncs.com.",
        },
        {
          key: "securityToken",
          label: "Security Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Optional STS token",
          description: "An optional Alibaba Cloud STS security token used with temporary AccessKey credentials.",
        },
        {
          key: "resourceScope",
          label: "Resource Scope",
          inputType: "json",
          required: false,
          secret: false,
          description:
            "Optional connector-local resource allowlist as a JSON array. Leave it blank to set no local resource restriction and use list_projects and list_logstores to discover resources allowed by RAM. Each item requires project; endpoint is optional and defaults to the connection endpoint. Omitting logstores allows every Logstore in that Project. When logstores is provided, it must contain only non-empty, unique Logstore names and only those Logstores are accessible. This local allowlist does not replace Alibaba Cloud RAM permissions.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.alibabacloud.com/product/log-service",
  actions: aliyunSlsActions,
};
