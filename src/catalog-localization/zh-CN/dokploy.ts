import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  description: "管理自托管 Dokploy 实例的基础设施、服务、部署、访问权限和设置。",
  auth: {
    api_key: {
      label: "API 密钥",
      placeholder: "输入 Dokploy API 密钥",
      description: "在 Dokploy 控制台的 Settings > API Keys 中创建密钥。密钥通过 x-api-key 请求头发送。",
      fields: {
        baseUrl: {
          label: "实例地址",
          description:
            "Dokploy 实例的 HTTP 或 HTTPS 地址，不含 API 接口路径。默认允许公网地址；私有网络或覆盖网络目标（RFC 1918、Tailscale、NetBird、私有主机名）需要自托管运行时启用 OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK。不安全的本地地址、保留地址和云元数据地址始终被阻止。参见 https://docs.dokploy.com/docs/core/api。",
        },
      },
    },
  },
};
