import type { CatalogTranslation } from "./types.ts";

export const zhCN: CatalogTranslation = {
  labels: { apiKey: "API 密钥", clientId: "客户端 ID", clientSecret: "客户端密钥" },
  categories: {
    AI: "人工智能",
    Advertising: "广告",
    Analytics: "分析",
    "Artificial Intelligence": "人工智能",
    Books: "图书",
    CRM: "客户关系管理",
    Communication: "沟通",
    "Cross Border E-commerce": "跨境电商",
    "Cross-border E-commerce": "跨境电商",
    "Cross-border Ecommerce": "跨境电商",
    "Cross-border ecommerce": "跨境电商",
    Data: "数据",
    "Data & Analytics": "数据与分析",
    Design: "设计",
    "Design & Media": "设计与媒体",
    "Developer Tools": "开发工具",
    Documents: "文档",
    "Documents & Content": "文档与内容",
    "E-commerce": "电子商务",
    ERP: "企业资源规划",
    Finance: "金融",
    "Human Resources": "人力资源",
    Infrastructure: "基础设施",
    Location: "位置服务",
    "Maps & Location": "地图与位置",
    Marketing: "营销",
    Media: "媒体",
    Productivity: "效率工具",
    "Project Management": "项目管理",
    Reference: "参考资料",
    Sales: "销售",
    Search: "搜索",
    Security: "安全",
    "Security & Identity": "安全与身份",
    Social: "社交",
    Storage: "存储",
    Subscriptions: "订阅",
    Video: "视频",
  },
  providers: {
    tencent_meeting_mcp: {
      displayName: "腾讯会议 MCP",
      auth: {
        api_key: {
          label: "腾讯会议 Token",
          placeholder: "粘贴腾讯会议 MCP Token",
          description:
            "登录 https://meeting.tencent.com/ai-skill/ 并复制 Token。企业账号尚未获得访问权限时，可切换到个人账号。Token 代表你的账号身份；如有泄露，请在同一页面重置。",
        },
      },
    },
    openai: {
      auth: {
        api_key: {
          label: "API 密钥",
          description:
            "通过 Authorization Bearer 请求头使用 OpenAI API 密钥。在 API Keys 页面创建或管理密钥：https://platform.openai.com/api-keys。",
        },
      },
    },
    deepseek: {
      auth: {
        api_key: {
          label: "API 密钥",
          description: "用于调用 DeepSeek API 的密钥。在 https://platform.deepseek.com/api_keys 创建或管理密钥。",
        },
      },
    },
    qwen: {
      displayName: "通义千问",
      auth: {
        api_key: {
          label: "百炼 API 密钥",
          placeholder: "输入北京地域的百炼 API 密钥",
          description:
            "北京地域的阿里云百炼 API 密钥，通过 Bearer token 发送。在 https://bailian.console.aliyun.com/?apiKey=1#/api-key 创建密钥。",
        },
      },
    },
    qianfan: {
      displayName: "百度千帆",
      auth: {
        api_key: {
          label: "API 密钥",
          description:
            "通过 Authorization Bearer 请求头使用百度千帆 API 密钥。在系统管理 > API Key 中创建密钥，参见 https://cloud.baidu.com/doc/qianfan/s/wmh8l6tnf。",
        },
      },
    },
    minimax: {
      auth: {
        api_key: {
          label: "API 密钥",
          description:
            "通过 Authorization Bearer 请求头使用 MiniMax API 密钥。全球版密钥可在 https://platform.minimax.io/user-center/basic-information/interface-key 创建或查看，中国版密钥可在 https://platform.minimaxi.com/user-center/basic-information/interface-key 创建或查看。",
          fields: {
            region: {
              label: "地域",
              description:
                "可选，此密钥对应的 MiniMax API 地域。填写 global 使用 api.minimax.io，填写 china 使用 api.minimaxi.com。",
            },
          },
        },
      },
    },
    tencent_docs: { displayName: "腾讯文档" },
    gitee: {
      auth: {
        api_key: {
          label: "个人访问令牌",
          placeholder: "Gitee 个人访问令牌",
          description: "用于调用 Gitee 公共 API V5 的个人访问令牌。",
        },
      },
    },
    amap: {
      displayName: "高德地图",
      auth: {
        api_key: {
          label: "API 密钥",
          description:
            "高德地图 API 密钥，通过 key 查询参数发送。在高德开放平台控制台创建密钥，参见 https://lbs.amap.com/api/webservice/guide/create-project/get-key。",
        },
      },
    },
    github: {
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
            "read:user": { label: "账号资料", description: "识别连接的 GitHub 账号。" },
            repo: { label: "仓库", description: "读取和修改公开及私有仓库。" },
            "user:email": { label: "电子邮箱", description: "读取账号的电子邮箱地址。" },
            workflow: { label: "工作流", description: "更新 GitHub Actions 工作流文件。" },
            delete_repo: { label: "删除仓库", description: "永久删除仓库。" },
          },
        },
      },
    },
    slack: {
      auth: {
        api_key: {
          label: "访问令牌",
          placeholder: "xoxb-... 或 xoxp-...",
          description:
            "通过 Authorization Bearer 请求头使用 Slack 机器人令牌或用户令牌。创建 Slack 应用并将其安装到工作区，然后从 OAuth & Permissions 页面复制机器人令牌或用户令牌。",
        },
        oauth2: {
          authorizationOptions: {
            "channels:read": { label: "公开频道", description: "列出 Slack 公开频道并读取其元数据。" },
            "channels:history": { label: "公开频道消息", description: "读取公开 Slack 频道的历史消息。" },
            "groups:read": { label: "私有频道", description: "列出已连接用户有权访问的私有频道。" },
            "groups:history": { label: "私有频道消息", description: "读取私有 Slack 频道的历史消息。" },
            "users:read": { label: "用户目录", description: "读取 Slack 用户资料和目录信息。" },
            "im:read": { label: "私信会话", description: "读取私信会话的元数据。" },
            "im:history": { label: "私信历史消息", description: "读取私信的历史消息。" },
            "mpim:read": { label: "多人私信会话", description: "读取多人私信会话的元数据。" },
            "mpim:history": { label: "多人私信历史消息", description: "读取多人私信的历史消息。" },
            "files:read": { label: "文件", description: "读取 Slack 中共享的文件。" },
            "reactions:read": { label: "表情回应", description: "读取 Slack 消息上的表情回应。" },
            "chat:write": { label: "发送消息", description: "以已连接的 Slack 用户身份发送消息。" },
            "im:write": { label: "发送私信", description: "以已连接的 Slack 用户身份发送私信。" },
            "files:write": { label: "上传文件", description: "将文件上传到 Slack。" },
            "reactions:write": { label: "管理表情回应", description: "添加和移除 Slack 消息上的表情回应。" },
            "search:read": { label: "旧版消息搜索", description: "使用 Slack 旧版搜索 API 搜索消息。" },
            "search:read.public": {
              label: "公开频道消息搜索",
              description: "使用 Slack Real-time Search 搜索公开频道的消息。",
            },
            "search:read.private": {
              label: "私有频道消息搜索",
              description: "使用 Slack Real-time Search 搜索私有频道的消息。",
            },
          },
        },
      },
    },
    gmail: {
      auth: {
        custom_credential: {
          label: "服务账号",
          description:
            "使用 Google Cloud 服务账号密钥连接，而非用户账号。也可通过全网域委派以 Workspace 用户身份访问。",
          fields: {
            serviceAccountJson: {
              label: "服务账号 JSON",
              description:
                "Google Cloud Console 中的完整服务账号密钥 JSON，可在 IAM & Admin > Service Accounts > Keys 获取。为该账号所属项目启用 Gmail API。服务账号本身没有邮箱，因此还需配置下面的全网域委派。",
            },
            subject: {
              label: "被委派用户的邮箱",
              description:
                "通过全网域委派访问的 Workspace 用户。在 Workspace 管理控制台的 Security > Access and data control > API Controls > Domain-wide Delegation 中，为服务账号的客户端 ID 授予本服务请求的 Gmail 权限范围（scope）。",
            },
          },
        },
      },
    },
    googledrive: {
      auth: {
        custom_credential: {
          label: "服务账号",
          description:
            "使用 Google Cloud 服务账号密钥连接，而非用户账号。也可通过全网域委派以 Workspace 用户身份访问。",
          fields: {
            serviceAccountJson: {
              label: "服务账号 JSON",
              description:
                "Google Cloud Console 中的完整服务账号密钥 JSON，可在 IAM & Admin > Service Accounts > Keys 获取。为该账号所属项目启用 Drive API，并将云端硬盘文件共享给服务账号的邮箱；也可使用下面的全网域委派。",
            },
            subject: {
              label: "被委派用户的邮箱（可选）",
              description:
                "可选，通过全网域委派访问的 Workspace 用户。在 Workspace 管理控制台的 Security > Access and data control > API Controls > Domain-wide Delegation 中，为服务账号的客户端 ID 授予本服务请求的 Drive 权限范围（scope）。不便直接将文件共享给服务账号时，可通过此方式以域内用户身份操作。",
            },
          },
        },
      },
    },
    googlecalendar: {
      auth: {
        custom_credential: {
          label: "服务账号",
          description:
            "使用 Google Cloud 服务账号密钥连接，而非用户账号。也可通过全网域委派以 Workspace 用户身份访问。",
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
    },
    dingtalk_bot: {
      displayName: "钉钉机器人",
      auth: {
        api_key: {
          label: "Webhook 访问令牌",
          placeholder: "钉钉 webhook 地址中的 access_token",
          description:
            "粘贴钉钉 webhook 地址中 access_token 查询参数的值，也可以填写完整的钉钉自定义机器人 webhook 地址。",
          fields: {
            signingSecret: {
              label: "签名密钥",
              placeholder: "可选，钉钉加签模式中的 SEC... 密钥",
              description: "可选，钉钉机器人启用加签安全模式时使用的签名密钥。",
            },
          },
        },
      },
    },
    dingtalk_mcp: {
      displayName: "钉钉 MCP",
      description: "通过钉钉官方 MCP 广场中的服务发现和调用在线工具，例如钉钉文档、日历或通讯录。",
      auth: {
        custom_credential: {
          fields: {
            mcpUrl: {
              label: "MCP 地址",
              description:
                "钉钉 MCP 广场中某个服务的私密 Streamable HTTP 地址。登录钉钉后，在 MCP 广场（https://aihub.dingtalk.com/#/mcp-market/mcp）打开一个服务，点击“获取 MCP Server 配置”并复制地址。每个连接对应一个广场服务。官方指南：https://open.dingtalk.com/document/development/mcp-square-introduction。",
            },
          },
        },
      },
    },
    wecom_bot: {
      displayName: "企业微信机器人",
      description:
        "通过群 webhook 发送消息，或使用企业微信 API 模式智能机器人的工具操作通讯录、会话、待办、会议、日程、文档、表格和智能页面。",
      auth: {
        api_key: {
          label: "Webhook 密钥",
          description:
            "粘贴企业微信群机器人 webhook 地址中 key 查询参数的值，也可以填写完整的 webhook 地址。创建群机器人并复制 webhook 地址，参见 https://developer.work.weixin.qq.com/document/path/91770。",
        },
        custom_credential: {
          fields: {
            botId: {
              label: "机器人 ID",
              placeholder: "机器人 ID",
              description:
                "企业微信 API 模式智能机器人的 Bot ID。创建机器人后复制其 Bot ID，参见 https://open.work.weixin.qq.com/help2/pc/cat?doc_id=21677。",
            },
            secret: {
              label: "机器人密钥",
              placeholder: "机器人密钥",
              description:
                "同一个企业微信 API 模式智能机器人的 Secret。与 Bot ID 一同复制，参见 https://open.work.weixin.qq.com/help2/pc/cat?doc_id=21677。",
            },
          },
        },
      },
    },
    wecom_mcp: {
      displayName: "企业微信 MCP",
      auth: {
        custom_credential: {
          fields: {
            mcpUrl: {
              label: "MCP 地址",
              description: "从企业微信 API 模式机器人的权限页面复制的私密 Streamable HTTP 地址。",
            },
          },
        },
      },
    },
    feishu_custom_bot: {
      displayName: "飞书自定义机器人",
      auth: {
        api_key: {
          label: "Webhook 令牌",
          placeholder: "飞书 webhook 地址中的 token",
          description:
            "粘贴飞书 webhook 地址路径中的 token，也可以填写完整的 webhook 地址。创建自定义机器人的方法参见 https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot。",
          fields: {
            signingSecret: {
              label: "签名密钥",
              placeholder: "可选，飞书签名校验密钥",
              description: "可选，机器人启用签名校验时使用的签名密钥，可在飞书机器人的安全设置中复制。",
            },
          },
        },
      },
    },
    feishu: { displayName: "飞书" },
    feishu_app_bot: {
      displayName: "飞书应用机器人",
      auth: {
        custom_credential: {
          fields: {
            appId: {
              label: "应用 ID",
              description:
                "用于获取 tenant_access_token 的飞书自建应用 app_id，可在 https://open.feishu.cn/app 的应用凭证页面查看。",
            },
            appSecret: {
              label: "应用密钥",
              description:
                "用于获取 tenant_access_token 的飞书自建应用 app_secret，可在 https://open.feishu.cn/app 的应用凭证页面复制。",
            },
            verificationToken: {
              label: "事件验证令牌",
              description: "可选的飞书事件订阅验证令牌。仅在此连接通过 OpenConnector 验证入站频道事件时需要。",
            },
            encryptKey: {
              label: "事件加密密钥",
              description:
                "可选的飞书事件订阅 Encrypt Key。OpenConnector 验证加密入站事件时，需与 verificationToken 一同配置。",
            },
          },
        },
      },
    },
    box: {
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
    },
    dokploy: {
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
    },
    airtable: {
      auth: {
        api_key: {
          label: "个人访问令牌",
          description:
            "通过 Authorization Bearer 请求头使用 Airtable 个人访问令牌。在开发者中心创建：https://airtable.com/create/tokens。",
        },
      },
    },
    notion: {
      auth: {
        api_key: {
          label: "内部集成密钥",
          description:
            "通过 Authorization Bearer 请求头使用 Notion 内部集成密钥。在 Creator dashboard 创建内部集成并复制密钥，然后向该集成共享目标页面或数据库。配置指南：https://developers.notion.com/guides/connections-and-tokens/internal-connections。",
        },
      },
    },
    football_charts: {
      description:
        "查询 44 个国家的 98 个足球联赛的积分榜、比赛结果、含校准 Dixon-Coles 概率的赛程、10,000 次蒙特卡洛赛季模拟、进球时间分布和模型校准记录。",
      auth: {
        api_key: {
          label: "API 密钥",
          description:
            "可选的 Football Charts API 密钥，通过 Bearer token 发送。不使用密钥时，每个 IP 每天可读取 100 次（每分钟 20 次）。供个人使用的免费密钥将限额提高至每个邮箱每天 200 次（每分钟 60 次），覆盖全部 98 个联赛的当前和上一赛季；付费套餐可查询自 2020 年起的历史赛季。注册地址：https://www.football-charts.com/developers。",
        },
      },
    },
  },
};
