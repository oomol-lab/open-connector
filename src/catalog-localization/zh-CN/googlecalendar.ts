import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  auth: {
    custom_credential: {
      label: "服务账号",
      description: "使用 Google Cloud 服务账号密钥连接，而非用户账号。也可通过全网域委派以 Workspace 用户身份访问。",
      fields: {
        serviceAccountJson: {
          label: "服务账号 JSON",
          description:
            "Google Cloud Console 中的完整服务账号密钥 JSON，可在 IAM & Admin > Service Accounts > Keys 获取。为该账号所属项目启用 Calendar API，并将日历共享给服务账号的邮箱；也可使用下面的全网域委派。",
        },
        subject: {
          label: "被委派用户的邮箱（可选）",
          description:
            "可选，通过全网域委派访问的 Workspace 用户。在 Workspace 管理控制台的 Security > Access and data control > API Controls > Domain-wide Delegation 中，为服务账号的客户端 ID 授予本服务请求的 Calendar 权限范围（scope）。",
        },
      },
    },
  },
};
