import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  description: "浏览和管理 Box 账号中的文件和文件夹。",
  auth: {
    oauth2: {
      steps: [
        "在 Box Developer Console 中创建使用 OAuth 2.0 的 Custom App。",
        "为应用启用文件和文件夹的读写权限。",
        "将 OOMOL Connect 显示的回调地址添加到应用的 OAuth 2.0 重定向 URI 中。",
        "将客户端 ID 和客户端密钥复制到 OOMOL Connect。",
      ],
    },
  },
};
