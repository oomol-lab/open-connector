import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
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
};
