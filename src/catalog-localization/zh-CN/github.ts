import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  auth: {
    api_key: {
      label: "个人访问令牌",
      description: "通过 Authorization Bearer 请求头使用 GitHub 个人访问令牌。建议使用细粒度令牌。",
    },
    custom_credential: {
      label: "GitHub App 安装实例",
      description:
        "以安装在账号上的 GitHub App 身份进行认证。运行时使用应用私钥签署 JWT，并按需生成有效期为一小时的安装访问令牌，无需粘贴或存储令牌。令牌可读取该安装实例选定的仓库，以及任意公开仓库的内容；不支持 get_current_user 等仅适用于用户身份的操作。",
      fields: {
        appId: {
          label: "应用 ID 或客户端 ID",
          description:
            "GitHub App 的客户端 ID（推荐）或数字应用 ID，均可在应用设置页面查看。尚不支持以客户端 ID 作为签发者标识的旧版 GitHub Enterprise Server 只接受数字应用 ID。",
        },
        installationId: {
          label: "安装实例 ID",
          description:
            "要使用的安装实例的数字 ID，可从该实例的设置页面地址（…/settings/installations/<id>）或安装完成后重定向地址的 installation_id 查询参数中获取。",
        },
        privateKey: {
          label: "私钥（.pem）",
          description:
            "在 GitHub App 设置页面生成的私钥文件的完整内容，格式为 PEM 编码的 RSA 私钥。支持使用转义的 \\n 表示换行。",
        },
      },
    },
    oauth2: {
      authorizationOptions: {
        workflow: {
          label: "修改工作流",
          description: "创建和更新 GitHub Actions 工作流文件。",
        },
        delete_repo: {
          label: "删除仓库",
          description: "删除你拥有管理权限的仓库。",
        },
      },
    },
  },
};
