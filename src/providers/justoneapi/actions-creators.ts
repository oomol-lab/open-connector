import type { JustoneapiEndpoint } from "./endpoint-definition.ts";

import { s } from "../../core/json-schema.ts";

export const creatorEndpoints: readonly JustoneapiEndpoint[] = [
  {
    name: "xiaohongshu_creator_marketplace_pugongying_creator_search",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/cooperator/blogger/v2/v1",
    authLocation: "query",
    description:
      "Search Xiaohongshu Pugongying creators with keyword, audience, location, content, pricing, performance, cooperation, live, and similarity filters. Use it to build a campaign creator shortlist.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Creator Search.",
      {
        searchType: s.withDefault(
          s.withEnum(
            s.string(
              "Search criteria type.\n\nAvailable Values:\n- `NICKNAME`: Search by nickname\n- `NOTE`: Search by note content",
            ),
            ["NICKNAME", "NOTE"],
          ),
          "NICKNAME",
        ),
        keyword: s.string("Search keyword."),
        page: s.integer("Page number.", { default: 1 }),
        sort: s.withDefault(
          s.withEnum(
            s.string(
              "Creator search sorting. Values: FANS sorts by follower count descending, DEFAULT uses Pugongying intelligent ranking; READ_MEDIAN and ENGAGEMENT_MEDIAN sort by median reads and engagement, and PRICE_ASC/PRICE_DESC sort by price.\n\nAvailable Values:\n- `DEFAULT`: Platform default intelligent ranking\n- `FANS`: Sort by follower count descending",
            ),
            ["DEFAULT", "FANS", "READ_MEDIAN", "ENGAGEMENT_MEDIAN", "PRICE_ASC", "PRICE_DESC"],
          ),
          "FANS",
        ),
        fansNumberLower: s.integer("Minimum number of fans."),
        fansNumberUpper: s.integer("Maximum number of fans."),
        fansAge: s.withDefault(
          s.withEnum(
            s.string(
              "Target fans age group.\n\nAvailable Values:\n- `ALL`: All ages\n- `LT_18`: Under 18\n- `AGE_18_24`: 18 to 24\n- `AGE_25_34`: 25 to 34\n- `AGE_35_44`: 35 to 44\n- `GT_44`: Above 44",
            ),
            ["ALL", "LT_18", "AGE_18_24", "AGE_25_34", "AGE_35_44", "GT_44"],
          ),
          "ALL",
        ),
        fansGender: s.withDefault(
          s.withEnum(
            s.string(
              "Target fans gender.\n\nAvailable Values:\n- `ALL`: All genders\n- `MALE_HIGH`: Mainly Male\n- `FE_MALE_HIGH`: Mainly Female",
            ),
            ["ALL", "MALE_HIGH", "FE_MALE_HIGH"],
          ),
          "ALL",
        ),
        fansChildAgeInfo: s.string(
          "Mother-and-baby audience stage filter. Pass Pugongying labels or numeric codes separated by English or Chinese commas.\n\nAvailable values:\n- 1: 备孕\n- 2: 0-6月\n- 3: 7-12月\n- 4: 1-3岁\n- 5: 4-6岁\n- 6: 7-12岁\n- 7: 孕早期\n- 8: 孕晚期\n",
        ),
        gender: s.withDefault(
          s.withEnum(
            s.string("KOL's gender.\n\nAvailable Values:\n- `ALL`: All genders\n- `MALE`: Male\n- `FEMALE`: Female"),
            ["ALL", "MALE", "FEMALE"],
          ),
          "ALL",
        ),
        location: s.string(
          "Creator profile location filter. Pass Pugongying location labels separated by English or Chinese commas. Country, China province or region, city-level paths, and district/county-level paths are supported. China province or region short labels are normalized to the full Pugongying value. Only paths present in the Pugongying location tree are accepted. Paths such as `河北 秦皇岛`, `山西 长治 潞州区`, or `中国 山西 长治 潞州区` are normalized to values like `中国 山西 长治 潞州区`.\n\nAvailable country/province base values:\n- 中国\n- 美国\n- 日本\n- 澳大利亚\n- 英国\n- 加拿大\n- 韩国\n- 法国\n- 德国\n- 新加坡\n- 其他\n- 中国 北京\n- 中国 天津\n- 中国 河北\n- 中国 山西\n- 中国 内蒙古\n- 中国 辽宁\n- 中国 吉林\n- 中国 黑龙江\n- 中国 上海\n- 中国 江苏\n- 中国 浙江\n- 中国 安徽\n- 中国 福建\n- 中国 江西\n- 中国 山东\n- 中国 河南\n- 中国 湖北\n- 中国 湖南\n- 中国 广东\n- 中国 广西\n- 中国 海南\n- 中国 重庆\n- 中国 四川\n- 中国 贵州\n- 中国 云南\n- 中国 西藏\n- 中国 陕西\n- 中国 甘肃\n- 中国 青海\n- 中国 宁夏\n- 中国 新疆\n- 中国 澳门\n- 中国 台湾\n- 中国 香港\n\nExample:\n- 广东,中国 上海,河北 秦皇岛,山西 长治 潞州区\n",
        ),
        contentTag: s.string(
          "Content category filter. Pass first-level or second-level category labels from Pugongying, separated by commas.\n\nAvailable values:\n- 美妆: 整体妆容, 唇妆, 眼妆, 美甲, 底妆, 美妆合集, 香水, 美妆其他\n- 护肤: 面部保养, 面部清洁, 护肤合集, 护肤其他\n- 个人护理: 头发产品, 身体护理, 口腔护理, 护理其他\n- 母婴: 母婴日常, 早教, 婴童用品, 婴童洗护, 婴童食品, 婴童时尚, 孕期穿搭, 孕产经验, 产后恢复, 育儿经验, 宝宝才艺, 宝宝写真, 母婴其他\n- 时尚: 穿搭, 配饰, 发型, 箱包, 鞋靴, 时尚其他\n- 美食: 美食教程, 美食探店, 美食展示, 美食测评, 吃播, 美食其他\n- 家居家装: 装修, 家居用品, 家居装饰, 家具, 家电, 室内设计, 居家经验, 家居家装其他\n- 影视综资讯: 动漫, 电影, 电视, 娱乐资讯, 影视, 民生资讯, 综艺, 影视综其他\n- 运动健身: 健身减肥, 健身塑形, 滑雪, 滑板, 水上活动, 运动其他, 足球, 篮球, 跑步, 游泳\n- 宠物: 猫, 狗, 动物其他\n- 文化艺术: 社科, 文化, 艺术, 文化艺术其他\n- 兴趣爱好: 绘画, 手工, 阅读, 文具手账, 舞蹈, 益智玩具, 潮流玩具, 兴趣爱好其他\n- 生活记录: 接地气生活, 日常片段, 中外生活, 品质生活, 校园生活\n- 教育: 大学教育, k12教育, 家庭教育, 学习日常, 职场教育, 教育其他\n- 情感: 情感知识, 情感日常, 情感其他\n- 摄影: 人文风光摄影, 摄影技巧, 胶片摄影, 人像摄影, 摄影其他\n- 游戏: 手机游戏, 主机游戏, 游戏其他, 线下游戏\n- 科技数码: 数码, 玩机攻略, 数码科技其他\n- 出行: 城市出行, 户外, 旅行\n- 音乐\n- 搞笑\n- 健康养生\n- 汽车\n- 婚嫁: 婚礼造型, 婚礼记录, 婚礼经验, 婚礼用品\n- 商业财经\n- 素材\n- 其他\n",
        ),
        contentSceneLabel: s.string(
          "Content scene label filter. Pass full Pugongying note category scene label paths separated by English or Chinese commas.\n\nAvailable values:\n- 汽车 理性决策 选车攻略 政策\n- 汽车 理性决策 选车攻略 购车顾虑\n- 汽车 理性决策 选车攻略 配置\n- 汽车 理性决策 选车攻略 能源类型优势对比\n- 汽车 理性决策 选车攻略 攻略\n- 汽车 理性决策 新车测评\n- 汽车 理性决策 探店试驾\n- 汽车 理性决策 车主心得\n- 汽车 用车场景 远行近游 近郊探索\n- 汽车 用车场景 远行近游 长途自驾\n- 汽车 用车场景 远行近游 硬核越野\n- 汽车 用车场景 提车/交付场景 场地布置与礼遇\n- 汽车 用车场景 提车/交付场景 仪式感记录\n- 汽车 用车场景 商务用车 移动头等舱\n- 汽车 用车场景 商务用车 商务接待\n- 汽车 用车场景 亲子家庭 家庭采购日\n- 汽车 用车场景 亲子家庭 接送孩子\n- 汽车 用车场景 亲子家庭 三代同堂\n- 汽车 用车场景 亲子家庭 周末溜娃\n- 汽车 用车场景 亲子家庭 车内学习室\n- 汽车 用车场景 亲子家庭 车内育婴室\n- 汽车 用车场景 朋友社交 后备箱经济\n- 汽车 用车场景 朋友社交 移动娱乐屋\n- 汽车 用车场景 礼赠场景 毕业礼物\n- 汽车 用车场景 礼赠场景 送给父母\n- 汽车 用车场景 礼赠场景 适合送男友\n- 汽车 用车场景 礼赠场景 适合送女友\n- 汽车 用车场景 户外兴趣 钓鱼/野营\n- 汽车 用车场景 户外兴趣 骑行\n- 汽车 用车场景 户外兴趣 徒步\n- 汽车 用车场景 户外兴趣 硬核竞速\n- 汽车 用车场景 宠物出行 大型宠物\n- 汽车 用车场景 宠物出行 短途出行\n- 汽车 用车场景 宠物出行 小型宠物\n- 汽车 用车场景 宠物出行 长途出行\n- 汽车 用车场景 城市通勤 车内小憩\n- 汽车 用车场景 城市通勤 健身储物\n- 汽车 用车场景 城市通勤 日常通勤\n- 汽车 用车场景 城市通勤 生活圈代步\n- 汽车 用车场景 城市通勤 移动美容舱\n- 汽车 个性化美化 个性改装\n- 汽车 个性化美化 储物收纳\n- 汽车 个性化美化 车内装饰\n- 汽车 个性化美化 车外装饰\n- 汽车 个性化美化 车衣保护\n- 汽车 个性化美化 汽车用品\n- 汽车 车型品类 轿车\n- 汽车 车型品类 SUV\n- 汽车 车型品类 MPV\n- 汽车 车型品类 跑车\n- 汽车 车型品类 微型车\n- 汽车 车型品类 微面\n- 汽车 车型品类 房车\n- 汽车 车型品类 越野车\n- 汽车 车型品类 旅行车\n- 汽车 圈层属性 改装圈层\n- 汽车 圈层属性 痛车圈层\n- 汽车 圈层属性 跑山圈层\n- 汽车 品牌倾向 自主\n- 汽车 品牌倾向 豪华\n- 汽车 品牌倾向 集团\n- 汽车 品牌倾向 新势力\n- 汽车 能源类型 纯电车\n- 汽车 能源类型 新能源\n- 汽车 能源类型 油车\n- 汽车 人生阶段 单身\n- 汽车 人生阶段 多娃&大家庭阶段\n- 汽车 人生阶段 银发退休阶段\n- 游戏 游戏品类 网页游戏\n- 游戏 游戏品类 电脑游戏\n- 游戏 游戏品类 手机游戏\n- 游戏 游戏类型 动作格斗游戏 永劫无间\n- 游戏 游戏类型 即时制二次元游戏 境界刀鸣\n- 游戏 游戏类型 即时制二次元游戏 黑色信标\n- 游戏 游戏类型 即时制二次元游戏 物华弥新\n- 游戏 游戏类型 即时制二次元游戏 无期迷途\n- 游戏 游戏类型 即时制二次元游戏 新月同行\n- 游戏 游戏类型 即时制二次元游戏 绝区零\n- 游戏 游戏类型 即时制角色扮演 诛仙2\n- 游戏 游戏类型 即时制角色扮演 诛仙\n- 游戏 游戏类型 即时制角色扮演 明日之后\n- 游戏 游戏类型 即时制角色扮演 超自然行动组\n- 游戏 游戏类型 即时制角色扮演 永恒之塔2\n- 游戏 游戏类型 回合制二次元游戏 未定事件簿\n- 游戏 游戏类型 回合制二次元游戏 雷索纳斯\n- 游戏 游戏类型 回合制二次元游戏 浮生忆玲珑\n- 游戏 游戏类型 回合制二次元游戏 重返未来1999\n- 游戏 游戏类型 回合制角色扮演 梦幻西游手游\n- 游戏 游戏类型 回合制角色扮演 龙魂旅人\n- 游戏 游戏类型 回合制角色扮演 最终幻想14\n- 游戏 游戏类型 塔防游戏 保卫向日葵\n- 游戏 游戏类型 塔防游戏 全境守卫\n- 游戏 游戏类型 塔防游戏 向僵尸开炮\n- 游戏 游戏类型 开放世界角色扮演 燕云十六声\n- 游戏 游戏类型 开放世界角色扮演 王者荣耀世界\n- 游戏 游戏类型 恋爱游戏 如鸢\n- 游戏 游戏类型 恋爱游戏 银与绯\n- 游戏 游戏类型 恋爱游戏 时空中的绘旅人\n- 游戏 游戏类型 恋爱游戏 光与夜之恋\n- 游戏 游戏类型 恋爱游戏 恋与深空\n- 游戏 游戏类型 恋爱游戏 恋与制作人\n- 游戏 游戏类型 战略游戏 率土之滨\n- 游戏 游戏类型 战略游戏 群星纪元\n- 游戏 游戏类型 战略游戏 阿瓦隆之王\n- 游戏 游戏类型 战略游戏 快来当领主\n- 游戏 游戏类型 战略游戏 冒险之星\n- 游戏 游戏类型 战略游戏 无尽的拉格朗日\n- 游戏 游戏类型 放置类二次元游戏 花花与幕间剧\n- 游戏 游戏类型 放置类角色扮演 发条总动员\n- 游戏 游戏类型 放置类角色扮演 遮天凡尘一叶\n- 游戏 游戏类型 模拟养成 美人传\n- 游戏 游戏类型 模拟养成 盲盒派对\n- 游戏 游戏类型 模拟养成 闪耀暖暖\n- 游戏 游戏类型 模拟养成 以闪亮之名\n- 游戏 游戏类型 模拟养成 无限暖暖\n- 游戏 游戏类型 模拟家园建造 江南百景图\n- 游戏 游戏类型 模拟家园建造 动物森友会\n- 游戏 游戏类型 模拟家园建造 星露谷物语\n- 游戏 游戏类型 模拟经营 暴吵萌厨\n- 游戏 游戏类型 模拟经营 肥鹅健身房\n- 游戏 游戏类型 模拟职业 杜拉拉升职记\n- 游戏 游戏类型 消除游戏 四季合合\n- 游戏 游戏类型 生存沙盒游戏 无尽冬日\n- 游戏 游戏类型 聚会游戏 蛋仔派对\n- 游戏 游戏类型 聚会游戏 代号砰砰\n- 游戏 游戏类型 解谜游戏 晴空之下\n- 游戏 游戏类型 抓宠类游戏 洛克王国手游\n- 游戏 游戏类型 射击游戏 三角洲行动\n- 游戏 游戏类型 射击游戏 codm（使命召唤）\n- 母婴 婴童洗护 安全防晒\n- 母婴 婴童洗护 浴后护理\n- 母婴 婴童洗护 敏感修护\n- 母婴 婴童洗护 屏障树立\n- 母婴 婴童洗护 泳后护理\n- 母婴 婴童洗护 口周干裂\n- 母婴 婴童洗护 分区清洁\n- 母婴 婴童洗护 头皮问题\n- 母婴 婴童洗护 驱虫驱蚊\n- 母婴 婴童洗护 洁面清洁\n- 母婴 婴童洗护 红屁股\n- 母婴 婴童洗护 湿疹皮炎\n- 母婴 婴童洗护 痱子热疹\n- 母婴 婴童洗护 抚触链接\n- 母婴 婴童洗护 趣味洗护\n- 母婴 母婴纸品 精算育儿\n- 母婴 母婴纸品 颜值派\n- 母婴 母婴纸品 汗宝宝\n- 母婴 母婴纸品 囤货党\n- 母婴 母婴纸品 敏感肌\n- 母婴 母婴纸品 肉腿娃\n- 母婴 母婴纸品 功课党\n- 母婴 母婴纸品 好动宝\n- 母婴 母婴纸品 安睡整夜\n- 母婴 母婴纸品 出行便携\n- 母婴 母婴纸品 贵妇体验\n- 母婴 母婴纸品 红屁屁\n- 母婴 母婴小家电 空间收纳\n- 母婴 母婴小家电 滋补养生\n- 母婴 母婴小家电 温度把控\n- 母婴 母婴小家电 夜奶操作\n- 母婴 母婴小家电 新手喂养\n- 母婴 母婴小家电 材质挑选\n- 母婴 母婴小家电 三代同育\n- 母婴 母婴小家电 户外喂养\n- 母婴 母婴小家电 通乳攻略\n- 母婴 母婴小家电 洁癖爸妈\n- 母婴 母婴小家电 精准喂养\n- 母婴 母婴小家电 职场妈妈\n- 母婴 婴童辅食 吞咽能力\n- 母婴 婴童辅食 多元辅食\n- 母婴 婴童辅食 零食分享\n- 母婴 婴童辅食 健康零食\n- 母婴 婴童辅食 放学加餐\n- 母婴 婴童辅食 出牙磨牙\n- 母婴 婴童辅食 居家囤货\n- 母婴 婴童辅食 节日礼包\n- 母婴 婴童辅食 零食训练\n- 母婴 婴童辅食 宝宝挑食\n- 母婴 婴童辅食 户外零食\n- 母婴 婴童辅食 低敏辅食\n- 母婴 婴童辅食 入园社交\n- 母婴 婴童辅食 居家辅食\n- 母婴 婴童辅食 入园准备\n- 母婴 婴童辅食 敏敏零食\n- 母婴 婴童辅食 抓握训练\n- 母婴 婴童辅食 外出口粮\n- 母婴 婴童辅食 营养均衡\n- 母婴 婴童辅食 自主进食\n- 母婴 婴童辅食 第一口辅食\n- 母婴 母婴营养品 开胃因子\n- 母婴 母婴营养品 视力保护\n- 母婴 母婴营养品 营养补充\n- 母婴 母婴营养品 防护因子\n- 母婴 母婴营养品 高钙因子\n- 母婴 母婴营养品 自护构建\n- 母婴 母婴营养品 发育表现\n- 母婴 母婴营养品 助眠安睡\n- 母婴 婴童奶粉 丝滑转奶\n- 母婴 婴童奶粉 益生组合\n- 母婴 婴童奶粉 眼脑体发育\n- 母婴 婴童奶粉 选奶功课\n- 母婴 婴童奶粉 防敏脱敏\n- 母婴 婴童奶粉 助力聪明脑\n- 母婴 婴童奶粉 乳铁自护\n- 母婴 婴童奶粉 黄金长高\n- 母婴 婴童奶粉 内修外护\n- 母婴 婴童奶粉 肚肚吸收\n- 母婴 婴童奶粉 断奶攻略\n- 母婴 婴童奶粉 混合喂养\n- 母婴 婴童奶粉 母源黄金HMO\n- 母婴 婴童奶粉 长肉多肉\n- 母婴 哺乳喂养工具 萌娃穿搭\n- 母婴 哺乳喂养工具 安全材质\n- 母婴 哺乳喂养工具 奶瓶喂养\n- 母婴 哺乳喂养工具 颜值发育\n- 母婴 哺乳喂养工具 哄娃安抚\n- 母婴 哺乳喂养工具 餐具选购\n- 母婴 哺乳喂养工具 学饮指南\n- 母婴 哺乳喂养工具 换季保温\n- 母婴 母婴孕产 职场孕妇\n- 母婴 母婴孕产 产后复工\n- 母婴 母婴孕产 顺产\n- 母婴 母婴孕产 孕期变化\n- 母婴 母婴孕产 孕期学习\n- 母婴 母婴孕产 剖腹产\n- 母婴 母婴家居 护脊深睡\n- 母婴 母婴家居 安全翻滚\n- 母婴 母婴家居 进食习惯\n- 母婴 母婴家居 早教启蒙\n- 母婴 母婴家居 学习角落\n- 母婴 母婴家居 自主入睡\n- 母婴 母婴家居 爬行探索\n- 母婴 母婴家居 防惊跳\n- 母婴 母婴出行&用品 长线旅途\n- 母婴 母婴出行&用品 户外探索\n- 母婴 母婴出行&用品 二胎/双胎\n- 母婴 母婴出行&用品 新贵消费\n- 母婴 母婴出行&用品 备产研究\n- 母婴 母婴出行&用品 短途旅行\n- 母婴 母婴出行&用品 高频出行\n- 母婴 母婴出行&用品 新生出行\n- 母婴 母婴出行&用品 务实精算\n- 母婴 母婴出行&用品 遛娃必备\n",
        ),
        personalTags: s.string(
          "Blogger persona tag filter. Pass one or more Pugongying persona labels separated by English or Chinese commas.\n\nAvailable values:\n- 妈妈\n- 萌娃\n- 爸爸\n- 奶奶\n- 情侣\n- 夫妻\n- 家庭\n- 闺蜜\n- 兄弟\n- 备孕中\n- 孕期中\n- 12岁以上\n- 传统行业\n- 互联网\n- 教育科研\n- 金融法律\n- 企业创业\n- 时尚美妆\n- 食品饮料\n- 文化传媒\n- 医疗健康\n- 艺术设计\n- 影视娱乐\n- 运动健身\n- 专业服务\n- 工程师\n- 销售\n- HR\n- 教练\n- 运动员\n- 舞蹈老师\n- 生活背景\n- 备考经验\n- 兴趣爱好\n- 留学背景\n- 海外华人\n- 铲屎官\n- 孕妈\n- 独居人群\n- 外国人\n- 混血儿\n\nExample:\n- 妈妈,教练,运动员,舞蹈老师,留学背景\n",
        ),
        marketTarget: s.string(
          "Marketing target filter. Pass one Pugongying marketing target value.\n\nAvailable values:\n- estimateAllCpm: Exposure - exposure performance - cost\n- mAccumImpNum: Exposure - exposure performance - scale\n- readCost: Exposure - read performance - cost\n- mValidRawReadFeedNum: Exposure - read performance - scale\n- estimateEngageCost: Seeding - engagement performance - cost\n- mEngagementNum90d: Seeding - engagement performance - scale\n- estimateCpuv: Conversion - outer-store visit performance - cost\n- mCpuvNum: Conversion - outer-store visit performance - scale\n",
        ),
        audienceGroup: s.string(
          "Audience target filter. Pass Pugongying audience group IDs (`dmpGroupId`) separated by English or Chinese commas. These IDs are dynamic and account-specific, so there is no fixed global value list. Use the audience group name shown in Pugongying Audience Management to identify what each ID means.\n",
        ),
        top20CrowdsLabel: s.string(
          "Top-20 audience filter. Pass top-level or child audience labels separated by commas; child labels are converted to Pugongying request values.",
        ),
        industrySpecificCrowdsMotorDom: s.string(
          "Industry-specific portrait filter. Pass Pugongying portrait value IDs or label values separated by commas.",
        ),
        featureTags: s.string("Good-at content tag filter. Pass label values separated by commas."),
        contentThemeLabel: s.string(
          "Content theme filter. Pass Pugongying value IDs or label values separated by commas; labels are converted to value IDs.",
        ),
        excludeLowActive: s.boolean("Whether to exclude low-activity bloggers."),
        fansNumUp: s.boolean("Whether to exclude bloggers whose fan count is dropping."),
        noteType: s.withDefault(
          s.withEnum(
            s.string(
              "Note type filter. Values: ALL=all note types, PHOTO_TEXT=mainly photo-text notes, VIDEO=mainly video notes.\n\nAvailable Values:\n- `ALL`: All note types\n- `PHOTO_TEXT`: Mainly photo-text notes\n- `VIDEO`: Mainly video notes",
            ),
            ["ALL", "PHOTO_TEXT", "VIDEO"],
          ),
          "ALL",
        ),
        industry: s.withEnum(
          s.string(
            "Pugongying industry preset for industry assistant style creator recommendations.\n\nAvailable Values:\n- `BEAUTY_PERSONAL_CARE_BEAUTY`: Beauty and personal care - beauty\n- `BEAUTY_PERSONAL_CARE_SKINCARE`: Beauty and personal care - skincare\n- `BEAUTY_PERSONAL_CARE_PERSONAL_CARE`: Beauty and personal care - personal care\n- `BEAUTY_PERSONAL_CARE_FRAGRANCE`: Beauty and personal care - fragrance\n- `FOOD_BEVERAGE_SNACKS`: Food and beverage - snacks\n- `FOOD_BEVERAGE_DRINKS`: Food and beverage - drinks\n- `FOOD_BEVERAGE_HEALTH_FOOD`: Food and beverage - health food\n- `FOOD_BEVERAGE_DAIRY`: Food and beverage - dairy\n- `FOOD_BEVERAGE_ALCOHOL`: Food and beverage - alcohol\n- `FOOD_BEVERAGE_GRAINS_OIL`: Food and beverage - grains and oil\n- `FOOD_BEVERAGE_CROSS_BORDER_FOOD`: Food and beverage - cross-border food\n- `FOOD_BEVERAGE_FRESH_FOOD`: Food and beverage - fresh food\n- `FOOD_BEVERAGE_MEAL_REPLACEMENT`: Food and beverage - meal replacement\n- `FOOD_BEVERAGE_TRADITIONAL_NOURISHMENT`: Food and beverage - traditional nourishment\n- `MOTHER_BABY_SUPPLIES`: Mother and baby - baby supplies\n- `MOTHER_BABY_FORMULA_FOOD`: Mother and baby - formula and baby food\n- `DIGITAL_APPLIANCES_HOME_APPLIANCES`: Digital and appliances - home appliances\n- `DIGITAL_APPLIANCES_DIGITAL_PRODUCTS`: Digital and appliances - digital products\n- `DAILY_GOODS_HOUSEHOLD_DAILY_USE`: Daily goods - household daily use\n- `DAILY_GOODS_PET_SUPPLIES_FOOD`: Daily goods - pet supplies and food\n- `DAILY_GOODS_OFFICE_SUPPLIES`: Daily goods - office supplies\n- `APPAREL_ACCESSORIES_CLOTHING_SHOES_HATS`: Apparel and accessories - clothing, shoes, and hats\n- `APPAREL_ACCESSORIES_JEWELRY`: Apparel and accessories - jewelry\n- `APPAREL_ACCESSORIES_BAGS_GLASSES`: Apparel and accessories - bags and glasses\n- `APPAREL_ACCESSORIES_SPORTS_OUTDOOR`: Apparel and accessories - sports and outdoor\n- `APPAREL_ACCESSORIES_WATCHES`: Apparel and accessories - watches\n- `APPAREL_ACCESSORIES_SECOND_HAND_LUXURY`: Apparel and accessories - second-hand luxury\n- `HOME_BUILDING_MATERIALS_HOME_DECOR`: Home and building materials - home decor\n- `HOME_BUILDING_MATERIALS_FURNITURE`: Home and building materials - furniture\n- `HOME_BUILDING_MATERIALS_MAIN_MATERIALS`: Home and building materials - main building materials\n- `AUTOMOTIVE`: Automotive\n- `INTERNET_ECOMMERCE`: Internet - e-commerce\n- `INTERNET_SOFTWARE_TOOLS`: Internet - software tools\n- `HEALTHCARE_MEDICAL_DEVICES`: Healthcare - medical devices\n- `HEALTHCARE_MEDICAL_BEAUTY`: Healthcare - medical beauty\n- `CULTURE_SPORTS_ENTERTAINMENT_SPORTS_GOODS`: Culture, sports, and entertainment - sports goods\n- `CULTURE_SPORTS_ENTERTAINMENT_STATIONERY_TOYS_GIFTS`: Culture, sports, and entertainment - stationery, toys, and gifts\n- `CULTURE_SPORTS_ENTERTAINMENT_OUTDOOR_PRODUCTS`: Culture, sports, and entertainment - outdoor products\n- `CULTURE_SPORTS_ENTERTAINMENT_ART_COLLECTIBLES`: Culture, sports, and entertainment - art collectibles\n- `LIFE_SERVICES_OFFLINE_RETAIL`: Life services - offline retail\n- `LIFE_SERVICES_BEAUTY_HAIR`: Life services - beauty and hair\n- `CATERING_RESTAURANTS`: Catering - restaurants\n- `CATERING_DRINKS_DESSERTS`: Catering - drinks and desserts\n- `BUSINESS_SERVICES`: Business services\n- `EDUCATION_TRAINING_LANGUAGE_STUDY_ABROAD`: Education and training - language and study abroad\n- `EDUCATION_TRAINING_VOCATIONAL_EDUCATION`: Education and training - vocational education\n- `EDUCATION_TRAINING_INTEREST_TRAINING`: Education and training - interest training\n- `EDUCATION_TRAINING_K12_EDUCATION`: Education and training - K-12 education\n- `EDUCATION_TRAINING_DEGREE_EDUCATION`: Education and training - degree education\n- `EDUCATION_TRAINING_CORPORATE_DEVELOPMENT`: Education and training - corporate and team development\n- `EDUCATION_TRAINING_OTHER`: Education and training - other\n- `GAMES`: Games\n- `TRAVEL_TOURISM`: Travel and tourism",
          ),
          [
            "BEAUTY_PERSONAL_CARE_BEAUTY",
            "BEAUTY_PERSONAL_CARE_SKINCARE",
            "BEAUTY_PERSONAL_CARE_PERSONAL_CARE",
            "BEAUTY_PERSONAL_CARE_FRAGRANCE",
            "FOOD_BEVERAGE_SNACKS",
            "FOOD_BEVERAGE_DRINKS",
            "FOOD_BEVERAGE_HEALTH_FOOD",
            "FOOD_BEVERAGE_DAIRY",
            "FOOD_BEVERAGE_ALCOHOL",
            "FOOD_BEVERAGE_GRAINS_OIL",
            "FOOD_BEVERAGE_CROSS_BORDER_FOOD",
            "FOOD_BEVERAGE_FRESH_FOOD",
            "FOOD_BEVERAGE_MEAL_REPLACEMENT",
            "FOOD_BEVERAGE_TRADITIONAL_NOURISHMENT",
            "MOTHER_BABY_SUPPLIES",
            "MOTHER_BABY_FORMULA_FOOD",
            "DIGITAL_APPLIANCES_HOME_APPLIANCES",
            "DIGITAL_APPLIANCES_DIGITAL_PRODUCTS",
            "DAILY_GOODS_HOUSEHOLD_DAILY_USE",
            "DAILY_GOODS_PET_SUPPLIES_FOOD",
            "DAILY_GOODS_OFFICE_SUPPLIES",
            "APPAREL_ACCESSORIES_CLOTHING_SHOES_HATS",
            "APPAREL_ACCESSORIES_JEWELRY",
            "APPAREL_ACCESSORIES_BAGS_GLASSES",
            "APPAREL_ACCESSORIES_SPORTS_OUTDOOR",
            "APPAREL_ACCESSORIES_WATCHES",
            "APPAREL_ACCESSORIES_SECOND_HAND_LUXURY",
            "HOME_BUILDING_MATERIALS_HOME_DECOR",
            "HOME_BUILDING_MATERIALS_FURNITURE",
            "HOME_BUILDING_MATERIALS_MAIN_MATERIALS",
            "AUTOMOTIVE",
            "INTERNET_ECOMMERCE",
            "INTERNET_SOFTWARE_TOOLS",
            "HEALTHCARE_MEDICAL_DEVICES",
            "HEALTHCARE_MEDICAL_BEAUTY",
            "CULTURE_SPORTS_ENTERTAINMENT_SPORTS_GOODS",
            "CULTURE_SPORTS_ENTERTAINMENT_STATIONERY_TOYS_GIFTS",
            "CULTURE_SPORTS_ENTERTAINMENT_OUTDOOR_PRODUCTS",
            "CULTURE_SPORTS_ENTERTAINMENT_ART_COLLECTIBLES",
            "LIFE_SERVICES_OFFLINE_RETAIL",
            "LIFE_SERVICES_BEAUTY_HAIR",
            "CATERING_RESTAURANTS",
            "CATERING_DRINKS_DESSERTS",
            "BUSINESS_SERVICES",
            "EDUCATION_TRAINING_LANGUAGE_STUDY_ABROAD",
            "EDUCATION_TRAINING_VOCATIONAL_EDUCATION",
            "EDUCATION_TRAINING_INTEREST_TRAINING",
            "EDUCATION_TRAINING_K12_EDUCATION",
            "EDUCATION_TRAINING_DEGREE_EDUCATION",
            "EDUCATION_TRAINING_CORPORATE_DEVELOPMENT",
            "EDUCATION_TRAINING_OTHER",
            "GAMES",
            "TRAVEL_TOURISM",
          ],
        ),
        accumCommonImpMedinNum30d: s.string(
          "Daily note exposure median range. Pass two comma-separated numeric bounds; use -1 or null for an open upper bound.",
        ),
        readMidNor30: s.string(
          "Daily note read median range. Pass two comma-separated numeric bounds; use -1 or null for an open upper bound.",
        ),
        interMidNor30: s.string(
          "Daily note interaction median range. Pass two comma-separated numeric bounds; use -1 or null for an open upper bound.",
        ),
        thousandLikePercent30: s.string(
          "Thousand-like note ratio range. Pass fractional ratios such as 0.4,null or percentage values such as 40,null.",
        ),
        notePrice: s.string(
          "Photo-text cooperation quote range. Pass two comma-separated numeric bounds; use -1 or null for an open upper bound.",
        ),
        videoPrice: s.string(
          "Video cooperation quote range. Pass two comma-separated numeric bounds; use -1 or null for an open upper bound.",
        ),
        inviteReply48hNumRatio: s.string(
          "48-hour invite reply ratio range. Pass fractional ratios such as 0.9,0.95 or percentage values such as 90,95.",
        ),
        progressOrderCnt: s.string("Current cooperation order count range. Pass two comma-separated numeric bounds."),
        tradeType: s.string("Recent cooperation industry filter from Pugongying."),
        tradeReportBrandIds: s.string("Recent cooperation brand IDs, separated by English or Chinese commas."),
        excludeTradeReportBrandIds: s.boolean(
          "Whether to exclude creators who cooperated with the selected recent cooperation brands.",
        ),
        accumCoopImpMedinNum30d: s.string(
          "Cooperation note exposure median range. Pass two comma-separated numeric bounds.",
        ),
        readMidCoop30: s.string("Cooperation note read median range. Pass two comma-separated numeric bounds."),
        interMidCoop30: s.string("Cooperation note interaction median range. Pass two comma-separated numeric bounds."),
        mCpuvNum30d: s.string("Cooperation note outer-store median range. Pass two comma-separated numeric bounds."),
        estimatePictureCpm: s.string("Estimated photo-text CPM range. Pass two comma-separated numeric bounds."),
        estimateVideoCpm: s.string("Estimated video CPM range. Pass two comma-separated numeric bounds."),
        estimatePicReadPrice: s.string(
          "Estimated photo-text read unit price range. Pass two comma-separated numeric bounds.",
        ),
        estimateVideoReadPrice: s.string(
          "Estimated video read unit price range. Pass two comma-separated numeric bounds.",
        ),
        estimatePictureEngageCost: s.string(
          "Estimated photo-text engagement unit price range. Pass two comma-separated numeric bounds.",
        ),
        estimateVideoEngageCost: s.string(
          "Estimated video engagement unit price range. Pass two comma-separated numeric bounds.",
        ),
        estimateCpuv30d: s.string(
          "Estimated outer-store visit unit price range. Pass two comma-separated numeric bounds.",
        ),
        kliveCnt30d: s.string("Live count in the last 30 days range. Pass two comma-separated numeric bounds."),
        avgLiveViewerNum: s.string("Average live viewer count range. Pass two comma-separated numeric bounds."),
        avgAgmv90d: s.string("Average live sales amount range. Pass two comma-separated numeric bounds."),
        similarUserId: s.string(
          "Similar creator user ID. `similarUserId` and `similarWord` must be provided together.",
        ),
        similarWord: s.string(
          "Similar creator keyword shown by Pugongying. `similarUserId` and `similarWord` must be provided together.",
        ),
        fansLocation: s.string(
          "Follower audience location filter. Pass Pugongying follower-region labels separated by English or Chinese commas. Country, China province, and city-level paths are supported; district/county-level paths are not accepted. Only paths present in the Pugongying follower-region tree are accepted. Use city paths such as `福建 南平`, `福建-南平`, or `中国 福建 南平`; they are normalized to values like `中国 福建 南平`.\n\nExamples:\n- 福建 南平\n- 中国 福建 南平,广东\n",
        ),
      },
      { required: [] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_creator_profile",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/cooperator/user/blogger/userId/v1",
    authLocation: "query",
    description:
      "Retrieve a Xiaohongshu Pugongying creator profile and cooperation quote information for a known user ID. Use it to review a creator before campaign outreach or pricing comparison.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Creator Profile.",
      {
        userId: s.string("Blogger's user ID.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_data_summary",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/dataV3/dataSummary/v1",
    authLocation: "query",
    description:
      "Retrieve the Xiaohongshu Pugongying data summary for a creator's daily or cooperation notes. Use it to compare aggregate creator performance between business modes.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Data Summary.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
        business: s.withDefault(
          s.withEnum(
            s.string(
              "Business type.\n\nAvailable Values:\n- `DAILY_NOTE`: Daily notes\n- `COOPERATE_NOTE`: Cooperative notes",
            ),
            ["DAILY_NOTE", "COOPERATE_NOTE"],
          ),
          "DAILY_NOTE",
        ),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_follower_growth_history",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/data/userId/fans_overall_new_history/v1",
    authLocation: "query",
    description:
      "Retrieve Xiaohongshu Pugongying follower history for a creator over the selected 30- or 90-day period. Use it to track total followers or new-follower growth over time.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Follower Growth History.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
        dateType: s.withDefault(
          s.withEnum(
            s.string("Time range for data.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"),
            ["DAY_30", "DAY_90"],
          ),
          "DAY_30",
        ),
        increaseType: s.withDefault(
          s.withEnum(
            s.string(
              "Type of growth data.\n\nAvailable Values:\n- `FANS_TOTAL`: Total fans\n- `FANS_INCREASE`: New fans increase",
            ),
            ["FANS_TOTAL", "FANS_INCREASE"],
          ),
          "FANS_TOTAL",
        ),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_follower_summary",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/dataV3/fansSummary/v1",
    authLocation: "query",
    description:
      "Retrieve the Xiaohongshu Pugongying follower summary for a known creator. Use it to review the account's aggregate audience status before deeper demographic or trend analysis.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Follower Summary.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_similar_creators",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/get_similar_kol/v1",
    authLocation: "query",
    description:
      "Retrieve paginated Xiaohongshu Pugongying creators similar to a known creator. Use it to expand a campaign shortlist from an existing reference account.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Similar Creators.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
        pageNum: s.integer("Page number for results.", { default: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_creator_feature_tags",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/dataV2/kolFeatureTags/v1",
    authLocation: "query",
    description:
      "Retrieve Xiaohongshu Pugongying feature tags assigned to a known creator. Use it to understand the creator's recognized formats, styles, or content strengths.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Creator Feature Tags.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_creator_content_tags",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/dataV2/kolContentTags/v1",
    authLocation: "query",
    description:
      "Retrieve Xiaohongshu Pugongying content category tags associated with a known creator. Use it to understand the subjects and categories represented in the creator's published content.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Creator Content Tags.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_note_performance_metrics",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/dataV3/notesRate/v1",
    authLocation: "query",
    description:
      "Retrieve Xiaohongshu Pugongying aggregate note performance metrics for a creator with business, note-type, date-range, and advertisement filters. Use it to compare content performance across selected scopes.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Note Performance Metrics.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
        business: s.withDefault(
          s.withEnum(
            s.string(
              "Business type.\n\nAvailable Values:\n- `DAILY_NOTE`: Daily notes\n- `COOPERATE_NOTE`: Cooperative notes",
            ),
            ["DAILY_NOTE", "COOPERATE_NOTE"],
          ),
          "DAILY_NOTE",
        ),
        noteType: s.withDefault(
          s.withEnum(
            s.string(
              "Type of note.\n\nAvailable Values:\n- `PHOTO_TEXT_AND_VIDEO`: Photo and Video\n- `PHOTO_TEXT`: Photo and Text\n- `VIDEO`: Video only",
            ),
            ["PHOTO_TEXT_AND_VIDEO", "PHOTO_TEXT", "VIDEO"],
          ),
          "PHOTO_TEXT_AND_VIDEO",
        ),
        dateType: s.withDefault(
          s.withEnum(
            s.string("Time range for data.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"),
            ["DAY_30", "DAY_90"],
          ),
          "DAY_30",
        ),
        advertiseSwitch: s.withDefault(
          s.withEnum(
            s.string(
              "Advertisement filter.\n\nAvailable Values:\n- `ALL`: All notes\n- `ORGANIC_ONLY`: Organic notes only",
            ),
            ["ALL", "ORGANIC_ONLY"],
          ),
          "ALL",
        ),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_follower_distribution",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/data/userId/fans_profile/v1",
    authLocation: "query",
    description:
      "Retrieves Xiaohongshu Pugongying follower profile data for a known creator. Use it to review a creator's audience profile during campaign planning.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Follower Distribution.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_cost_effectiveness_analysis",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/dataV2/costEffective/v1",
    authLocation: "query",
    description:
      "Retrieve the Xiaohongshu Pugongying cost-effectiveness analysis for a known creator. Use it to assess cooperation efficiency when comparing creators for a campaign.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Cost Effectiveness Analysis.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_note_details",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/note/noteId/detail/v1",
    authLocation: "query",
    description:
      "Retrieves Xiaohongshu Pugongying details for a known note ID. Use it to review an individual note during creator or campaign research.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Note Details.",
      {
        noteId: s.string("Note's unique ID.", { minLength: 1 }),
      },
      { required: ["noteId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_creator_core_metrics",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/pgy/kol/data/core_data/v1",
    authLocation: "query",
    description:
      "Retrieves Xiaohongshu Pugongying core data for a creator with business, note-type, date-range, and advertisement filters. Use it to compare creators within a selected analysis scope.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Creator Core Metrics.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
        business: s.withDefault(
          s.withEnum(
            s.string(
              "Business type.\n\nAvailable Values:\n- `DAILY_NOTE`: Daily notes\n- `COOPERATE_NOTE`: Cooperative notes",
            ),
            ["DAILY_NOTE", "COOPERATE_NOTE"],
          ),
          "DAILY_NOTE",
        ),
        noteType: s.withDefault(
          s.withEnum(
            s.string(
              "Type of note.\n\nAvailable Values:\n- `PHOTO_TEXT_AND_VIDEO`: Photo and Video\n- `PHOTO_TEXT`: Photo and Text\n- `VIDEO`: Video only",
            ),
            ["PHOTO_TEXT_AND_VIDEO", "PHOTO_TEXT", "VIDEO"],
          ),
          "PHOTO_TEXT_AND_VIDEO",
        ),
        dateType: s.withDefault(
          s.withEnum(
            s.string("Time range for data.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"),
            ["DAY_30", "DAY_90"],
          ),
          "DAY_30",
        ),
        advertiseSwitch: s.withDefault(
          s.withEnum(
            s.string(
              "Advertisement filter.\n\nAvailable Values:\n- `ALL`: All notes\n- `ORGANIC_ONLY`: Organic notes only",
            ),
            ["ALL", "ORGANIC_ONLY"],
          ),
          "ALL",
        ),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_content_square_notes",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/pgy/content_square/search_note_v2/v1",
    authLocation: "query",
    description:
      "Search Xiaohongshu Pugongying Content Square notes by keyword or browse all notes, with business-category, ranking, time-window, and page controls. Use it to discover high-performing campaign content.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Content Square Notes.",
      {
        searchWord: s.string("Keyword for note search. Empty string searches all notes.", {
          default: "",
        }),
        pageNum: s.integer("Page number for results.", { default: 1 }),
        bizType: s.withDefault(
          s.withEnum(
            s.string(
              "Business category.\n\nAvailable Values:\n- `XIAOHONGSHU_HOT`: Xiaohongshu hot\n- `PRODUCT_SEEDING`: Product seeding\n- `ECOMMERCE_PROMOTION`: E-commerce promotion\n- `PUGONGYING_COOPERATION`: Pugongying cooperation\n- `LEAD_COLLECTION`: Lead collection\n- `ECOMMERCE_HOT`: E-commerce hot\n- `SEEDING_DIRECT`: Seeding direct\n- `APP_PROMOTION`: App promotion",
            ),
            [
              "XIAOHONGSHU_HOT",
              "PRODUCT_SEEDING",
              "ECOMMERCE_PROMOTION",
              "PUGONGYING_COOPERATION",
              "LEAD_COLLECTION",
              "ECOMMERCE_HOT",
              "SEEDING_DIRECT",
              "APP_PROMOTION",
            ],
          ),
          "XIAOHONGSHU_HOT",
        ),
        orderBy: s.withDefault(
          s.withEnum(
            s.string(
              "Ranking metric.\n\nAvailable Values:\n- `premium_imp_num`: Exposure\n- `premium_good_read_rate`: Read rate\n- `premium_read_num`: Read count\n- `premium_engage_num`: Engagement count\n- `premium_engage_rate`: Engagement rate\n- `premium_like_num`: Like count\n- `premium_fav_num`: Favorite count\n- `premium_cmt_num`: Comment count",
            ),
            [
              "premium_imp_num",
              "premium_good_read_rate",
              "premium_read_num",
              "premium_engage_num",
              "premium_engage_rate",
              "premium_like_num",
              "premium_fav_num",
              "premium_cmt_num",
            ],
          ),
          "premium_imp_num",
        ),
        nd: s.withDefault(
          s.withEnum(
            s.string(
              "Time range in days.\n\nAvailable Values:\n- `DAY_3`: Last 3 days\n- `DAY_7`: Last 7 days\n- `DAY_14`: Last 14 days\n- `DAY_30`: Last 30 days",
            ),
            ["DAY_3", "DAY_7", "DAY_14", "DAY_30"],
          ),
          "DAY_7",
        ),
      },
      { required: [] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_creator_note_list",
    method: "GET",
    path: "/api/xiaohongshu-pgy/api/solar/kol/dataV2/notesDetail/v1",
    authLocation: "query",
    description:
      "Retrieve a paginated Xiaohongshu Pugongying creator note list with advertisement, sort-order, note-type, and third-platform filters. Use it to browse selected content from a known creator.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Creator Note List.",
      {
        userId: s.string("KOL's user ID.", { minLength: 1 }),
        advertiseSwitch: s.withDefault(
          s.withEnum(
            s.string(
              "Advertisement filter.\n\nAvailable Values:\n- `ALL`: All notes\n- `ORGANIC_ONLY`: Organic notes only",
            ),
            ["ALL", "ORGANIC_ONLY"],
          ),
          "ALL",
        ),
        orderType: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting order.\n\nAvailable Values:\n- `LATEST`: Latest\n- `MOST_READ`: Most read\n- `MOST_INTERACT`: Most interactions",
            ),
            ["LATEST", "MOST_READ", "MOST_INTERACT"],
          ),
          "LATEST",
        ),
        noteType: s.withDefault(
          s.withEnum(
            s.string(
              "Type of note.\n\nAvailable Values:\n- `ALL`: All types\n- `COOPERATION`: Cooperation notes\n- `PHOTO_TEXT`: Photo and Text\n- `VIDEO`: Video only",
            ),
            ["ALL", "COOPERATION", "PHOTO_TEXT", "VIDEO"],
          ),
          "ALL",
        ),
        isThirdPlatform: s.withDefault(
          s.withEnum(s.string("Whether from third-party platform.\n\nAvailable Values:\n- `NO`: No\n- `YES`: Yes"), [
            "NO",
            "YES",
          ]),
          "NO",
        ),
        pageNumber: s.integer("Page number.", { default: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_creator_marketplace_pugongying_creator_note_list_pro",
    method: "GET",
    path: "/api/xiaohongshu-pgy/get-kol-note-list/v1",
    authLocation: "query",
    description:
      "Retrieve a paginated Xiaohongshu Pugongying creator note list with advertisement, sort-order, and note-type controls. Use it to browse a creator's recent, most-read, or most-interacted notes.",
    inputSchema: s.object(
      "Input for Xiaohongshu Creator Marketplace (Pugongying) Creator Note List Pro.",
      {
        kolId: s.string("KOL ID.", { minLength: 1 }),
        page: s.integer("Page number.", { default: 1 }),
        adSwitch: s.withEnum(
          s.string(
            "Ad filter.\n\nAvailable Values:\n- `_1`: Full traffic (All notes)\n- `_0`: Natural traffic (Organic notes)",
            { minLength: 1 },
          ),
          ["_1", "_0"],
        ),
        orderType: s.withEnum(
          s.string(
            "Sorting order.\n\nAvailable Values:\n- `_1`: Latest\n- `_2`: Most read\n- `_3`: Most interactions",
            { minLength: 1 },
          ),
          ["_1", "_2", "_3"],
        ),
        noteType: s.withDefault(
          s.withEnum(
            s.string(
              "Note type.\n\nAvailable Values:\n- `_1`: Photo and Text notes\n- `_2`: Video notes\n- `_3`: Cooperation notes\n- `_4`: All types",
            ),
            ["_1", "_2", "_3", "_4"],
          ),
          "_4",
        ),
      },
      { required: ["kolId", "adSwitch", "orderType"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_search",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/gsearch/search_for_author_square/v1",
    authLocation: "query",
    description:
      "Searches Douyin Creator Marketplace (Xingtu) creators by keyword and structured filters for audience, pricing, content, performance, and campaign fit. Use it to build and compare campaign shortlists.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Search.",
      {
        keyword: s.string("Search keyword.", { default: "" }),
        page: s.integer("Page number for pagination.", { default: 1 }),
        sort: s.withDefault(
          s.withEnum(
            s.string(
              "Creator search sorting. Values: FANS sorts by follower count descending, DEFAULT uses Xingtu score ranking.\n\nAvailable Values:\n- `DEFAULT`: Platform default score ranking\n- `FANS`: Sort by follower count descending",
            ),
            ["DEFAULT", "FANS"],
          ),
          "FANS",
        ),
        searchType: s.withDefault(
          s.withEnum(
            s.string("Search criteria type.\n\nAvailable Values:\n- `NICKNAME`: By Nickname\n- `CONTENT`: By Content"),
            ["NICKNAME", "CONTENT"],
          ),
          "NICKNAME",
        ),
        marketingTarget: s.withEnum(
          s.string(
            "Marketing goal. Available values: BRAND_EXPOSURE/1/品牌曝光, CIRCLE_SEEDING/2/破圈种草, ACTION_CONVERSION/3/行动转化.\n\nAvailable Values:\n- `BRAND_EXPOSURE`: Brand exposure\n- `CIRCLE_SEEDING`: Out-of-circle seeding\n- `ACTION_CONVERSION`: Action conversion",
          ),
          ["BRAND_EXPOSURE", "CIRCLE_SEEDING", "ACTION_CONVERSION"],
        ),
        industry: s.withDefault(
          s.withEnum(
            s.string(
              "Recommended industry filter. Pass enum name, numeric industry ID, or Chinese industry label. Available values: - ALL/0/不限; - 1901: 3C及电器; - 1938: 购物; - 1903: 食品饮料; - 1904: 服装配饰; - 1905: 医药健康; - 1936: 医疗机构; - 1909: 家居建材; - 1907: 生活服务; - 1906: 商务服务; - 1921: 休闲娱乐; - 1937: 丽人; - 1908: 房地产; - 1910: 教育培训; - 1911: 出行旅游; - 1912: 社会公共; - 1913: 游戏; - 1914: 互联网电商服务; - 1915: 交通工具; - 1916: 汽车; - 1917: 农资园艺; - 1920: 机械设备; - 1939: 文化用品; - 1940: 运动户外; - 1922: 传媒资讯; - 1924: 通信; - 1925: 金融业; - 1927: 餐饮服务; - 1928: 工具类软件; - 1929: 招商加盟; - 1930: 美妆; - 1931: 母婴宠物; - 1933: 日化; - 1934: 实体书籍; - 1935: 社交通讯.\n\nAvailable Values:\n- `ALL`: All\n- `ELECTRONICS_AND_APPLIANCES`: Electronics and Appliances\n- `SHOPPING`: Shopping\n- `FOOD_AND_BEVERAGE`: Food and Beverage\n- `CLOTHING_AND_ACCESSORIES`: Clothing and Accessories\n- `HEALTHCARE_AND_MEDICAL`: Healthcare and Medical\n- `MEDICAL_INSTITUTIONS`: Medical Institutions\n- `HOME_AND_BUILDING_MATERIALS`: Home and Building Materials\n- `LOCAL_SERVICES`: Local Services\n- `BUSINESS_SERVICES`: Business Services\n- `CULTURE_SPORTS_ENTERTAINMENT`: Leisure and Entertainment\n- `BEAUTY_SERVICES`: Beauty Services\n- `REAL_ESTATE`: Real Estate\n- `EDUCATION_AND_TRAINING`: Education and Training\n- `TRAVEL_AND_TOURISM`: Travel and Tourism\n- `PUBLIC_SERVICES`: Public Services\n- `GAMES`: Games\n- `RETAIL`: Internet E-commerce Services\n- `TRANSPORTATION_EQUIPMENT`: Transportation Equipment\n- `AUTOMOTIVE`: Automotive\n- `AGRICULTURE_FORESTRY_FISHERY`: Agriculture Forestry Fishery\n- `CHEMICAL_AND_ENERGY`: Chemical and Energy\n- `ELECTRONICS_AND_ELECTRICAL`: Electronics and Electrical\n- `MACHINERY_EQUIPMENT`: Machinery Equipment\n- `MEDIA_AND_INFORMATION`: Media and Information\n- `LOGISTICS`: Logistics\n- `TELECOMMUNICATIONS`: Telecommunications\n- `FINANCIAL_SERVICES`: Financial Services\n- `CATERING_SERVICES`: Catering Services\n- `SOFTWARE_TOOLS`: Software Tools\n- `FRANCHISING_AND_INVESTMENT`: Franchising and Investment\n- `BEAUTY_AND_COSMETICS`: Beauty and Cosmetics\n- `MOTHER_BABY_AND_PET`: Mother Baby and Pet\n- `DAILY_CHEMICALS`: Daily Chemicals\n- `PHYSICAL_BOOKS`: Physical Books\n- `SOCIAL_AND_COMMUNICATION`: Social and Communication\n- `CULTURAL_SUPPLIES`: Cultural Supplies\n- `SPORTS_OUTDOOR`: Sports and Outdoors",
            ),
            [
              "ALL",
              "ELECTRONICS_AND_APPLIANCES",
              "SHOPPING",
              "FOOD_AND_BEVERAGE",
              "CLOTHING_AND_ACCESSORIES",
              "HEALTHCARE_AND_MEDICAL",
              "MEDICAL_INSTITUTIONS",
              "HOME_AND_BUILDING_MATERIALS",
              "LOCAL_SERVICES",
              "BUSINESS_SERVICES",
              "CULTURE_SPORTS_ENTERTAINMENT",
              "BEAUTY_SERVICES",
              "REAL_ESTATE",
              "EDUCATION_AND_TRAINING",
              "TRAVEL_AND_TOURISM",
              "PUBLIC_SERVICES",
              "GAMES",
              "RETAIL",
              "TRANSPORTATION_EQUIPMENT",
              "AUTOMOTIVE",
              "AGRICULTURE_FORESTRY_FISHERY",
              "CHEMICAL_AND_ENERGY",
              "ELECTRONICS_AND_ELECTRICAL",
              "MACHINERY_EQUIPMENT",
              "MEDIA_AND_INFORMATION",
              "LOGISTICS",
              "TELECOMMUNICATIONS",
              "FINANCIAL_SERVICES",
              "CATERING_SERVICES",
              "SOFTWARE_TOOLS",
              "FRANCHISING_AND_INVESTMENT",
              "BEAUTY_AND_COSMETICS",
              "MOTHER_BABY_AND_PET",
              "DAILY_CHEMICALS",
              "PHYSICAL_BOOKS",
              "SOCIAL_AND_COMMUNICATION",
              "CULTURAL_SUPPLIES",
              "SPORTS_OUTDOOR",
            ],
          ),
          "ALL",
        ),
        isSuperstar: s.boolean({
          description: "Whether to filter celebrity creators.",
          default: false,
        }),
        followerRange: s.string(
          "Raw follower count range in min-max format. Example: 1000-2000 means 1,000 to 2,000 followers; 5000000-10000000 means 5 million to 10 million followers.",
        ),
        kolPriceType: s.withEnum(
          s.string(
            "Creator quote type from the current Xingtu marketplace options.\n\nAvailable Values:\n- `PRODUCT_PLACEMENT_VIDEO`: Product-placement video\n- `CUSTOM_VIDEO`: Custom video\n- `CUSTOM_SHORT_DRAMA_EPISODE`: Mini-drama episode\n- `NATURAL_PLAY_CPM`: CPM naturally\n- `SHORT_LIVE_SEEDING_VIDEO`: Short-live seeding video\n- `SHORT_LIVE_WARMUP_VIDEO`: Short-live warm-up video\n- `CELEBRITY_SHORT_LIVE_SEEDING`: Celebrity short-live seeding\n- `CELEBRITY_SHORT_LIVE_WARMUP`: Celebrity short-live warm-up\n- `CELEBRITY_VIDEO`: Celebrity video\n- `COLLECTION_VIDEO`: Collection video\n- `DOUYIN_SHORT_VIDEO_CO_CREATION_MAIN_CREATOR`: Douyin short video co-creation - main creator\n- `DOUYIN_SHORT_VIDEO_CO_CREATION_PARTICIPANT`: Douyin short video co-creation - participant",
          ),
          [
            "PRODUCT_PLACEMENT_VIDEO",
            "CUSTOM_VIDEO",
            "CUSTOM_SHORT_DRAMA_EPISODE",
            "NATURAL_PLAY_CPM",
            "SHORT_LIVE_SEEDING_VIDEO",
            "SHORT_LIVE_WARMUP_VIDEO",
            "CELEBRITY_SHORT_LIVE_SEEDING",
            "CELEBRITY_SHORT_LIVE_WARMUP",
            "CELEBRITY_VIDEO",
            "COLLECTION_VIDEO",
            "DOUYIN_SHORT_VIDEO_CO_CREATION_MAIN_CREATOR",
            "DOUYIN_SHORT_VIDEO_CO_CREATION_PARTICIPANT",
          ],
        ),
        kolPriceRange: s.string(
          "Creator quote range in min-max format (e.g., 10000-50000). Requires kolPriceType; omit kolPriceRange to use the full range for the selected quote type.",
        ),
        contentTag: s.string(
          "Creator category filter. Pass Xingtu first-level or second-level category labels separated by commas. Available values: - 美妆: 美妆教程, 妆容展示, 护肤保养, 美妆测评种草; - 时尚: 穿搭, 街拍, 造型, 时尚媒体; - 萌宠: 日常宠物, 特别宠物, 宠物周边; - 测评: 美妆测评, 3C数码测评, 汽车测评, 美食产品测评, 母婴产品测评, 综合测评, 酒店测评; - 游戏: 游戏剧情, 游戏解说, 游戏资讯, 游戏其他, 游戏录屏, 游戏集锦; - 二次元: 二次元真人, 动画漫画, 配音声优, 宅物手办; - 旅行: 旅行记录, 旅行攻略, 旅行推荐, 户外生活; - 汽车: 汽车测评, 汽车知识, 汽车周边; - 生活: 生活记录, 生活小窍门, 好物推荐, 健康养生, 婚恋; - 音乐: 歌曲演唱, 乐器演奏, 音乐教学, 音乐其他, 音乐剪辑; - 舞蹈; - 美食: 美食教程, 美食探店, 美食产品测评, 乡村野食, 美食其他, 酒类; - 母婴亲子: 育儿科普, 萌娃日常, 亲子互动, 测评种草; - 运动健身: 健身, 极限运动, 体育资讯, 冰雪, 垂钓, 格斗, 球类项目, 综合体育; - 科技数码: 3C数码, 家居电器, 科技; - 教育培训: 考学培训, 语言教学, 个人管理, 职业教育; - 颜值达人: 美女, 帅哥; - 生活家居: 硬装, 软装, 生活技巧, 家居氛围; - 才艺技能: 创意才能, 手工, 摄影, 绘画, 其他才艺; - 影视娱乐: 影视解说, 影视混剪, 明星资讯, 综艺解说, 综艺混剪; - 艺术文化: 传统文化, 人文科普, 自然科学; - 财经投资: 传统金融, 互联网金融, 财经知识; - 三农; - 剧情搞笑: 剧情, 搞笑; - 情感; - 园艺; - 房产: 其他房产, 房产知识, 房产及投资, 楼盘评测, 楼市资讯, 租房; - 随拍; - 媒体号. Example: 美妆,穿搭,剧情搞笑",
        ),
        contentTheme: s.string(
          "Content theme filter. Pass Xingtu second-level content theme labels separated by commas. Only labels listed after each colon are accepted; category headings before the colons are descriptive only and must not be passed. Available values include: - 妆容妆造: 淡妆教程, 变装造型, 韩系妆容, 甜美妆容, 清透妆容, 复古妆容, 男性妆容; - 穿搭指南: 日常穿搭, 简约气质穿搭, 国风穿搭, 运动穿搭, 通勤穿搭, 旅行穿搭, 职业穿搭, 约会穿搭; - 亲子育儿: 亲子活动, 亲子沟通, 学前训练, 新手爸妈指导, 儿童护理, 宝宝辅食, 奶粉测评, 孕产饮食; - 美食教程与测评: 地方美食, 家常菜谱, 美食探店, 零食测评, 酒水品鉴, 厨房用品, 海鲜烹饪, 减脂美食; - 精彩车生活: 汽车行业资讯, 用车知识, 车辆保养, 自驾旅行, 新能源汽车资讯, 汽车用品测评, SUV测评; - 手机/数码/家电分享: 科技科普, 电子产品测评, 家电推荐, 手机评测, 智能家居, AI应用, 数码开箱; - 剧情演绎: 搞笑剧情, 剧情反转, 情感演绎, 家庭幽默演绎, 职场趣闻, 古风剧情, 生存挑战; - 萌宠养护: 宠物狗故事, 动物萌态, 宠物养护, 猫咪萌态, 宠物健康, 宠物护理, 宠物救助; - 旅行攻略: 国内旅行, 海外旅行, 城市旅行攻略, 酒店体验, 露营体验, 亲子旅行, 网红景点种草; - 家居好物: 清洁技巧, 生活好物评测, 家居选购, 家居装修, 家居收纳, 家装避坑, 房间布置; - 运动户外: 户外运动, 健身塑形, 赛事回顾, 体重管理, 极限运动, 跑步健身, 户外露营. Example: 亲子活动,宝宝辅食",
        ),
        personaTag: s.string(
          "Creator persona or background labels. Pass Xingtu labels or numeric tag IDs separated by commas. Available values: - 人群属性: Z世代, 新锐白领, 精致妈妈, 都市蓝领, 资深中产, 小镇青年, 小镇中老年, 都市银发; - 社会身份: 音乐人, 非遗传人, 画家; - 主要出镜人物: 海外华人, 外国友人, 情侣, 夫妻, 家庭, 朋友, 同事, 亲子, 个人; - 肤质肤色: 混油皮, 干皮, 油皮, 敏感肌, 痘痘肌, 黄皮, 白皮, 瑕疵皮; - 皮肤养护: 美白, 抗老, 祛皱, 抗炎, 修复, 控油, 眼部护理, 补水保湿, 祛斑, 祛痘祛闭口, 隔离防晒; - 母婴阶段: 孕期, 0-6月, 7-12月, 1-3岁, 3-6岁, 6-12岁, 12-15岁, 15-18岁; - 爱好: 摄影, 时尚穿搭, 美食制作, 科普, 星座, 绘画; - 职业: 法律从业者, 航空业从业者, 健身/舞蹈教练, 专业美食从业者, 室内设计师; - 学历: 大学生, 硕士生, 博士, 留学生; - 黄v认证: 美妆创作者, 体育创作者, 媒体人/主持人, 科技创作者, 运动员; - Other labels: 潮流运动, 球类, 非球类, 室内健身, 城市运动, 户外运动, 数码潮流玩家, 户外爱好者, 室内设计师, 品酒家/调酒师, 美食评论人, 母婴行业专家, 奶爸, 旧屋改造, 装修设计, 收纳, 新生儿妈妈, 孕妈, 时尚妈妈, 二三胎妈妈, 西餐, 火锅, 国风爱好者, 成分党. Example: 大学生,美妆创作者",
        ),
        gender: s.withEnum(
          s.string(
            "Creator gender. Available values: MALE/1/男性, FEMALE/2/女性.\n\nAvailable Values:\n- `MALE`: Male\n- `FEMALE`: Female",
          ),
          ["MALE", "FEMALE"],
        ),
        location: s.string(
          "Creator location filter. Pass Chinese province or city names separated by commas. Available province values include: 北京市, 天津市, 河北省, 山西省, 内蒙古自治区, 辽宁省, 吉林省, 黑龙江省, 上海市, 江苏省, 浙江省, 安徽省, 福建省, 江西省, 山东省, 河南省, 湖北省, 湖南省, 广东省, 广西壮族自治区, 海南省, 重庆市, 四川省, 贵州省, 云南省, 西藏自治区, 陕西省, 甘肃省, 青海省, 宁夏回族自治区, 新疆维吾尔自治区, 台湾省, 香港特别行政区, 澳门特别行政区. Example: 广东省,深圳市",
        ),
        tonalityTag: s.string(
          "Creator tonality labels. Pass Xingtu first-level or second-level tonality labels separated by commas. Available values: - 身份/爱好: 马术, 高尔夫, 橄榄球, 时尚爱好者, 企业高管, 汽车爱好者, 学者专家, 古玩收藏; - 精致达人: 设计师, 高阶潮玩, 职业模特, 造型顾问, 独立设计师, 美术/画廊/展览, 歌剧舞台剧, 流行, 潮流买手, 电影; - 潮流酷: 冲浪, 浮潜, 说唱, 滑雪, 普拉提, 网球. Example: 精致达人,设计师",
        ),
        connectedUserRange: s.string(
          "Connected user count range. Pass raw user counts in min-max format. Example: 1000000-3000000",
        ),
        audienceImage: s.string(
          "Audience profile filter from Xingtu Audience Image. Pass one or more shortcut values separated by commas. Only the values listed below are accepted. For gender thresholds, pass at most one GENDER_MALE_* value and at most one GENDER_FEMALE_* value. Available values: - Gender: GENDER_MALE_50, GENDER_MALE_60, GENDER_MALE_70, GENDER_MALE_80, GENDER_FEMALE_50, GENDER_FEMALE_60, GENDER_FEMALE_70, GENDER_FEMALE_80; - Age: AGE_18_23, AGE_24_30, AGE_31_40, AGE_41_50, AGE_GT_50; - Device: DEVICE_IPHONE, DEVICE_HUAWEI, DEVICE_XIAOMI, DEVICE_VIVO, DEVICE_OPPO; - City tier: CITY_TIER_1, CITY_TIER_2, CITY_TIER_3, CITY_TIER_4, CITY_TIER_5; - Average order amount: SPEND_0_50, SPEND_50_100, SPEND_100_200, SPEND_200_500, SPEND_GT_500; - Crowd profile: CROWD_REFINED_MOTHER(53 精致妈妈), CROWD_URBAN_SILVER(54 都市银发), CROWD_NEW_WHITE_COLLAR(55 新锐白领), CROWD_SENIOR_MIDDLE_CLASS(56 资深中产), CROWD_URBAN_BLUE_COLLAR(57 都市蓝领), CROWD_GEN_Z(58 Z世代), CROWD_TOWN_MIDDLE_AGED(59 小镇中老年), CROWD_TOWN_YOUTH(60 小镇青年). Numeric IDs and Chinese labels in parentheses are for reference only and are not accepted as input values. Example: GENDER_FEMALE_50,CROWD_REFINED_MOTHER",
        ),
        fansImage: s.string(
          "Fan profile filter from Xingtu Fan Image. Pass one or more shortcut values separated by commas. Only the values listed below are accepted. For gender thresholds, pass at most one GENDER_MALE_* value and at most one GENDER_FEMALE_* value. Available values: - Gender: GENDER_MALE_50, GENDER_MALE_60, GENDER_MALE_70, GENDER_MALE_80, GENDER_FEMALE_50, GENDER_FEMALE_60, GENDER_FEMALE_70, GENDER_FEMALE_80; - Age: AGE_18_23, AGE_24_30, AGE_31_40, AGE_41_50, AGE_GT_50; - Device: DEVICE_IPHONE, DEVICE_HUAWEI, DEVICE_XIAOMI, DEVICE_VIVO, DEVICE_OPPO; - City tier: CITY_TIER_1, CITY_TIER_2, CITY_TIER_3, CITY_TIER_4, CITY_TIER_5; - Average order amount: SPEND_0_50, SPEND_50_100, SPEND_100_200, SPEND_200_500, SPEND_GT_500; - Crowd profile: CROWD_REFINED_MOTHER(53 精致妈妈), CROWD_URBAN_SILVER(54 都市银发), CROWD_NEW_WHITE_COLLAR(55 新锐白领), CROWD_SENIOR_MIDDLE_CLASS(56 资深中产), CROWD_URBAN_BLUE_COLLAR(57 都市蓝领), CROWD_GEN_Z(58 Z世代), CROWD_TOWN_MIDDLE_AGED(59 小镇中老年), CROWD_TOWN_YOUTH(60 小镇青年). Numeric IDs and Chinese labels in parentheses are for reference only and are not accepted as input values. Example: GENDER_FEMALE_50,CROWD_REFINED_MOTHER",
        ),
        expectedPlayRange: s.string(
          "Expected play count range. Use raw counts in min-max format. Page presets include 10000000 or above, 5000000-10000000, 3000000-5000000, 1000000-3000000, 100000-1000000, and 0-100000. For open-ended presets, pass a high upper bound such as 10000000-1000000000. Example: 1000000-3000000.",
        ),
        expectedCpmRange: s.string(
          "Expected CPM range in min-max format. Example values matching Xingtu packs: 0-10, 0-20, 0-30, 0-50, 0-100, 100-1000000.",
        ),
        expectedCpeRange: s.string(
          "Expected CPE range in min-max format. Example values matching Xingtu packs: 0-1, 0-2, 0-3, 0-5, 0-10, 10-1000000.",
        ),
        interactionRateRange: s.string(
          "Interaction rate range in decimal min-max format. Example values: 0.01-1 for 1% or above, 0.02-1 for 2% or above.",
        ),
        completionRateRange: s.string(
          "Completion rate range in decimal min-max format. Example values: 0.1-1 for 10% or above, 0.2-1 for 20% or above.",
        ),
        viralRateRange: s.string(
          "Viral content rate range in decimal min-max format. Page presets include 0-0.1, 0.1-0.25, 0.25-0.5, 0.5-0.99, and 0.99 or above. For open-ended presets, pass a high upper bound such as 0.99-1. Example: 0.1-0.25.",
        ),
        progressTaskRange: s.string(
          "In-progress task count range. Place a colon between the day count and the min-max range; omit either bound for an open range. Example: 30:8-",
        ),
        isCuratedAuthor: s.boolean({
          description: "Whether to include only Xingtu curated creators under Topic Recommendations.",
          default: false,
        }),
        authorList: s.withEnum(
          s.string(
            "Activity-curated creator list under Xingtu Topic Recommendations. Select at most one value. Pass an enum name, numeric list ID, or Chinese label. Available values: SHORT_LIVE_ENTERTAINMENT_CREATORS/7540478044453486642/短直联动娱播达人; SHORT_DRAMA_ACTORS/7591708652957155378/短剧演员; WECHAT_QUICK_CONNECT_CREATORS/7644854622347100210/企微可快速建联达人; AI_STAR_PLAN_CREATORS/7658250094571814938/AI星企划达人; COMMERCE_ADVANTAGE_CREATORS/7648906835038568499/带货优势达人; HIGH_VALUE_CREATORS/7656639212045516826/高性价比达人; SEEDING_ADVANTAGE_CREATORS/7663404694186033202/种草优势达人; BASKETBALL_CREATORS/7501674900550238234/运动圈层达人-篮球; PREMIUM_CONTENT_MEDIA/7586629331582222374/精品内容型媒体推荐; TREND_SETTING_MEDIA/7586616213569781769/趋势造风型媒体推荐; FACTORY_TRACEABILITY_MEDIA/7586616269403832370/探厂溯源型媒体推荐; RUNNING_CREATORS/7501675026170281994/运动圈层达人-跑步; LIGHT_OUTDOOR_CREATORS/7501674458878181413/运动圈层达人-轻户外; FITNESS_CREATORS/7501674307430236197/运动圈层达人-运动健身; YOGA_CREATORS/7501678481074929674/运动圈层达人-瑜伽; STREET_SPORTS_CREATORS/7501677564604383259/运动圈层达人-街头运动; CYCLING_CREATORS/7501677556094042149/运动圈层达人-骑行; FOOTBALL_CREATORS/7501674900550483994/运动圈层达人-足球; FISHING_CREATORS/7501676465915215881/运动圈层达人-垂钓; BEAUTY_QUALITY_CREATORS/7460387606572875826/美妆质感达人.\n\nAvailable Values:\n- `SHORT_LIVE_ENTERTAINMENT_CREATORS`: Short-video and livestream entertainment creators\n- `SHORT_DRAMA_ACTORS`: Short-drama actors\n- `WECHAT_QUICK_CONNECT_CREATORS`: Creators available for fast WeChat Work contact\n- `AI_STAR_PLAN_CREATORS`: AI Star Plan creators\n- `COMMERCE_ADVANTAGE_CREATORS`: Creators with commerce conversion advantages\n- `HIGH_VALUE_CREATORS`: High-value creators\n- `SEEDING_ADVANTAGE_CREATORS`: Creators with product-seeding advantages\n- `BASKETBALL_CREATORS`: Basketball creators\n- `PREMIUM_CONTENT_MEDIA`: Premium-content media recommendations\n- `TREND_SETTING_MEDIA`: Trend-setting media recommendations\n- `FACTORY_TRACEABILITY_MEDIA`: Factory and product-origin media recommendations\n- `RUNNING_CREATORS`: Running creators\n- `LIGHT_OUTDOOR_CREATORS`: Light-outdoor creators\n- `FITNESS_CREATORS`: Exercise and fitness creators\n- `YOGA_CREATORS`: Yoga creators\n- `STREET_SPORTS_CREATORS`: Street-sports creators\n- `CYCLING_CREATORS`: Cycling creators\n- `FOOTBALL_CREATORS`: Football creators\n- `FISHING_CREATORS`: Fishing creators\n- `BEAUTY_QUALITY_CREATORS`: Beauty creators with premium visual quality",
          ),
          [
            "SHORT_LIVE_ENTERTAINMENT_CREATORS",
            "SHORT_DRAMA_ACTORS",
            "WECHAT_QUICK_CONNECT_CREATORS",
            "AI_STAR_PLAN_CREATORS",
            "COMMERCE_ADVANTAGE_CREATORS",
            "HIGH_VALUE_CREATORS",
            "SEEDING_ADVANTAGE_CREATORS",
            "BASKETBALL_CREATORS",
            "PREMIUM_CONTENT_MEDIA",
            "TREND_SETTING_MEDIA",
            "FACTORY_TRACEABILITY_MEDIA",
            "RUNNING_CREATORS",
            "LIGHT_OUTDOOR_CREATORS",
            "FITNESS_CREATORS",
            "YOGA_CREATORS",
            "STREET_SPORTS_CREATORS",
            "CYCLING_CREATORS",
            "FOOTBALL_CREATORS",
            "FISHING_CREATORS",
            "BEAUTY_QUALITY_CREATORS",
          ],
        ),
      },
      { required: [] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_profile",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/author/get_author_base_info/v1",
    authLocation: "query",
    description:
      "Returns the Douyin Creator Marketplace (Xingtu) profile for a specified creator and content channel. Use it to review creator information before shortlisting or campaign outreach.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Profile.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_link_structure",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/author_link_struct/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) creator-link structure data for a specified creator and content channel. Use it to compare creator link structures during performance research.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Link Structure.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_visibility_status",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/check_author_display/v1",
    authLocation: "query",
    description:
      "Returns whether a specified creator can be displayed in Douyin Creator Marketplace (Xingtu) for the selected content channel. Use it to check creator availability before building a campaign shortlist.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Visibility Status.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_channel_metrics",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/author/get_author_platform_channel_info_v2/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) channel information for a specified creator and content format. Use it to compare a creator's short-video, live, image-text, or short-drama presence.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Channel Metrics.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_order_experience",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_order_experience/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) creator order-experience information for the last 30 or 90 days. Use it to review marketplace order history during creator evaluation.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Order Experience.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        period: s.withDefault(
          s.withEnum(
            s.string("Time period.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"),
            ["DAY_30", "DAY_90"],
          ),
          "DAY_30",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_link_metrics",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/get_author_link_info/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) creator-link metrics for a specified creator, content channel, and industry category. Use it to review creator link information in an industry context.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Link Metrics.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
        industryTag: s.withDefault(
          s.withEnum(
            s.string(
              "Industry tag.\n\nAvailable Values:\n- `ALL`: All\n- `ELECTRONICS_AND_APPLIANCES`: Electronics and Appliances\n- `SHOPPING`: Shopping\n- `FOOD_AND_BEVERAGE`: Food and Beverage\n- `CLOTHING_AND_ACCESSORIES`: Clothing and Accessories\n- `HEALTHCARE_AND_MEDICAL`: Healthcare and Medical\n- `MEDICAL_INSTITUTIONS`: Medical Institutions\n- `HOME_AND_BUILDING_MATERIALS`: Home and Building Materials\n- `LOCAL_SERVICES`: Local Services\n- `BUSINESS_SERVICES`: Business Services\n- `CULTURE_SPORTS_ENTERTAINMENT`: Leisure and Entertainment\n- `BEAUTY_SERVICES`: Beauty Services\n- `REAL_ESTATE`: Real Estate\n- `EDUCATION_AND_TRAINING`: Education and Training\n- `TRAVEL_AND_TOURISM`: Travel and Tourism\n- `PUBLIC_SERVICES`: Public Services\n- `GAMES`: Games\n- `RETAIL`: Internet E-commerce Services\n- `TRANSPORTATION_EQUIPMENT`: Transportation Equipment\n- `AUTOMOTIVE`: Automotive\n- `AGRICULTURE_FORESTRY_FISHERY`: Agriculture Forestry Fishery\n- `CHEMICAL_AND_ENERGY`: Chemical and Energy\n- `ELECTRONICS_AND_ELECTRICAL`: Electronics and Electrical\n- `MACHINERY_EQUIPMENT`: Machinery Equipment\n- `MEDIA_AND_INFORMATION`: Media and Information\n- `LOGISTICS`: Logistics\n- `TELECOMMUNICATIONS`: Telecommunications\n- `FINANCIAL_SERVICES`: Financial Services\n- `CATERING_SERVICES`: Catering Services\n- `SOFTWARE_TOOLS`: Software Tools\n- `FRANCHISING_AND_INVESTMENT`: Franchising and Investment\n- `BEAUTY_AND_COSMETICS`: Beauty and Cosmetics\n- `MOTHER_BABY_AND_PET`: Mother Baby and Pet\n- `DAILY_CHEMICALS`: Daily Chemicals\n- `PHYSICAL_BOOKS`: Physical Books\n- `SOCIAL_AND_COMMUNICATION`: Social and Communication\n- `CULTURAL_SUPPLIES`: Cultural Supplies\n- `SPORTS_OUTDOOR`: Sports and Outdoors",
            ),
            [
              "ALL",
              "ELECTRONICS_AND_APPLIANCES",
              "SHOPPING",
              "FOOD_AND_BEVERAGE",
              "CLOTHING_AND_ACCESSORIES",
              "HEALTHCARE_AND_MEDICAL",
              "MEDICAL_INSTITUTIONS",
              "HOME_AND_BUILDING_MATERIALS",
              "LOCAL_SERVICES",
              "BUSINESS_SERVICES",
              "CULTURE_SPORTS_ENTERTAINMENT",
              "BEAUTY_SERVICES",
              "REAL_ESTATE",
              "EDUCATION_AND_TRAINING",
              "TRAVEL_AND_TOURISM",
              "PUBLIC_SERVICES",
              "GAMES",
              "RETAIL",
              "TRANSPORTATION_EQUIPMENT",
              "AUTOMOTIVE",
              "AGRICULTURE_FORESTRY_FISHERY",
              "CHEMICAL_AND_ENERGY",
              "ELECTRONICS_AND_ELECTRICAL",
              "MACHINERY_EQUIPMENT",
              "MEDIA_AND_INFORMATION",
              "LOGISTICS",
              "TELECOMMUNICATIONS",
              "FINANCIAL_SERVICES",
              "CATERING_SERVICES",
              "SOFTWARE_TOOLS",
              "FRANCHISING_AND_INVESTMENT",
              "BEAUTY_AND_COSMETICS",
              "MOTHER_BABY_AND_PET",
              "DAILY_CHEMICALS",
              "PHYSICAL_BOOKS",
              "SOCIAL_AND_COMMUNICATION",
              "CULTURAL_SUPPLIES",
              "SPORTS_OUTDOOR",
            ],
          ),
          "ALL",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_video_distribution",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/author_video_distribution/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) video-distribution data for a specified creator and content channel. Use it to analyze how the creator's videos are distributed during campaign research.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Video Distribution.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_audience_distribution",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/author_audience_distribution/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) audience-distribution data for a creator, content channel, and selected relationship stage. Use it to assess audience fit for campaign targeting.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Audience Distribution.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
        linkType: s.withDefault(
          s.withEnum(
            s.string(
              "Link type filter.\n\nAvailable Values:\n- `CONNECTED`: Connected\n- `AWARE`: Aware\n- `INTERESTED`: Interested\n- `LIKE`: Like\n- `FOLLOW`: Follow",
            ),
            ["CONNECTED", "AWARE", "INTERESTED", "LIKE", "FOLLOW"],
          ),
          "CONNECTED",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_marketing_metrics",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/author/get_author_marketing_info/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) marketing information for a specified creator and content channel. Use it to compare creator commercial offerings during campaign planning.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Marketing Metrics.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_spread_metrics",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/get_author_spread_info/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) spread metrics for a creator, with channel, period, video-type, assignment, and flow filters. Use it to compare creator spread performance during campaign planning.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Spread Metrics.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
        range: s.withDefault(
          s.withEnum(s.string("Time range.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"), [
            "DAY_30",
            "DAY_90",
          ]),
          "DAY_30",
        ),
        type: s.withDefault(
          s.withEnum(
            s.string(
              "Video type.\n\nAvailable Values:\n- `PERSONAL_VIDEO`: Personal video\n- `XINTU_VIDEO`: Xingtu video",
            ),
            ["PERSONAL_VIDEO", "XINTU_VIDEO"],
          ),
          "PERSONAL_VIDEO",
        ),
        onlyAssign: s.boolean({
          description: "Whether to only include assigned videos.",
          default: false,
        }),
        flowType: s.withDefault(
          s.withEnum(s.string("Flow type filter.\n\nAvailable Values:\n- `EXCLUDE`: Exclude\n- `INCLUDE`: Include"), [
            "EXCLUDE",
            "INCLUDE",
          ]),
          "EXCLUDE",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_conversion_analysis",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/get_author_convert_ability/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) conversion analysis for a creator, content channel, and 30- or 90-day period. Use it to compare creator conversion performance during commerce campaign planning.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Conversion Analysis.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
        range: s.withDefault(
          s.withEnum(s.string("Time range.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"), [
            "DAY_30",
            "DAY_90",
          ]),
          "DAY_30",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_showcase_items",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/author/get_author_show_items_v2/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) showcase items for a creator, with content-channel, assignment, and flow filters. Use it to review a creator's marketplace showcase during commerce campaign planning.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Showcase Items.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
        onlyAssign: s.boolean({
          description: "Whether to only include assigned items.",
          default: false,
        }),
        flowType: s.withDefault(
          s.withEnum(s.string("Flow type filter.\n\nAvailable Values:\n- `EXCLUDE`: Exclude\n- `INCLUDE`: Include"), [
            "EXCLUDE",
            "INCLUDE",
          ]),
          "EXCLUDE",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_conversion_resources",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/get_author_convert_videos_or_products/v1",
    authLocation: "query",
    description:
      "Lists Douyin Creator Marketplace (Xingtu) conversion-related videos or products for a creator, with industry, period, resource-type, and page filters. Use it to review commerce examples before creator selection.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Conversion Resources.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
        industryId: s.withDefault(
          s.withEnum(
            s.string(
              "Industry category.\n\nAvailable Values:\n- `ALL`: All\n- `ELECTRONICS_AND_APPLIANCES`: Electronics and Appliances\n- `SHOPPING`: Shopping\n- `FOOD_AND_BEVERAGE`: Food and Beverage\n- `CLOTHING_AND_ACCESSORIES`: Clothing and Accessories\n- `HEALTHCARE_AND_MEDICAL`: Healthcare and Medical\n- `MEDICAL_INSTITUTIONS`: Medical Institutions\n- `HOME_AND_BUILDING_MATERIALS`: Home and Building Materials\n- `LOCAL_SERVICES`: Local Services\n- `BUSINESS_SERVICES`: Business Services\n- `CULTURE_SPORTS_ENTERTAINMENT`: Leisure and Entertainment\n- `BEAUTY_SERVICES`: Beauty Services\n- `REAL_ESTATE`: Real Estate\n- `EDUCATION_AND_TRAINING`: Education and Training\n- `TRAVEL_AND_TOURISM`: Travel and Tourism\n- `PUBLIC_SERVICES`: Public Services\n- `GAMES`: Games\n- `RETAIL`: Internet E-commerce Services\n- `TRANSPORTATION_EQUIPMENT`: Transportation Equipment\n- `AUTOMOTIVE`: Automotive\n- `AGRICULTURE_FORESTRY_FISHERY`: Agriculture Forestry Fishery\n- `CHEMICAL_AND_ENERGY`: Chemical and Energy\n- `ELECTRONICS_AND_ELECTRICAL`: Electronics and Electrical\n- `MACHINERY_EQUIPMENT`: Machinery Equipment\n- `MEDIA_AND_INFORMATION`: Media and Information\n- `LOGISTICS`: Logistics\n- `TELECOMMUNICATIONS`: Telecommunications\n- `FINANCIAL_SERVICES`: Financial Services\n- `CATERING_SERVICES`: Catering Services\n- `SOFTWARE_TOOLS`: Software Tools\n- `FRANCHISING_AND_INVESTMENT`: Franchising and Investment\n- `BEAUTY_AND_COSMETICS`: Beauty and Cosmetics\n- `MOTHER_BABY_AND_PET`: Mother Baby and Pet\n- `DAILY_CHEMICALS`: Daily Chemicals\n- `PHYSICAL_BOOKS`: Physical Books\n- `SOCIAL_AND_COMMUNICATION`: Social and Communication\n- `CULTURAL_SUPPLIES`: Cultural Supplies\n- `SPORTS_OUTDOOR`: Sports and Outdoors",
            ),
            [
              "ALL",
              "ELECTRONICS_AND_APPLIANCES",
              "SHOPPING",
              "FOOD_AND_BEVERAGE",
              "CLOTHING_AND_ACCESSORIES",
              "HEALTHCARE_AND_MEDICAL",
              "MEDICAL_INSTITUTIONS",
              "HOME_AND_BUILDING_MATERIALS",
              "LOCAL_SERVICES",
              "BUSINESS_SERVICES",
              "CULTURE_SPORTS_ENTERTAINMENT",
              "BEAUTY_SERVICES",
              "REAL_ESTATE",
              "EDUCATION_AND_TRAINING",
              "TRAVEL_AND_TOURISM",
              "PUBLIC_SERVICES",
              "GAMES",
              "RETAIL",
              "TRANSPORTATION_EQUIPMENT",
              "AUTOMOTIVE",
              "AGRICULTURE_FORESTRY_FISHERY",
              "CHEMICAL_AND_ENERGY",
              "ELECTRONICS_AND_ELECTRICAL",
              "MACHINERY_EQUIPMENT",
              "MEDIA_AND_INFORMATION",
              "LOGISTICS",
              "TELECOMMUNICATIONS",
              "FINANCIAL_SERVICES",
              "CATERING_SERVICES",
              "SOFTWARE_TOOLS",
              "FRANCHISING_AND_INVESTMENT",
              "BEAUTY_AND_COSMETICS",
              "MOTHER_BABY_AND_PET",
              "DAILY_CHEMICALS",
              "PHYSICAL_BOOKS",
              "SOCIAL_AND_COMMUNICATION",
              "CULTURAL_SUPPLIES",
              "SPORTS_OUTDOOR",
            ],
          ),
          "ALL",
        ),
        range: s.withDefault(
          s.withEnum(s.string("Time range.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"), [
            "DAY_30",
            "DAY_90",
          ]),
          "DAY_30",
        ),
        detailType: s.withDefault(
          s.withEnum(s.string("Resource type.\n\nAvailable Values:\n- `VIDEO`: Video\n- `PRODUCT`: Product"), [
            "VIDEO",
            "PRODUCT",
          ]),
          "VIDEO",
        ),
        page: s.integer("Page number.", { default: 1 }),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_cost_performance_analysis",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/author_cp_info/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) cost-performance information for a specified creator and content channel. Use it to compare creator efficiency during campaign budgeting.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Cost Performance Analysis.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_audience_touchpoint_distribution",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/author_touch_distribution/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) audience-touchpoint distribution data for a specified creator and content channel. Use it to compare audience-contact patterns during campaign research.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Audience Touchpoint Distribution.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_recommended_videos",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/author_rec_videos_v2/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) recommended videos for a specified creator and content channel. Use it to inspect representative content during creator research.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Recommended Videos.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        platform: s.withDefault(
          s.withEnum(
            s.string(
              "Platform type.\n\nAvailable Values:\n- `SHORT_VIDEO`: Short video\n- `LIVE_STREAMING`: Live streaming\n- `PICTURE_TEXT`: Picture and text\n- `SHORT_DRAMA`: Short drama",
            ),
            ["SHORT_VIDEO", "LIVE_STREAMING", "PICTURE_TEXT", "SHORT_DRAMA"],
          ),
          "SHORT_VIDEO",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_follower_distribution",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/get_author_fans_distribution/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) follower or loyal-follower distribution data for a specified creator. Use it to compare audience-profile distributions during creator selection.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Follower Distribution.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        authorType: s.withDefault(
          s.withEnum(
            s.string("Author type filter.\n\nAvailable Values:\n- `FAN`: Fan\n- `DIE_HARD_FAN`: Die Hard Fan"),
            ["FAN", "DIE_HARD_FAN"],
          ),
          "FAN",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_item_report_trends",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/item_report_trend/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) report trend data for a specified video item. Use it to review how a video's reported performance changes over time.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Item Report Trends.",
      {
        itemId: s.string("Item's unique ID.", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_video_details",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/item_report_detail/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) report details for a specified video item. Use it to inspect a video's marketplace report during content performance analysis.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Video Details.",
      {
        itemId: s.string("Item's unique ID.", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_item_report_analysis",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/item_report_th_analysis/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) report analysis for a specified video item. Use it to evaluate a video's reported performance during campaign review.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Item Report Analysis.",
      {
        itemId: s.string("Item's unique ID.", { minLength: 1 }),
      },
      { required: ["itemId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_comment_keyword_analysis",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data/get_author_hot_comment_tokens/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) comment keyword analysis for a specified creator. Use it to identify recurring audience discussion themes during creator research.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Comment Keyword Analysis.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_follower_growth_trend",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/data_sp/get_author_daily_fans/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) daily follower trend data for a specified creator and date range. Use it to review follower growth patterns during creator evaluation.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Follower Growth Trend.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        startDate: s.string("Start Date (yyyy-MM-dd).", { minLength: 1 }),
        endDate: s.string("End Date (yyyy-MM-dd).", { minLength: 1 }),
      },
      { required: ["oAuthorId", "startDate", "endDate"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_content_keyword_analysis",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/gauthor/get_author_content_hot_keywords/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) content keyword analysis for a specified creator. Use it to identify recurring content themes during creator positioning research.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Content Keyword Analysis.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_business_card",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/gauthor/author_get_business_card_info/v1",
    authLocation: "query",
    description:
      "Returns the Douyin Creator Marketplace (Xingtu) business-card profile for a specified creator. Use it to review creator identity and business context before campaign outreach.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Business Card.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_commerce_spread_info",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_commerce_spread_info/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) commerce spread information for a specified creator. Use it to compare creators during commerce campaign planning.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Commerce Spread Info.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_homepage_videos",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_homepage_videos/v1",
    authLocation: "query",
    description:
      "Lists a Douyin Creator Marketplace (Xingtu) creator's homepage videos with keyword, video-type, assignment, date, and page filters. Use it to review relevant content before campaign selection.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Homepage Videos.",
      {
        oAuthorId: s.string("Author's unique Xingtu ID.", { minLength: 1 }),
        page: s.integer("Page number, starting from 1.", { default: 1 }),
        keyword: s.string("Keyword used to search creator homepage videos."),
        videoType: s.withDefault(
          s.withEnum(
            s.string(
              "Homepage video type filter.\n\nAvailable Values:\n- `ALL`: All videos\n- `PERSONAL`: Personal videos\n- `XINGTU`: Xingtu videos",
            ),
            ["ALL", "PERSONAL", "XINGTU"],
          ),
          "ALL",
        ),
        onlyAssign: s.boolean({
          description:
            "Whether to include only assigned videos. Xingtu usually shows this option when `videoType` is `XINGTU`.",
          default: false,
        }),
        startDate: s.string("Start publish date in yyyyMMdd format. The filter starts at 00:00:00 in Asia/Shanghai."),
        endDate: s.string("End publish date in yyyyMMdd format. The filter ends at 23:59:59 in Asia/Shanghai."),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_tags",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_tags/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) tags for a specified creator. Use it to classify creators and compare their fit for campaign briefs.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Tags.",
      {
        starAuthorId: s.string("Creator's unique Xingtu ID.", { minLength: 1 }),
      },
      { required: ["starAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_side_base_info",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_side_base_info/v1",
    authLocation: "query",
    description:
      "Returns the Douyin Creator Marketplace (Xingtu) side-card baseline information for a specified creator. Use it to review a creator's marketplace overview during shortlisting.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Side Base Info.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_live_statistics",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_live_statistics/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) live-stream statistics for a creator, with live-room, period, marketplace-order, and flow filters. Use it to compare live-streaming creators for campaign planning.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Live Statistics.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        liveType: s.withEnum(
          s.string(
            "Live room type filter.\n\nAvailable Values:\n- `ALL`: All live rooms\n- `GAME`: Game live rooms\n- `ECOMMERCE`: E-commerce live rooms\n- `OTHER`: Other live rooms",
          ),
          ["ALL", "GAME", "ECOMMERCE", "OTHER"],
        ),
        period: s.withEnum(
          s.string("Live data time period.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"),
          ["DAY_30", "DAY_90"],
        ),
        onlyStarOrder: s.boolean({
          description: "Whether to include only Xingtu marketplace orders.",
          default: false,
        }),
        flowType: s.withEnum(
          s.string("Flow type filter.\n\nAvailable Values:\n- `EXCLUDE`: Exclude\n- `INCLUDE`: Include"),
          ["EXCLUDE", "INCLUDE"],
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_live_watch_distribution",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_live_watch_distribution/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) live audience or follower watch-distribution data for a creator and selected live-room type. Use it to assess live audience fit for a campaign.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Live Watch Distribution.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        liveCrowdType: s.withEnum(
          s.string(
            "Live audience profile type.\n\nAvailable Values:\n- `AUDIENCE`: Viewer profile\n- `FANS`: Follower profile",
          ),
          ["AUDIENCE", "FANS"],
        ),
        liveType: s.withEnum(
          s.string(
            "Live room type filter.\n\nAvailable Values:\n- `ALL`: All live rooms\n- `GAME`: Game live rooms\n- `ECOMMERCE`: E-commerce live rooms\n- `OTHER`: Other live rooms",
          ),
          ["ALL", "GAME", "ECOMMERCE", "OTHER"],
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_commerce_seeding_base_info",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_commerce_seed_base_info/v1",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) commerce-seeding baseline information for a creator over a selectable 30- or 90-day period. Use it to research creators for product-seeding campaigns.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Commerce Seeding Base Info.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        range: s.withDefault(
          s.withEnum(s.string("Time range.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"), [
            "DAY_30",
            "DAY_90",
          ]),
          "DAY_90",
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "douyin_creator_marketplace_xingtu_creator_contract_base_info",
    method: "GET",
    path: "/api/douyin-xingtu/gw/api/aggregator/get_author_contract_base_info",
    authLocation: "query",
    description:
      "Returns Douyin Creator Marketplace (Xingtu) contract-related baseline information for a creator over a selectable 30- or 90-day period. Use it to review creator contract context during campaign planning.",
    inputSchema: s.object(
      "Input for Douyin Creator Marketplace (Xingtu) Creator Contract Base Info.",
      {
        oAuthorId: s.string("Author's unique ID.", { minLength: 1 }),
        range: s.withEnum(
          s.string("Time range.\n\nAvailable Values:\n- `DAY_30`: Last 30 days\n- `DAY_90`: Last 90 days"),
          ["DAY_30", "DAY_90"],
        ),
      },
      { required: ["oAuthorId"] },
    ),
  },
  {
    name: "qq_huxuan_creator_marketplace_video_account_creator_search",
    method: "GET",
    path: "/api/qq-huxuan/cgi-bin/advertiser/finder_publisher/search/v1",
    authLocation: "query",
    description:
      "Searches or browses QQ Huxuan Video Account creators by optional nickname keyword with page-number pagination. Use it to discover and shortlist video creators for Tencent Huxuan campaign planning.",
    inputSchema: s.object(
      "Input for QQ Huxuan Creator Marketplace Video Account Creator Search.",
      {
        keyword: s.string("Creator nickname keyword. Leave empty to browse the default marketplace list.", {
          default: "",
        }),
        page: s.integer("Page number. The first page is 1.", { default: 1 }),
      },
      { required: [] },
    ),
  },
  {
    name: "qq_huxuan_creator_marketplace_official_account_creator_search",
    method: "GET",
    path: "/api/qq-huxuan/cgi-bin/advertiser/mp_publisher/search/v1",
    authLocation: "query",
    description:
      "Searches or browses QQ Huxuan Official Account creators by optional nickname or account keyword with page-number pagination. Use it to discover and shortlist publishers for Tencent Huxuan campaign planning.",
    inputSchema: s.object(
      "Input for QQ Huxuan Creator Marketplace Official Account Creator Search.",
      {
        keyword: s.string("Creator nickname or account keyword. Leave empty to browse the default marketplace list.", {
          default: "",
        }),
        page: s.integer("Page number. The first page is 1.", { default: 1 }),
      },
      { required: [] },
    ),
  },
  {
    name: "qq_huxuan_creator_marketplace_video_account_creator_details",
    method: "GET",
    path: "/api/qq-huxuan/cgi-bin/advertiser/finder_publisher/detail/v1",
    authLocation: "query",
    description:
      "Retrieves QQ Huxuan Video Account creator details for a known creator app ID. Use it to review a shortlisted video creator before Tencent Huxuan campaign selection.",
    inputSchema: s.object(
      "Input for QQ Huxuan Creator Marketplace Video Account Creator Details.",
      {
        appId: s.string("Video Account creator app ID.", { minLength: 1 }),
      },
      { required: ["appId"] },
    ),
  },
  {
    name: "qq_huxuan_creator_marketplace_video_account_recent_videos",
    method: "GET",
    path: "/api/qq-huxuan/cgi-bin/advertiser/finder_publisher/get_finder_video_show/v1",
    authLocation: "query",
    description:
      "Lists videos from a QQ Huxuan Video Account creator within a required date range, with a choice of all, Huxuan order, hot, or personal videos. Use it to review a shortlisted creator's content for campaign planning.",
    inputSchema: s.object(
      "Input for QQ Huxuan Creator Marketplace Video Account Recent Videos.",
      {
        appId: s.string("Video Account creator app ID.", { minLength: 1 }),
        videoType: s.withDefault(
          s.withEnum(
            s.string(
              "Tencent Huxuan video type filter.\n\nAvailable Values:\n- `ALL`: All videos\n- `ORDER`: QQ Huxuan order videos\n- `HOT`: Hot videos\n- `PERSON`: Personal videos",
            ),
            ["ALL", "ORDER", "HOT", "PERSON"],
          ),
          "ALL",
        ),
        beginDate: s.string("Start date in yyyyMMdd format.", { minLength: 1 }),
        endDate: s.string("End date in yyyyMMdd format.", { minLength: 1 }),
        page: s.integer("Page number. The first page is 1.", { default: 1 }),
      },
      { required: ["appId", "beginDate", "endDate"] },
    ),
  },
  {
    name: "qq_huxuan_creator_marketplace_official_account_creator_details",
    method: "GET",
    path: "/api/qq-huxuan/cgi-bin/advertiser/mp_publisher/detail/v1",
    authLocation: "query",
    description:
      "Retrieves QQ Huxuan Official Account creator details for a known creator app ID. Use it to review a shortlisted publisher before Tencent Huxuan campaign selection.",
    inputSchema: s.object(
      "Input for QQ Huxuan Creator Marketplace Official Account Creator Details.",
      {
        appId: s.string("Official Account creator app ID.", { minLength: 1 }),
      },
      { required: ["appId"] },
    ),
  },
  {
    name: "qq_huxuan_creator_marketplace_official_account_article_list",
    method: "GET",
    path: "/api/qq-huxuan/cgi-bin/advertiser/mp_publisher/get_user_articles/v1",
    authLocation: "query",
    description:
      "Lists articles from a QQ Huxuan Official Account creator within a required date range, with an optional title keyword and a choice between all articles and Huxuan order articles. Use it to review a publisher's content for campaign planning.",
    inputSchema: s.object(
      "Input for QQ Huxuan Creator Marketplace Official Account Article List.",
      {
        appId: s.string("Official Account creator app ID.", { minLength: 1 }),
        keyword: s.string("Article title keyword. Leave empty to return all matched articles.", {
          default: "",
        }),
        articleType: s.withDefault(
          s.withEnum(
            s.string(
              "Tencent Huxuan article type filter.\n\nAvailable Values:\n- `ALL`: All articles\n- `ORDER`: QQ Huxuan order articles",
            ),
            ["ALL", "ORDER"],
          ),
          "ALL",
        ),
        startDate: s.string("Start date in yyyyMMdd format.", { minLength: 1 }),
        endDate: s.string("End date in yyyyMMdd format.", { minLength: 1 }),
        page: s.integer("Page number. The first page is 1.", { default: 1 }),
      },
      { required: ["appId", "startDate", "endDate"] },
    ),
  },
  {
    name: "qq_huxuan_creator_marketplace_hot_content_trends",
    method: "GET",
    path: "/api/qq-huxuan/cgi-bin/advertiser/finder_publisher/get_rank_finder_content/v1",
    authLocation: "query",
    description:
      "Lists QQ Huxuan hot Video Account content by month and creator category, with six descending sort metrics and page-number pagination. Use it to research monthly content trends for Tencent Huxuan campaign planning.",
    inputSchema: s.object(
      "Hot Content Trends input.",
      {
        category: s.withEnum(
          s.string(
            "Creator category. ALL includes every category.\n\nAvailable Values:\n- `ALL`: All creator categories\n- `FOOD`: Food\n- `LIFESTYLE`: Lifestyle\n- `COMEDY`: Comedy\n- `EMOTION`: Emotion and relationships\n- `SOCIETY`: Society\n- `HUMANITIES_ARTS`: Humanities and arts\n- `DRAMA`: Drama\n- `ENTERTAINMENT`: Entertainment\n- `TECHNOLOGY`: Technology\n- `FINANCE`: Finance\n- `FILM_TV_VARIETY`: Film, television and variety shows\n- `GAMING`: Gaming\n- `PARENTING`: Parenting\n- `MUSIC`: Music\n- `TRAVEL`: Travel\n- `SPORTS`: Sports\n- `SCIENCE`: Science education\n- `AUTOMOTIVE`: Automotive\n- `EDUCATION`: Education\n- `CAREER`: Career\n- `HEALTH`: Health\n- `PETS`: Pets",
            { default: "ALL" },
          ),
          [
            "ALL",
            "FOOD",
            "LIFESTYLE",
            "COMEDY",
            "EMOTION",
            "SOCIETY",
            "HUMANITIES_ARTS",
            "DRAMA",
            "ENTERTAINMENT",
            "TECHNOLOGY",
            "FINANCE",
            "FILM_TV_VARIETY",
            "GAMING",
            "PARENTING",
            "MUSIC",
            "TRAVEL",
            "SPORTS",
            "SCIENCE",
            "AUTOMOTIVE",
            "EDUCATION",
            "CAREER",
            "HEALTH",
            "PETS",
          ],
        ),
        sort: s.withEnum(
          s.string(
            "Sort metric. Results are sorted in descending order.\n\nAvailable Values:\n- `INTERACTION`: Interaction count\n- `PLAY`: Play count\n- `THUMB_LIKE`: Thumbs-up like count\n- `HEART_LIKE`: Heart like count\n- `COMMENT`: Comment count\n- `SHARE`: Share count",
            { default: "INTERACTION" },
          ),
          ["INTERACTION", "PLAY", "THUMB_LIKE", "HEART_LIKE", "COMMENT", "SHARE"],
        ),
        month: s.string("Statistics month in yyyy-MM format. Omit to use the latest month available on QQ Huxuan."),
        page: s.integer("Page number, starting at 1. Each page contains up to 48 items.", {
          format: "int32",
          default: 1,
        }),
      },
      {},
    ),
  },
];
