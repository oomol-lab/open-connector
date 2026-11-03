import type { CatalogTranslation } from "./types.ts";

import { translation as airtable } from "./zh-CN/airtable.ts";
import { translation as amap } from "./zh-CN/amap.ts";
import { translation as box } from "./zh-CN/box.ts";
import { translation as deepseek } from "./zh-CN/deepseek.ts";
import { translation as dingtalk_bot } from "./zh-CN/dingtalk_bot.ts";
import { translation as dingtalk_mcp } from "./zh-CN/dingtalk_mcp.ts";
import { translation as dokploy } from "./zh-CN/dokploy.ts";
import { translation as feishu } from "./zh-CN/feishu.ts";
import { translation as feishu_app_bot } from "./zh-CN/feishu_app_bot.ts";
import { translation as feishu_custom_bot } from "./zh-CN/feishu_custom_bot.ts";
import { translation as football_charts } from "./zh-CN/football_charts.ts";
import { translation as gitee } from "./zh-CN/gitee.ts";
import { translation as github } from "./zh-CN/github.ts";
import { translation as gmail } from "./zh-CN/gmail.ts";
import { translation as googlecalendar } from "./zh-CN/googlecalendar.ts";
import { translation as googledrive } from "./zh-CN/googledrive.ts";
import { translation as minimax } from "./zh-CN/minimax.ts";
import { translation as notion } from "./zh-CN/notion.ts";
import { translation as openai } from "./zh-CN/openai.ts";
import { translation as qianfan } from "./zh-CN/qianfan.ts";
import { translation as qwen } from "./zh-CN/qwen.ts";
import { translation as slack } from "./zh-CN/slack.ts";
import { translation as tencent_docs } from "./zh-CN/tencent_docs.ts";
import { translation as tencent_meeting_mcp } from "./zh-CN/tencent_meeting_mcp.ts";
import { translation as wecom_bot } from "./zh-CN/wecom_bot.ts";
import { translation as wecom_mcp } from "./zh-CN/wecom_mcp.ts";

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
    tencent_meeting_mcp,
    openai,
    deepseek,
    qwen,
    qianfan,
    minimax,
    tencent_docs,
    gitee,
    amap,
    github,
    slack,
    gmail,
    googledrive,
    googlecalendar,
    dingtalk_bot,
    dingtalk_mcp,
    wecom_bot,
    wecom_mcp,
    feishu_custom_bot,
    feishu,
    feishu_app_bot,
    box,
    dokploy,
    airtable,
    notion,
    football_charts,
  },
};
