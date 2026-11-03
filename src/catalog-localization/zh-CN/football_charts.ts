import type { ProviderTranslation } from "../types.ts";

export const translation: ProviderTranslation = {
  description:
    "查询 44 个国家的 98 个足球联赛的积分榜、比赛结果、含校准 Dixon-Coles 概率的赛程、10,000 次蒙特卡洛赛季模拟、进球时间分布和模型校准记录。",
  auth: {
    api_key: {
      label: "API 密钥",
      description:
        "可选的 Football Charts API 密钥，通过 Bearer token 发送。不使用密钥时，每个 IP 每天可读取 100 次（每分钟 20 次）。供个人使用的免费密钥将限额提高至每个邮箱每天 200 次（每分钟 60 次），覆盖全部 98 个联赛的当前和上一赛季；付费套餐可查询自 2020 年起的历史赛季。注册地址：https://www.football-charts.com/developers。",
    },
  },
};
