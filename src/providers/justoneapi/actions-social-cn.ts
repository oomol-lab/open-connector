import type { JustoneapiEndpoint } from "./endpoint-definition.ts";

import { s } from "../../core/json-schema.ts";

export const socialCnEndpoints: readonly JustoneapiEndpoint[] = [
  {
    name: "social_media_cross_platform_search",
    method: "GET",
    path: "/api/search/v1",
    authLocation: "query",
    description:
      "Searches recent content across news, Weibo, WeChat, Zhihu, Douyin, Xiaohongshu, Bilibili, and Kuaishou with source and time filters. Use it to monitor a topic across multiple platforms.",
    inputSchema: s.object(
      "Input for Social Media Cross-Platform Search.",
      {
        keyword: s.string(
          'Search query string. Supports these five syntax forms:\n- AND (&&): A && B matches content containing both A and B.\n- OR (||): A || B matches content containing A or B.\n- Exclusion (-): -A matches content that does not contain A.\n- Parentheses (): (A && B) || C matches content containing C, or both A and B.\n- English double quotes (""): "A" disables tokenization and requires an exact match for A.\n',
        ),
        source: s.withDefault(
          s.withEnum(
            s.string(
              "Target social media platform for search filtering.\n\nAvailable Values:\n- `ALL`: All platforms\n- `NEWS`: News\n- `WEIBO`: Sina Weibo\n- `WEIXIN`: Weixin (WeChat)\n- `ZHIHU`: Zhihu\n- `DOUYIN`: Douyin (TikTok China)\n- `XIAOHONGSHU`: Xiaohongshu (Little Red Book)\n- `BILIBILI`: Bilibili\n- `KUAISHOU`: Kuaishou",
            ),
            ["ALL", "NEWS", "WEIBO", "WEIXIN", "ZHIHU", "DOUYIN", "XIAOHONGSHU", "BILIBILI", "KUAISHOU"],
          ),
          "ALL",
        ),
        start: s.string("Start time of the search period (yyyy-MM-dd HH:mm:ss). Required for initial request."),
        end: s.string("End time of the search period (yyyy-MM-dd HH:mm:ss). Required for initial request."),
        nextCursor: s.string("Pagination cursor provided by the 'nextCursor' field in the previous response."),
      },
      {
        required: [],
        anyOf: [
          {
            required: ["nextCursor"],
            properties: { nextCursor: { type: "string", minLength: 1 } },
          },
          {
            required: ["start", "end"],
            properties: {
              start: { type: "string", minLength: 1 },
              end: { type: "string", minLength: 1 },
            },
          },
        ],
      },
    ),
  },
  {
    name: "xiaohongshu_rednote_ask_dots_ai",
    method: "GET",
    path: "/api/xiaohongshu/ask-dots",
    authLocation: "query",
    description:
      "Queries Xiaohongshu (RedNote) Ask Dots AI with a keyword question. Use it to retrieve an AI answer for topic research and question exploration.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Ask Dots AI.",
      {
        keyword: s.string("Question or keyword to submit to Ask Dots AI.", { minLength: 1 }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_hot_search",
    method: "GET",
    path: "/api/xiaohongshu/hot-search/v1",
    authLocation: "query",
    description:
      "Searches Xiaohongshu (RedNote) hot-content entries with optional keyword, content-category path, pagination, ranking metric, and time-range controls. Use it to support trend discovery, topic monitoring, and content planning.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Hot Search.",
      {
        searchWord: s.withDefault(s.string("Search keyword."), ""),
        pageNum: s.withDefault(s.integer("Page number for pagination."), 1),
        orderBy: s.withDefault(
          s.withEnum(
            s.string(
              "Sort metric for the result set.\n\nAvailable Values:\n- `premium_imp_num`: Exposure\n- `premium_good_read_rate`: Read rate\n- `premium_read_num`: Read count\n- `premium_engage_num`: Engagement count\n- `premium_engage_rate`: Engagement rate\n- `premium_like_num`: Like count\n- `premium_fav_num`: Favorite count\n- `premium_cmt_num`: Comment count",
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
        noteContentCategory: s.string(
          "Content category filter. Pass one complete Pugongying category path joined with # separators. You may pass a parent path or append one listed child with another #. Only one path is accepted.\n\nAvailable values:\n\nContent categories:\n- 内容类目#美妆: 整体妆容, 唇妆, 眼妆, 美甲, 底妆, 美妆合集, 香水, 美妆其他\n- 内容类目#护肤: 面部保养, 面部清洁, 护肤合集, 护肤其他\n- 内容类目#个人护理: 头发产品, 身体护理, 口腔护理, 护理其他\n- 内容类目#母婴: 母婴日常, 早教, 婴童用品, 婴童洗护, 婴童食品, 婴童时尚, 孕期穿搭, 孕产经验, 产后恢复, 育儿经验, 宝宝才艺, 宝宝写真, 母婴其他\n- 内容类目#时尚: 穿搭, 配饰, 发型, 箱包, 鞋靴, 时尚其他\n- 内容类目#美食: 美食教程, 美食探店, 美食展示, 美食测评, 吃播, 美食其他\n- 内容类目#家居家装: 装修, 家居用品, 花艺园艺, 家居装饰, 家具, 家电, 室内设计, 居家经验, 家居家装其他\n- 内容类目#影视综资讯: 动漫, 娱乐资讯, 影视, 民生资讯, 综艺, 影视综其他\n- 内容类目#运动健身: 减脂塑形, 滑雪, 滑板, 水上活动, 运动其他, 足球, 篮球, 跑步, 游泳\n- 内容类目#宠物: 猫, 狗, 动物其他\n- 内容类目#文化艺术: 社科, 文化, 艺术, 文化艺术其他\n- 内容类目#兴趣爱好: 绘画, 手工, 阅读, 文具手账, 舞蹈, 兴趣爱好其他, 玩具周边\n- 内容类目#生活记录: 接地气生活, 日常片段, 中外生活, 品质生活, 校园生活\n- 内容类目#教育: 大学教育, k12教育, 家庭教育, 学习日常, 留学教育, 教育其他, 语言教育\n- 内容类目#职场: 职场干货, 职场行业, 职业考试, 职场其他\n- 内容类目#情感: 情感知识, 情感日常, 情感其他\n- 内容类目#摄影: 人文风光摄影, 摄影技巧, 胶片摄影, 人像摄影, 摄影其他\n- 内容类目#游戏: 手机游戏, 主机游戏, 游戏其他, 线下游戏\n- 内容类目#科技数码: 移动数码, 玩机攻略, 数码科技其他\n- 内容类目#出行旅游: 城市出行, 户外, 旅行\n- 内容类目#音乐\n- 内容类目#搞笑\n- 内容类目#健康养生\n- 内容类目#汽车: 用车攻略, 汽车评测, 汽车其他\n- 内容类目#婚嫁: 婚礼造型, 婚礼记录, 婚礼经验, 婚礼用品\n- 内容类目#商业财经\n- 内容类目#素材\n- 内容类目#其他\n\nIndustry categories:\n- 所属行业#母婴: 母婴出行, 哺乳喂养工具, 婴童个护清洁, 母婴家居, 母婴奶粉, 母婴辅零食, 婴童服饰鞋靴, 玩具相关, 母婴纸品, 孕产妇相关, 母婴营养品, 婴童面部护肤, 母婴小家电\n- 所属行业#家用电器: 大家电, 厨卫电器, 生活电器, 家电套系\n- 所属行业#3C数码: 手机, 数码设备, 电脑, 办公设备, 操作系统\n- 所属行业#食品饮料: 休闲零食, 方便速食, 粮油调味, 预制菜, 饮料冲调, 乳制品, 水果/水产, 肉禽蛋品, 功能性食品, 酒类（新）\n- 所属行业#美妆个护: 彩妆, 美容护肤, 香水香薰, 身体洗护, 口腔护理, 头发护理, 美容仪器\n- 所属行业#汽车出行: 乘用车, 摩托车, 电动自行车, 自行车, 卡车, 汽车用品, 维修保养, 汽车服务\n- 所属行业#本地生活: 奶茶果汁(新), 咖啡(新), 甜品烘焙(新), 熟食卤味(新), 特色小吃/特产(新), 酒吧(新), 西式快餐(新), 中式快餐(新), 中式正餐(新), 西式正餐(新), 线下零售\n- 所属行业#日化家清: 家务工具, 家用清洁, 纸品, 护理用品\n- 所属行业#医疗健康: OTC, 保健食品, 保健用品, 非OTC药品, 健康机械, 视力保健, 家用医疗器械, 成人计生（械）\n- 所属行业#宠物（新）: 宠物服务, 宠物食品, 宠物用品, 养宠经验, 宠物药保\n- 所属行业#家居家装: 灯饰光源, 家居百货, 家居建材零售, 家具, 家装辅材, 家装主材, 五金电具, 装修设计与工程服务, 智能家居, 家居卖场, 家居展会, 家纺, 餐厨杯\n- 所属行业#出行旅游: 交通出行, 酒店住宿, 国内游(新), 出境游(新), 景点景区(新), 旅游攻略(新), 旅游主题(新)\n- 所属行业#教育培训: K12教育, 素质教育, 图书, 成人兴趣培训, 学历教育, 语言及留学, 早教, 职业教育\n- 所属行业#金融行业: 保险, 贷款, 银行, 证券\n- 所属行业#医疗医美: 口腔医疗, 眼科医疗, 皮肤美容, 植发养发, 体检机构(新), 月子妇产(新), 面部塑形, 医美身体塑形, 中医医疗\n- 所属行业#免税平台: 美妆个护, 奢侈品\n- 所属行业#服饰鞋包: 女装, 男装, 女鞋, 男鞋, 女士内衣, 男士内衣, 服饰配件, 童装/亲子装, 箱包, 旅行箱, 童鞋/亲子鞋\n- 所属行业#珠宝配饰: 腕表, 首饰, 眼镜, 配饰, 珠宝摆件, 金条、金币\n- 所属行业#运动户外: 运动鞋, 户外鞋, 运动服装, 户外服装, 运动户外装备, 运动服配, 健身器械, 运动现场\n- 所属行业#文玩娱乐: 玩具, 游戏, 文玩收藏, 文体, 文具\n- 所属行业#到店综合: 商务服务, 生活服务\n- 所属行业#奢侈品: 箱包, 服饰, 鞋履, 珠宝配饰, 腕表, 运动户外, 品质生活, 婴童, 内衣, 高端酒店, 书写工具\n- 所属行业#互联网: 平台电商, 网服, 游戏, 内容消费, 生活服务, 软件工具, 会员服务\n- 所属行业#影像婚美: 婚纱摄影, 写真摄影, 婚礼服务, 婚恋交友\n- 所属行业#房地产: 房产中介, 房产开发, 商业地产\n\nExamples:\n- 内容类目#美妆\n- 内容类目#美妆#整体妆容\n- 所属行业#母婴#母婴出行\n",
        ),
      },
      { required: [] },
    ),
  },
  {
    name: "xiaohongshu_rednote_hot_inspiration_feed",
    method: "GET",
    path: "/api/xiaohongshu/get-creator-hot-inspiration-feed/v1",
    authLocation: "query",
    description:
      "Retrieves the Xiaohongshu (RedNote) creator center hot inspiration feed with cursor pagination. Use it to discover inspiration for content planning and explore further pages of creative ideas.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Hot Inspiration Feed.",
      {
        cursor: s.withDefault(
          s.string(
            "Leave empty for the first request. For the next page, pass the cursor value returned by the previous response.",
          ),
          "",
        ),
      },
      { required: [] },
    ),
  },
  {
    name: "xiaohongshu_rednote_note_search",
    method: "GET",
    path: "/api/xiaohongshu/search-note/v4",
    authLocation: "query",
    description:
      "Searches Xiaohongshu (RedNote) notes through the mobile-app search flow with pagination, sorting, note-type, and time filters. Use it to support iterative topic research and filtered content discovery.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Note Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number for pagination."), 1),
        sortType: s.withDefault(
          s.withEnum(
            s.string(
              "Sort order for the result set.\n\nAvailable Values:\n- `general`: General\n- `popularity_descending`: Popularity Descending\n- `time_descending`: Time Descending\n- `comment_descending`: Comment Descending\n- `collect_descending`: Collect Descending",
            ),
            ["general", "popularity_descending", "time_descending", "comment_descending", "collect_descending"],
          ),
          "general",
        ),
        noteType: s.withDefault(
          s.withEnum(
            s.string(
              "Note type filter.\n\nAvailable Values:\n- `ALL`: No Limit\n- `VIDEO_NOTE`: Video Note\n- `NORMAL_NOTE`: Normal Note",
            ),
            ["ALL", "VIDEO_NOTE", "NORMAL_NOTE"],
          ),
          "ALL",
        ),
        timeFilter: s.withDefault(
          s.withEnum(
            s.string(
              "Publish time filter.\n\nAvailable Values:\n- `ALL`: No Limit\n- `ONE_DAY`: Within one day\n- `ONE_WEEK`: Within one week\n- `HALF_YEAR`: Within half a year",
            ),
            ["ALL", "ONE_DAY", "ONE_WEEK", "HALF_YEAR"],
          ),
          "ALL",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_user_search",
    method: "GET",
    path: "/api/xiaohongshu/search-user/v2",
    authLocation: "query",
    description:
      "Searches Xiaohongshu (RedNote) users by keyword with page-based pagination. Use it to support creator discovery, account research, and finding profiles related to a topic, name, or brand term.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) User Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number for pagination."), 1),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_user_published_notes",
    method: "GET",
    path: "/api/xiaohongshu/get-user-note-list/v4",
    authLocation: "query",
    description:
      "Reads a user's published public Xiaohongshu (RedNote) notes by user ID or supported profile URL, with lastCursor pagination. This endpoint does not create, upload or publish notes.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) User Notes.",
      {
        userId: s.string("A Xiaohongshu user ID or a profile URL containing /user/profile/.", {
          minLength: 1,
        }),
        lastCursor: s.string(
          "Omit on the first request. For the next page, pass the last note's cursor value from the previous response.",
        ),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_note_details",
    method: "GET",
    path: "/api/xiaohongshu/get-note-detail/v6",
    authLocation: "query",
    description:
      "Retrieves Xiaohongshu (RedNote) video-note details by note ID. Use it to look up and process a known video note.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Note Details.",
      {
        noteId: s.string("Unique note identifier on Xiaohongshu.", { minLength: 1 }),
      },
      { required: ["noteId"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_note_comments",
    method: "GET",
    path: "/api/xiaohongshu/get-note-comment/v2",
    authLocation: "query",
    description:
      "Retrieves comments for a Xiaohongshu (RedNote) note with cursor pagination and normal, latest, or like-count sorting. Use it to support feedback review, discussion analysis, and comment moderation workflows.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Note Comments.",
      {
        noteId: s.string("A Xiaohongshu note ID or an explore URL containing /explore/.", {
          minLength: 1,
        }),
        lastCursor: s.string(
          "Pagination cursor from the previous page (use the cursor value returned by the last response).",
        ),
        sort: s.withDefault(
          s.withEnum(
            s.string(
              "Sort strategy for the result set.\n\nAvailable Values:\n- `normal`: Normal\n- `latest`: Latest\n- `like_count`: Like Count",
            ),
            ["normal", "latest", "like_count"],
          ),
          "latest",
        ),
      },
      { required: ["noteId"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_comment_replies",
    method: "GET",
    path: "/api/xiaohongshu/get-note-sub-comment/v2",
    authLocation: "query",
    description:
      "Retrieves replies to a specific Xiaohongshu (RedNote) note comment with cursor pagination. Use it to inspect threaded discussions and continue through reply pages for feedback review or moderation.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Comment Replies.",
      {
        noteId: s.string("Unique note identifier on Xiaohongshu.", { minLength: 1 }),
        commentId: s.string("Unique comment identifier on Xiaohongshu.", { minLength: 1 }),
        lastCursor: s.string(
          "Pagination cursor from the previous page (use the cursor value returned by the last response).",
        ),
      },
      { required: ["noteId", "commentId"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_user_profile",
    method: "GET",
    path: "/api/xiaohongshu/get-user/v3",
    authLocation: "query",
    description:
      "Retrieves a Xiaohongshu (RedNote) user profile from a user ID or supported profile URL. Use it to support creator discovery, account research, and reviewing a known profile before related content analysis.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) User Profile.",
      {
        userId: s.string("A Xiaohongshu user ID or a profile URL containing /user/profile/.", {
          minLength: 1,
        }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_keyword_suggestions",
    method: "GET",
    path: "/api/xiaohongshu/search-recommend/v1",
    authLocation: "query",
    description:
      "Returns Xiaohongshu (RedNote) search keyword suggestions for a submitted seed term. Use it to expand query sets, refine content-research searches, and plan SEO or programmatic SEO keyword coverage.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Keyword Suggestions.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_topic_note_list",
    method: "GET",
    path: "/api/xiaohongshu/get-topic-note-list/v1",
    authLocation: "query",
    description:
      "Retrieves Xiaohongshu (RedNote) notes associated with a topic ID, with hot or latest sorting and cursor pagination. Use it to support topic content discovery, trend review, and continuing through topic result pages.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Topic Note List.",
      {
        topicId: s.string("Unique topic identifier on Xiaohongshu.", { minLength: 1 }),
        sort: s.withDefault(
          s.withEnum(s.string("Sort order for the result set.\n\nAvailable Values:\n- `time`: Latest\n- `hot`: Hot"), [
            "time",
            "hot",
          ]),
          "hot",
        ),
        cursor: s.string("Pagination cursor from the previous page."),
      },
      { required: ["topicId"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_share_link_resolution",
    method: "GET",
    path: "/api/xiaohongshu/share-url-transfer/v1",
    authLocation: "query",
    description:
      "Resolve a supported Xiaohongshu (RedNote) short share link and return its public redirect URL. Use it to expand shared links before subsequent Xiaohongshu content lookup or processing.",
    inputSchema: s.object(
      "Input for Xiaohongshu (RedNote) Share Link Resolution.",
      {
        shareUrl: s.string(
          "A Xiaohongshu (RedNote) short share URL beginning with http://xhslink.com/ or https://xhslink.com/.",
          { minLength: 1 },
        ),
      },
      { required: ["shareUrl"] },
    ),
  },
  {
    name: "douyin_tiktok_china_video_search",
    method: "GET",
    path: "/api/douyin/search-video/v4",
    authLocation: "query",
    description:
      "Searches Douyin (TikTok China) videos by keyword with sort, publish-time, duration, and page filters; later pages require the previous search ID. Use it to support content discovery and trend research.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) Video Search.",
      {
        keyword: s.string("The search keyword.", { minLength: 1 }),
        sortType: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting criteria for search results.\n\nAvailable Values:\n- `_0`: General\n- `_1`: More likes\n- `_2`: Newest",
            ),
            ["_0", "_1", "_2"],
          ),
          "_0",
        ),
        publishTime: s.withDefault(
          s.withEnum(
            s.string(
              "Filter by video publish time range.\n\nAvailable Values:\n- `_0`: No Limit\n- `_1`: Last 24 Hours\n- `_7`: Last 7 Days\n- `_180`: Last 6 Months",
            ),
            ["_0", "_1", "_7", "_180"],
          ),
          "_0",
        ),
        duration: s.withDefault(
          s.withEnum(
            s.string(
              "Filter by video duration.\n\nAvailable Values:\n- `_0`: No Limit\n- `_1`: Under 1 Minute\n- `_2`: 1-5 Minutes\n- `_3`: Over 5 Minutes",
            ),
            ["_0", "_1", "_2", "_3"],
          ),
          "_0",
        ),
        page: s.withDefault(s.integer("Page number (starting from 1)."), 1),
        searchId: s.string(
          "Search ID; required for pages > 1. Use data.business_config.next_page.search_id from the previous response, and stop paging when data.business_config.has_more is 0.",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "douyin_tiktok_china_image_post_search",
    method: "GET",
    path: "/api/douyin/search-image/v1",
    authLocation: "query",
    description:
      "Searches Douyin (TikTok China) image posts by keyword with search-session pagination. Omit searchId for the first page, then use the search ID from the previous response to continue. Use it for visual-content discovery and topic research.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) Image Post Search.",
      {
        keyword: s.string("The search keyword.", { minLength: 1 }),
        searchId: s.withDefault(
          s.string("Search ID returned by the previous response. Leave it empty for the first page."),
          "",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "douyin_tiktok_china_hot_search",
    method: "GET",
    path: "/api/douyin/hot-search/v1",
    authLocation: "query",
    description:
      "Searches Douyin (TikTok China) content with optional keyword, category, video-type, ranking, pagination, engagement, and creator-follower filters. Use it to support trend discovery and campaign research.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) Hot Search.",
      {
        keyword: s.string("Optional search keyword."),
        contentType: s.withDefault(
          s.withEnum(
            s.string(
              "Top-level content type. Only one content type can be selected.\n\nAvailable Values:\n- `ALL`: All content types.\n- `FASHION`: Fashion.\n- `TECHNOLOGY`: Technology.\n- `SCIENCE`: Science.\n- `PHOTOGRAPHY`: Photography and videography.\n- `FOOD`: Food.\n- `MOTHER_BABY`: Mother and baby.\n- `PARENTING`: Parenting.\n- `DRAMA`: Drama.\n- `GAME`: Game.\n- `AUTOMOTIVE`: Automotive.\n- `ANIMAL`: Animal.\n- `TRAVEL`: Travel.\n- `DANCE`: Dance.\n- `TRADITIONAL_CULTURE`: Traditional culture.\n- `ART`: Art.\n- `SPORTS`: Sports.\n- `MUSIC`: Music.\n- `LIFE_RECORD`: Life records.\n- `HOME_LIVING`: Home and living.\n- `LEISURE_ENTERTAINMENT`: Leisure entertainment.\n- `WORKPLACE`: Workplace.\n- `AGRICULTURE`: Agriculture.\n- `CASUAL`: Casual videos.\n- `ACG`: Animation, comics, and games.\n- `MOVIE`: Movie.\n- `TV_SERIES`: TV series.\n- `VARIETY_SHOW`: Variety show.\n- `CELEBRITY`: Celebrity.\n- `HUMANITIES_SOCIAL_SCIENCE`: Humanities and social science.\n- `EDUCATION_CAMPUS`: Education and campus.\n- `EMOTION`: Emotion.\n- `FINANCE`: Finance.\n- `PUBLIC_WELFARE`: Public welfare.",
            ),
            [
              "ALL",
              "FASHION",
              "TECHNOLOGY",
              "SCIENCE",
              "PHOTOGRAPHY",
              "FOOD",
              "MOTHER_BABY",
              "PARENTING",
              "DRAMA",
              "GAME",
              "AUTOMOTIVE",
              "ANIMAL",
              "TRAVEL",
              "DANCE",
              "TRADITIONAL_CULTURE",
              "ART",
              "SPORTS",
              "MUSIC",
              "LIFE_RECORD",
              "HOME_LIVING",
              "LEISURE_ENTERTAINMENT",
              "WORKPLACE",
              "AGRICULTURE",
              "CASUAL",
              "ACG",
              "MOVIE",
              "TV_SERIES",
              "VARIETY_SHOW",
              "CELEBRITY",
              "HUMANITIES_SOCIAL_SCIENCE",
              "EDUCATION_CAMPUS",
              "EMOTION",
              "FINANCE",
              "PUBLIC_WELFARE",
            ],
          ),
          "ALL",
        ),
        videoType: s.withDefault(
          s.withEnum(
            s.string(
              "Video type filter.\n\nAvailable Values:\n- `ALL`: All video types.\n- `XINGTU_VIDEO`: Xingtu commercial videos.\n- `NATURAL_VIDEO`: Natural videos.",
            ),
            ["ALL", "XINGTU_VIDEO", "NATURAL_VIDEO"],
          ),
          "ALL",
        ),
        sortType: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting criteria for hot content results.\n\nAvailable Values:\n- `COMPREHENSIVE`: Comprehensive ranking.\n- `HIGH_INTERACTION`: Highest interaction count.\n- `HIGH_LIKE`: Highest like count.\n- `HIGH_COMMENT`: Highest comment count.\n- `HIGH_SHARE`: Highest share count.",
            ),
            ["COMPREHENSIVE", "HIGH_INTERACTION", "HIGH_LIKE", "HIGH_COMMENT", "HIGH_SHARE"],
          ),
          "COMPREHENSIVE",
        ),
        page: s.withDefault(s.integer("Page number (starting from 1). Page size is fixed at 10."), 1),
        likeCountMin: s.integer("Minimum raw like count."),
        likeCountMax: s.integer("Maximum raw like count."),
        commentCountMin: s.integer("Minimum raw comment count."),
        commentCountMax: s.integer("Maximum raw comment count."),
        shareCountMin: s.integer("Minimum raw share count."),
        shareCountMax: s.integer("Maximum raw share count."),
        interactionCountMin: s.integer("Minimum raw interaction count."),
        interactionCountMax: s.integer("Maximum raw interaction count."),
        followerCountMin: s.integer("Minimum raw creator follower count."),
        followerCountMax: s.integer("Maximum raw creator follower count."),
      },
      { required: [] },
    ),
  },
  {
    name: "douyin_tiktok_china_user_search",
    method: "GET",
    path: "/api/douyin/search-user/v2",
    authLocation: "query",
    description:
      "Searches Douyin (TikTok China) users by keyword with page-based pagination and optional account-type filtering. Use it to discover creators, brands, or verified accounts for research.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) User Search.",
      {
        keyword: s.string("The search keyword.", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number (starting from 1)."), 1),
        userType: s.withEnum(
          s.string(
            "Filter by user type.\n\nAvailable Values:\n- `common_user`: Common User\n- `enterprise_user`: Enterprise User\n- `personal_user`: Verified Individual User",
          ),
          ["common_user", "enterprise_user", "personal_user"],
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "douyin_tiktok_china_video_details",
    method: "GET",
    path: "/api/douyin/get-video-detail/v2",
    authLocation: "query",
    description:
      "Retrieves details for a Douyin (TikTok China) video by video ID. Use it to look up a known video before content review, archiving, or related analysis.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) Video Details.",
      {
        videoId: s.string("The unique video identifier (aweme_id or model_id).", { minLength: 1 }),
      },
      { required: ["videoId"] },
    ),
  },
  {
    name: "douyin_tiktok_china_video_comments",
    method: "GET",
    path: "/api/douyin/get-video-comment/v1",
    authLocation: "query",
    description:
      "Retrieves top-level comments for a Douyin (TikTok China) video by aweme ID with page-based pagination. Use it to review audience feedback or analyze discussion around a known video.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) Video Comments.",
      {
        awemeId: s.string("The unique video identifier (aweme_id).", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number (starting from 1)."), 1),
      },
      { required: ["awemeId"] },
    ),
  },
  {
    name: "douyin_tiktok_china_comment_replies",
    method: "GET",
    path: "/api/douyin/get-video-sub-comment/v1",
    authLocation: "query",
    description:
      "Retrieves replies to a top-level Douyin (TikTok China) video comment with page-based pagination. Use it to inspect threaded discussions and review feedback under a known comment.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) Comment Replies.",
      {
        commentId: s.string("The unique identifier of the top-level comment.", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number (starting from 1)."), 1),
      },
      { required: ["commentId"] },
    ),
  },
  {
    name: "douyin_tiktok_china_user_profile",
    method: "GET",
    path: "/api/douyin/get-user-detail/v3",
    authLocation: "query",
    description:
      "Retrieves a Douyin (TikTok China) user profile by secUid. Use it to review a known creator or account before monitoring related content or conducting account research.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) User Profile.",
      {
        secUid: s.string("The unique user ID (sec_uid) on Douyin.", { minLength: 1 }),
      },
      { required: ["secUid"] },
    ),
  },
  {
    name: "douyin_tiktok_china_share_link_resolution",
    method: "GET",
    path: "/api/douyin/share-url-transfer/v1",
    authLocation: "query",
    description:
      "Resolve a supported Douyin (TikTok China) short share link that targets a video and return its public redirect URL. Use it to expand video links before subsequent Douyin content lookup or processing.",
    inputSchema: s.object(
      "Input for Douyin (TikTok China) Share Link Resolution.",
      {
        shareUrl: s.string("A Douyin short share URL beginning with https://v.douyin.com/.", {
          minLength: 1,
        }),
      },
      { required: ["shareUrl"] },
    ),
  },
  {
    name: "kuaishou_video_search",
    method: "GET",
    path: "/api/kuaishou/search-video/v2",
    authLocation: "query",
    description:
      "Search public Kuaishou videos by keyword with page-number pagination. Use it to discover relevant videos and browse results by page.",
    inputSchema: s.object(
      "Input for Kuaishou Video Search.",
      {
        keyword: s.string("The search keyword to find videos.", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number for results, starting from 1."), 1),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "kuaishou_user_search",
    method: "GET",
    path: "/api/kuaishou/search-user/v2",
    authLocation: "query",
    description:
      "Search public Kuaishou user accounts by keyword with page-number pagination. Use it to discover relevant creators or accounts before requesting profile and published-video data.",
    inputSchema: s.object(
      "Input for Kuaishou User Search.",
      {
        keyword: s.string("The search keyword to find users.", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number for results, starting from 1."), 1),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "kuaishou_user_published_videos",
    method: "GET",
    path: "/api/kuaishou/get-user-video-list/v2",
    authLocation: "query",
    description:
      "Retrieve public videos published by a Kuaishou user, with optional cursor-based pagination. Use it to review a creator's content history or select videos for detail and comment requests.",
    inputSchema: s.object(
      "Input for Kuaishou User Published Videos.",
      {
        userId: s.string("The unique user ID on Kuaishou.", { minLength: 1 }),
        pcursor: s.string("Pagination cursor for subsequent pages."),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "kuaishou_video_details",
    method: "GET",
    path: "/api/kuaishou/get-video-detail/v2",
    authLocation: "query",
    description:
      "Retrieve public details for a Kuaishou video identified by its video ID. Use it to inspect a selected video after search or user-published-video discovery.",
    inputSchema: s.object(
      "Input for Kuaishou Video Details.",
      {
        videoId: s.string("The unique video identifier returned by Kuaishou.", { minLength: 1 }),
      },
      { required: ["videoId"] },
    ),
  },
  {
    name: "kuaishou_video_comments",
    method: "GET",
    path: "/api/kuaishou/get-video-comment/v1",
    authLocation: "query",
    description:
      "Retrieve public comments for a Kuaishou video, with optional cursor-based pagination. Use it to review audience discussion and continue through additional comment pages.",
    inputSchema: s.object(
      "Input for Kuaishou Video Comments.",
      {
        videoId: s.string("The Kuaishou video identifier or numeric refer_photo_id returned by a related response.", {
          minLength: 1,
        }),
        pcursor: s.string("Pagination cursor for subsequent pages."),
      },
      { required: ["videoId"] },
    ),
  },
  {
    name: "kuaishou_user_profile",
    method: "GET",
    path: "/api/kuaishou/get-user-detail/v1",
    authLocation: "query",
    description:
      "Retrieve the public profile for a Kuaishou user identified by user ID. Use it to inspect an account found through user or video results.",
    inputSchema: s.object(
      "Input for Kuaishou User Profile.",
      {
        userId: s.string("The unique user ID on Kuaishou.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "kuaishou_share_link_resolution",
    method: "GET",
    path: "/api/kuaishou/share-url-transfer/v1",
    authLocation: "query",
    description:
      "Resolve a supported Kuaishou short share link and return its public redirect URL. Use it to expand shared links before subsequent Kuaishou content lookup or processing.",
    inputSchema: s.object(
      "Input for Kuaishou Share Link Resolution.",
      {
        shareUrl: s.string("A Kuaishou short share URL beginning with https://v.kuaishou.com/.", {
          minLength: 1,
        }),
      },
      { required: ["shareUrl"] },
    ),
  },
  {
    name: "wechat_official_accounts_account_historical_articles",
    method: "POST",
    path: "/api/weixin/get-account-history-articles/v2",
    authLocation: "form",
    description:
      "Retrieves historical articles for a WeChat Official Account identified by ghid or article URL, with an offset cursor from the previous page. Use it to continue through an account's article archive with cursor pagination.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Account Historical Articles.",
      {
        ghid: s.withDefault(
          s.string(
            "WeChat Official Account original identifier, using the gh_ prefix returned by WeChat. Use either ghid or url.",
          ),
          "",
        ),
        url: s.withDefault(
          s.string(
            "WeChat Official Account article URL used to identify the account and fetch historical articles. Use either ghid or url.",
          ),
          "",
        ),
        offset: s.withDefault(
          s.string(
            "PagingInfo.Offset cursor returned by the previous response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      {
        required: [],
        anyOf: [
          { required: ["ghid"], properties: { ghid: { type: "string", minLength: 1 } } },
          { required: ["url"], properties: { url: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "wechat_official_accounts_article_metrics",
    method: "GET",
    path: "/api/weixin/get-article-metrics/v2",
    authLocation: "query",
    description:
      "Retrieves extended interaction metrics for a WeChat Official Account article by URL. Use it to compare article performance or support deeper engagement analysis for known content.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Article Metrics.",
      {
        articleUrl: s.string(
          "WeChat Official Account article URL used to fetch extended interaction and article performance metrics.",
          { minLength: 1 },
        ),
      },
      { required: ["articleUrl"] },
    ),
  },
  {
    name: "wechat_official_accounts_article_details",
    method: "GET",
    path: "/api/weixin/get-article-detail/v5",
    authLocation: "query",
    description:
      "Retrieves lightweight information for a WeChat Official Account article by URL. Use it to perform a quick article lookup before deeper content, metric, or comment retrieval.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Article Details.",
      {
        articleUrl: s.string(
          "WeChat Official Account article URL used to fetch lightweight article metadata and status information.",
          { minLength: 1 },
        ),
      },
      { required: ["articleUrl"] },
    ),
  },
  {
    name: "wechat_official_accounts_article_comments",
    method: "POST",
    path: "/api/weixin/get-article-comment/v1",
    authLocation: "form",
    description:
      "Retrieves top-level comments for a WeChat Official Account article by URL, with an optional buffer cursor for pagination. Use it to review reader discussion or continue through comment pages for a known article.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Article Comments.",
      {
        articleUrl: s.string("WeChat Official Account article URL used to fetch top-level article comments.", {
          minLength: 1,
        }),
        buffer: s.withDefault(
          s.string(
            "Comment pagination buffer returned by the previous response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["articleUrl"] },
    ),
  },
  {
    name: "wechat_official_accounts_article_comment_replies",
    method: "GET",
    path: "/api/weixin/get-article-sub-comment/v1",
    authLocation: "query",
    description:
      "Retrieves replies under a top-level comment for a WeChat Official Account article, identified by article URL and contentId. Use it to inspect threaded discussion beneath a known comment.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Article Comment Replies.",
      {
        articleUrl: s.string("WeChat Official Account article URL used to fetch replies under a top-level comment.", {
          minLength: 1,
        }),
        contentId: s.string("Top-level comment content id used to fetch nested comment replies.", {
          minLength: 1,
        }),
      },
      { required: ["articleUrl", "contentId"] },
    ),
  },
  {
    name: "wechat_official_accounts_article_search",
    method: "POST",
    path: "/api/weixin/search-article/v2",
    authLocation: "form",
    description:
      "Searches WeChat Official Account articles by keyword within a selected category such as followed accounts, latest, recently read, or hot, with continuation pagination. Use it to focus article discovery on a particular result stream.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Article Search.",
      {
        keyword: s.string("Search keyword for categorized WeChat Official Account article web search.", {
          minLength: 1,
        }),
        subSearchType: s.withDefault(
          s.withEnum(
            s.string(
              "Subcategory filter for categorized WeChat Official Account article web search.\n\nAvailable Values:\n- `ALL`: All\n- `FOLLOWED`: Followed accounts\n- `LATEST`: Latest\n- `RECENT_READ`: Recently read\n- `HOT`: Hot",
            ),
            ["ALL", "FOLLOWED", "LATEST", "RECENT_READ", "HOT"],
          ),
          "ALL",
        ),
        currentPage: s.withDefault(
          s.integer("Current page number starting from 1 for WeChat web search pagination."),
          1,
        ),
        offset: s.withDefault(
          s.integer("Search result offset returned by the previous response. Use 0 for the first page."),
          0,
        ),
        cookies_buffer: s.withDefault(
          s.string(
            "Opaque pagination state returned by the previous WeChat web search response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "wechat_official_accounts_mini_program_search",
    method: "POST",
    path: "/api/weixin/search-miniprogram/v1",
    authLocation: "form",
    description:
      "Searches WeChat Mini Programs by keyword with page, offset, and continuation-state pagination. Use it to discover mini programs related to a brand, service, topic, or product.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Mini Program Search.",
      {
        keyword: s.string("Search keyword for WeChat mini program web search.", { minLength: 1 }),
        currentPage: s.withDefault(
          s.integer("Current page number starting from 1 for WeChat web search pagination."),
          1,
        ),
        offset: s.withDefault(
          s.integer("Search result offset returned by the previous response. Use 0 for the first page."),
          0,
        ),
        cookies_buffer: s.withDefault(
          s.string(
            "Opaque pagination state returned by the previous WeChat web search response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "wechat_official_accounts_wechat_index_search",
    method: "GET",
    path: "/api/weixin/search-wechat-index/v1",
    authLocation: "query",
    description:
      "Queries WeChat Index for a keyword. Use it to examine trend interest within WeChat before planning content, campaigns, or further article research.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts WeChat Index Search.",
      {
        keyword: s.string("Keyword used to query WeChat Index trend signals.", { minLength: 1 }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "wechat_official_accounts_search_suggestions",
    method: "GET",
    path: "/api/weixin/search-suggestions/v1",
    authLocation: "query",
    description:
      "Retrieves WeChat search suggestions for a keyword, optionally scoped by a supported business type. Use it to expand or refine a query before a targeted WeChat search.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Search Suggestions.",
      {
        keyword: s.string("Keyword used to fetch WeChat search suggestions.", { minLength: 1 }),
        businessType: s.withDefault(
          s.withEnum(
            s.string(
              "WeChat search business type used to scope suggestion results.\n\nAvailable Values:\n- `ALL`: All\n- `ACCOUNT`: Official accounts\n- `ARTICLE`: Articles\n- `CHANNEL`: Channels\n- `MOMENTS`: Moments\n- `LIVE`: Live\n- `EMOJI`: Emoji\n- `AUDIO`: Audio\n- `BOOK`: Books\n- `WECHAT_INDEX`: WeChat index\n- `NEWS`: News\n- `MINI_PROGRAM`: Mini programs\n- `ENCYCLOPEDIA`: Encyclopedia",
            ),
            [
              "ALL",
              "ACCOUNT",
              "ARTICLE",
              "CHANNEL",
              "MOMENTS",
              "LIVE",
              "EMOJI",
              "AUDIO",
              "BOOK",
              "WECHAT_INDEX",
              "NEWS",
              "MINI_PROGRAM",
              "ENCYCLOPEDIA",
            ],
          ),
          "ALL",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "wechat_official_accounts_account_search",
    method: "POST",
    path: "/api/weixin/search-account/v2",
    authLocation: "form",
    description:
      "Searches WeChat Official Accounts by keyword with page, offset, and continuation-state pagination. Use it to browse broader account results for creator, brand, or publisher discovery.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Account Search.",
      {
        keyword: s.string("Search keyword for WeChat Official Account web search.", {
          minLength: 1,
        }),
        currentPage: s.withDefault(
          s.integer("Current page number starting from 1 for WeChat web search pagination."),
          1,
        ),
        offset: s.withDefault(
          s.integer("Search result offset returned by the previous response. Use 0 for the first page."),
          0,
        ),
        cookies_buffer: s.withDefault(
          s.string(
            "Opaque pagination state returned by the previous WeChat web search response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "wechat_official_accounts_account_original_article_count",
    method: "GET",
    path: "/api/weixin/get-account-original-count/v1",
    authLocation: "query",
    description:
      "Retrieves the original-article count for a WeChat Official Account identified by ghid or article URL. Use it to compare original publishing activity across known accounts.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Account Original Article Count.",
      {
        ghid: s.withDefault(
          s.string(
            "WeChat Official Account original identifier, using the gh_ prefix returned by WeChat. Use either ghid or url.",
          ),
          "",
        ),
        url: s.withDefault(
          s.string("WeChat Official Account article URL used to identify the account. Use either ghid or url."),
          "",
        ),
      },
      {
        required: [],
        anyOf: [
          { required: ["ghid"], properties: { ghid: { type: "string", minLength: 1 } } },
          { required: ["url"], properties: { url: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "wechat_official_accounts_account_principal_info",
    method: "GET",
    path: "/api/weixin/get-account-principal-info/v1",
    authLocation: "query",
    description:
      "Retrieves principal information for a WeChat Official Account identified by biz ID, article URL, or wxid. Use it to review the ownership or operating entity behind a known account.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Account Principal Info.",
      {
        biz: s.withDefault(s.string("WeChat Official Account biz id. Use one of biz, url, or wxid."), ""),
        url: s.withDefault(
          s.string("WeChat Official Account article URL used to identify the account. Use one of biz, url, or wxid."),
          "",
        ),
        wxid: s.withDefault(
          s.string("WeChat Official Account wxid used to identify the account. Use one of biz, url, or wxid."),
          "",
        ),
      },
      { required: [] },
    ),
  },
  {
    name: "wechat_official_accounts_account_basic_info",
    method: "GET",
    path: "/api/weixin/get-account-basic-info/v1",
    authLocation: "query",
    description:
      "Retrieves basic profile information for a WeChat Official Account by account name. Use it to identify or enrich a known account before article, ownership, or publishing research.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Account Basic Info.",
      {
        name: s.string("WeChat Official Account name used to fetch basic profile information.", {
          minLength: 1,
        }),
      },
      { required: ["name"] },
    ),
  },
  {
    name: "wechat_official_accounts_article_link_conversion",
    method: "GET",
    path: "/api/weixin/convert-article-link/v1",
    authLocation: "query",
    description:
      "Expands a WeChat Official Account article link to its resolved long-form destination. Use it to normalize a short or intermediate link before article lookup or collection.",
    inputSchema: s.object(
      "Input for WeChat Official Accounts Article Link Conversion.",
      {
        link: s.string("WeChat Official Account article short link or intermediate link to convert.", { minLength: 1 }),
      },
      { required: ["link"] },
    ),
  },
  {
    name: "wechat_channels_video_search",
    method: "POST",
    path: "/api/weixin-channels/search-video/v2",
    authLocation: "form",
    description:
      "Searches the WeChat Channels video category by keyword with page, offset, and continuation-state controls. Use it to retrieve categorized video results and continue additional pages.",
    inputSchema: s.object(
      "Input for WeChat Channels Video Search.",
      {
        keyword: s.string("Search keyword for categorized WeChat Channels video results.", {
          minLength: 1,
        }),
        currentPage: s.withDefault(
          s.integer("Current page number starting from 1 for WeChat Channels web search pagination."),
          1,
        ),
        offset: s.withDefault(
          s.integer(
            "Search result offset returned by the previous WeChat Channels search response. Use 0 for the first page.",
          ),
          0,
        ),
        cookies_buffer: s.withDefault(
          s.string(
            "Opaque pagination state returned by the previous WeChat Channels web search response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "wechat_channels_account_search",
    method: "POST",
    path: "/api/weixin-channels/search-account/v3",
    authLocation: "query",
    description:
      "Looks up a specific WeChat Channels account identity by keyword. Use it to resolve a creator name or account term to the identifier required by account-video queries.",
    inputSchema: s.object(
      "Input for WeChat Channels Account Search.",
      {
        keyword: s.string("Search keyword used to resolve a WeChat Channels account id.", {
          minLength: 1,
        }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "wechat_channels_account_videos",
    method: "POST",
    path: "/api/weixin-channels/get-account-videos/v1",
    authLocation: "form",
    description:
      "Retrieves a paginated WeChat Channels account feed by v2Name with continuation-buffer support. Use it to browse videos and other feed entries published by a known creator account.",
    inputSchema: s.object(
      "Input for WeChat Channels Account Videos.",
      {
        v2Name: s.string("WeChat Channels account unique id, usually ending with @finder.", {
          minLength: 1,
        }),
        last_buffer: s.withDefault(
          s.string(
            "Pagination buffer returned by the previous WeChat Channels account videos response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["v2Name"] },
    ),
  },
  {
    name: "wechat_channels_get_bound_channel",
    method: "GET",
    path: "/api/weixin-channels/get-bound-channel/v1",
    authLocation: "query",
    description:
      "Finds the WeChat Channels account bound to a WeChat Official Account using either its original ID or an article URL. Use it to connect an official account with its Channels identity.",
    inputSchema: s.object(
      "Input for WeChat Channels Get Bound Channel.",
      {
        ghid: s.withDefault(
          s.string(
            "WeChat Official Account original id used to find the bound WeChat Channels account. Use either ghid or url.",
          ),
          "",
        ),
        url: s.withDefault(
          s.string(
            "WeChat Official Account article URL used to find the bound WeChat Channels account. Use either ghid or url.",
          ),
          "",
        ),
      },
      {
        required: [],
        anyOf: [
          { required: ["ghid"], properties: { ghid: { type: "string", minLength: 1 } } },
          { required: ["url"], properties: { url: { type: "string", minLength: 1 } } },
        ],
      },
    ),
  },
  {
    name: "wechat_channels_video_basic_info",
    method: "GET",
    path: "/api/weixin-channels/get-video-basic-info/v1",
    authLocation: "query",
    description:
      "Resolves a copied WeChat Channels video link, preview URL, or short feed ID to basic video information. Use it to identify a shared Channels video before further lookups.",
    inputSchema: s.object(
      "Input for WeChat Channels Video Basic Info.",
      {
        feedInfo: s.string("WeChat Channels copied video link, finder-preview URL, or short feed id.", {
          minLength: 1,
        }),
      },
      { required: ["feedInfo"] },
    ),
  },
  {
    name: "wechat_channels_video_title",
    method: "GET",
    path: "/api/weixin-channels/get-video-title/v1",
    authLocation: "query",
    description:
      "Retrieves lightweight title information for a WeChat Channels video by object ID and optional nonce ID. Use it to identify known video content without requesting downloadable media.",
    inputSchema: s.object(
      "Input for WeChat Channels Video Title.",
      {
        objectId: s.string("WeChat Channels video object id.", { minLength: 1 }),
        objectNonceId: s.withDefault(
          s.string("Optional WeChat Channels object nonce id. Supplying it can improve lookup accuracy."),
          "",
        ),
      },
      { required: ["objectId"] },
    ),
  },
  {
    name: "wechat_channels_export_id_conversion",
    method: "GET",
    path: "/api/weixin-channels/convert-export-id/v1",
    authLocation: "query",
    description:
      "Converts an encrypted WeChat Channels export ID from search results into a usable video object identity. Use it to prepare the identifier required by video lookup endpoints.",
    inputSchema: s.object(
      "Input for WeChat Channels Export Id Conversion.",
      {
        exportId: s.string("Encrypted WeChat Channels exportId returned by video search results.", {
          minLength: 1,
        }),
      },
      { required: ["exportId"] },
    ),
  },
  {
    name: "wechat_channels_video_download_url",
    method: "GET",
    path: "/api/weixin-channels/get-video-download-url/v1",
    authLocation: "query",
    description:
      "Retrieves a downloadable media URL for a WeChat Channels video by object ID and optional nonce ID. Use it to download or play media from a known Channels video.",
    inputSchema: s.object(
      "Input for WeChat Channels Video Download URL.",
      {
        objectId: s.string("WeChat Channels video object id used to fetch downloadable media links.", { minLength: 1 }),
        objectNonceId: s.withDefault(
          s.string("Optional WeChat Channels object nonce id. Supplying it can improve media lookup accuracy."),
          "",
        ),
      },
      { required: ["objectId"] },
    ),
  },
  {
    name: "wechat_channels_video_metrics",
    method: "POST",
    path: "/api/weixin-channels/get-video-metrics/v1",
    authLocation: "form",
    description:
      "Retrieves interaction metrics for a WeChat Channels video by object ID with optional continuation-buffer input. Use it to review engagement for known video content.",
    inputSchema: s.object(
      "Input for WeChat Channels Video Metrics.",
      {
        objectId: s.string("WeChat Channels video object id used to fetch interaction metrics.", {
          minLength: 1,
        }),
        objectNonceId: s.withDefault(s.string("Optional WeChat Channels object nonce id."), ""),
        last_buffer: s.withDefault(
          s.string(
            "Pagination buffer returned by the previous WeChat Channels metrics response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["objectId"] },
    ),
  },
  {
    name: "wechat_channels_video_comments",
    method: "POST",
    path: "/api/weixin-channels/get-video-comment/v1",
    authLocation: "form",
    description:
      "Retrieves first-level comments for a WeChat Channels video by object ID with continuation-buffer pagination. Use it to review audience discussion on known video content.",
    inputSchema: s.object(
      "Input for WeChat Channels Video Comments.",
      {
        objectId: s.string(
          "WeChat Channels video object id used to fetch first-level comments. If you only have the exportId returned by a video search result, first call the Export Id Conversion (V1) endpoint at /api/weixin-channels/convert-export-id/v1 to convert it to an objectId.",
          { minLength: 1 },
        ),
        objectNonceId: s.withDefault(s.string("Optional WeChat Channels object nonce id."), ""),
        last_buffer: s.withDefault(
          s.string(
            "Pagination buffer returned by the previous first-level WeChat Channels comment response. Leave it empty for the first page. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["objectId"] },
    ),
  },
  {
    name: "wechat_channels_video_sub_comments",
    method: "POST",
    path: "/api/weixin-channels/get-video-sub-comment/v1",
    authLocation: "form",
    description:
      "Retrieves replies under a first-level WeChat Channels video comment using the video and root-comment IDs. Use it to continue a threaded comment discussion with buffer pagination.",
    inputSchema: s.object(
      "Input for WeChat Channels Video Sub Comments.",
      {
        objectId: s.string("WeChat Channels video object id used to fetch second-level comment replies.", {
          minLength: 1,
        }),
        rootCommentId: s.string(
          "Root first-level comment id returned by the WeChat Channels video comments endpoint.",
          { minLength: 1 },
        ),
        last_buffer: s.withDefault(
          s.string(
            "Pagination buffer for WeChat Channels second-level comment replies. Use the first-level comment's last_buffer for the first reply page when present. For this POST endpoint, send it in an application/x-www-form-urlencoded form body.",
          ),
          "",
        ),
      },
      { required: ["objectId", "rootCommentId"] },
    ),
  },
  {
    name: "weibo_keyword_search",
    method: "GET",
    path: "/api/weibo/search-all/v2",
    authLocation: "query",
    description:
      "Searches Weibo posts by keyword within a required day-and-hour time range, with page-based pagination, hot or time sorting, and filters for pictures, video, music, or links. Use it to find time-bounded posts for topic research or monitoring.",
    inputSchema: s.object(
      "Input for Weibo Keyword Search.",
      {
        q: s.string("Search Keywords.", { minLength: 1 }),
        startDay: s.string("Start Day (yyyy-MM-dd).", { minLength: 1 }),
        startHour: s.integer("Start Hour (0-23)."),
        endDay: s.string("End Day (yyyy-MM-dd).", { minLength: 1 }),
        endHour: s.integer("End Hour (0-23)."),
        hotSort: s.withDefault(s.boolean("Hot sort, true for hot sort, false for time sort. Default is false."), false),
        contains: s.withDefault(
          s.withEnum(
            s.string(
              "Contains filter for the result set.\n\nAvailable Values:\n- `ALL`: All\n- `PICTURE`: Has Picture\n- `VIDEO`: Has Video\n- `MUSIC`: Has Music\n- `LINK`: Has Link",
            ),
            ["ALL", "PICTURE", "VIDEO", "MUSIC", "LINK"],
          ),
          "ALL",
        ),
        page: s.withDefault(s.integer("Page number, starting with 1."), 1),
      },
      { required: ["q", "startDay", "startHour", "endDay", "endHour"] },
    ),
  },
  {
    name: "weibo_post_details",
    method: "GET",
    path: "/api/weibo/get-weibo-detail/v1",
    authLocation: "query",
    description:
      "Retrieves details for a Weibo post identified by its post ID. Use it to look up a known post for content review, archiving, or related engagement analysis.",
    inputSchema: s.object(
      "Input for Weibo Post Details.",
      {
        id: s.string("Weibo post ID.", { minLength: 1 }),
      },
      { required: ["id"] },
    ),
  },
  {
    name: "weibo_user_profile",
    method: "GET",
    path: "/api/weibo/get-user-detail/v3",
    authLocation: "query",
    description:
      "Retrieves a Weibo user profile identified by UID. Use it to look up a known account for creator research, profile review, or subsequent retrieval of that user's posts and videos.",
    inputSchema: s.object(
      "Input for Weibo User Profile.",
      {
        uid: s.string("Weibo User ID (UID).", { minLength: 1 }),
      },
      { required: ["uid"] },
    ),
  },
  {
    name: "weibo_user_fans",
    method: "GET",
    path: "/api/weibo/get-fans/v1",
    authLocation: "query",
    description:
      "Retrieves a page of fan accounts that follow a Weibo user identified by UID. Use it to browse the account's follower audience or continue through its fan list.",
    inputSchema: s.object(
      "Input for Weibo User Fans.",
      {
        uid: s.string("Weibo User ID (UID).", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number, starting with 1."), 1),
      },
      { required: ["uid"] },
    ),
  },
  {
    name: "weibo_user_followers",
    method: "GET",
    path: "/api/weibo/get-followers/v1",
    authLocation: "query",
    description:
      "Retrieves a page of accounts followed by a Weibo user identified by UID. Use it to examine the account's outgoing follow network or continue through its following list.",
    inputSchema: s.object(
      "Input for Weibo User Followers.",
      {
        uid: s.string("Weibo User ID (UID).", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number, starting with 1."), 1),
      },
      { required: ["uid"] },
    ),
  },
  {
    name: "weibo_user_published_posts",
    method: "GET",
    path: "/api/weibo/get-user-post/v1",
    authLocation: "query",
    description:
      "Retrieves posts published by a Weibo user identified by UID, using page numbers and a required sinceId cursor after the first page. Use it to browse an account's posting history or continue through its post feed.",
    inputSchema: s.object(
      "Input for Weibo User Published Posts.",
      {
        uid: s.string("Weibo User ID (UID).", { minLength: 1 }),
        page: s.withDefault(s.integer("Page number, starting with 1."), 1),
        sinceId: s.string("Pagination cursor (since_id). Required if page > 1."),
      },
      { required: ["uid"] },
    ),
  },
  {
    name: "weibo_user_video_list",
    method: "GET",
    path: "/api/weibo/get-user-video-list/v1",
    authLocation: "query",
    description:
      "Retrieves a Weibo user's video waterfall feed by UID, with an optional cursor from a prior response. Use it to browse videos published by a known account or continue through its video feed.",
    inputSchema: s.object(
      "Input for Weibo User Video List.",
      {
        uid: s.string("Weibo User ID (UID).", { minLength: 1 }),
        cursor: s.string("Pagination cursor returned by the previous response."),
      },
      { required: ["uid"] },
    ),
  },
  {
    name: "weibo_tv_video_details",
    method: "GET",
    path: "/api/weibo/tv-component/v1",
    authLocation: "query",
    description:
      "Retrieves Weibo TV video details for a colon-delimited object ID (OID). Use it to look up a known TV video for content review, cataloging, or downstream processing.",
    inputSchema: s.object(
      "Input for Weibo TV Video Details.",
      {
        oid: s.string("Weibo video/object ID.", { minLength: 1 }),
      },
      { required: ["oid"] },
    ),
  },
  {
    name: "weibo_hot_search",
    method: "GET",
    path: "/api/weibo/hot-search/v1",
    authLocation: "query",
    description:
      "Retrieves the current Weibo hot-search ranking. Use it to identify trending topics for newsroom monitoring, content planning, or timely topic discovery.",
    inputSchema: s.object("Input for Weibo Hot Search.", {}, { required: [] }),
  },
  {
    name: "weibo_post_comments",
    method: "GET",
    path: "/api/weibo/get-post-comments/v1",
    authLocation: "query",
    description:
      "Retrieves comments for a Weibo post identified by MID, with optional maxId cursor pagination and time or hot sorting. Use it to review audience discussion, continue through comment pages, or support moderation and feedback analysis.",
    inputSchema: s.object(
      "Input for Weibo Post Comments.",
      {
        mid: s.string("Weibo post mid.", { minLength: 1 }),
        sort: s.withDefault(
          s.withEnum(s.string("Sort order for the result set.\n\nAvailable Values:\n- `TIME`: Time\n- `HOT`: Hot"), [
            "TIME",
            "HOT",
          ]),
          "TIME",
        ),
        maxId: s.string("Pagination cursor returned by the previous response."),
      },
      { required: ["mid"] },
    ),
  },
  {
    name: "weibo_search_user_published_posts",
    method: "GET",
    path: "/api/weibo/search-profile/v1",
    authLocation: "query",
    description:
      "Searches posts published by a specific Weibo user, using a keyword, optional date range, and page-based pagination. Use it to find historical posts from a known account for topic research or campaign review.",
    inputSchema: s.object(
      "Input for Weibo Search User Published Posts.",
      {
        uid: s.string("Weibo User ID (UID).", { minLength: 1 }),
        q: s.string("Search Keywords.", { minLength: 1 }),
        startDay: s.string("Start Day (yyyy-MM-dd)."),
        endDay: s.string("End Day (yyyy-MM-dd)."),
        page: s.withDefault(s.integer("Page number, starting with 1."), 1),
      },
      { required: ["uid", "q"] },
    ),
  },
  {
    name: "bilibili_video_details",
    method: "GET",
    path: "/api/bilibili/get-video-detail/v2",
    authLocation: "query",
    description:
      "Retrieves details for a Bilibili video identified by its BVID. Use it to look up a known video for content review, cataloging, or subsequent engagement analysis.",
    inputSchema: s.object(
      "Input for Bilibili Video Details.",
      {
        bvid: s.string("Bilibili Video ID (BVID).", { minLength: 1 }),
      },
      { required: ["bvid"] },
    ),
  },
  {
    name: "bilibili_user_published_videos",
    method: "GET",
    path: "/api/bilibili/get-user-video-list/v2",
    authLocation: "query",
    description:
      "Retrieves videos published by a Bilibili user identified by UID, with an optional continuation parameter from a prior response. Use it to browse a creator's uploads or continue through their video list.",
    inputSchema: s.object(
      "Input for Bilibili User Published Videos.",
      {
        uid: s.string("Bilibili User ID (UID).", { minLength: 1 }),
        param: s.string("Pagination parameter from previous response."),
      },
      { required: ["uid"] },
    ),
  },
  {
    name: "bilibili_user_profile",
    method: "GET",
    path: "/api/bilibili/get-user-detail/v2",
    authLocation: "query",
    description:
      "Retrieves a Bilibili user profile identified by UID. Use it to look up a known account for creator research, profile review, or subsequent retrieval of that user's videos.",
    inputSchema: s.object(
      "Input for Bilibili User Profile.",
      {
        uid: s.string("Bilibili User ID (UID).", { minLength: 1 }),
      },
      { required: ["uid"] },
    ),
  },
  {
    name: "bilibili_video_danmaku",
    method: "GET",
    path: "/api/bilibili/get-video-danmu/v2",
    authLocation: "query",
    description:
      "Retrieves one page of danmaku comments for a Bilibili video segment identified by AID and CID. Use it to review time-synchronized audience reactions or page through danmaku for a known video.",
    inputSchema: s.object(
      "Input for Bilibili Video Danmaku.",
      {
        aid: s.string("Bilibili Archive ID (AID).", { minLength: 1 }),
        cid: s.string("Bilibili Chat ID (CID).", { minLength: 1 }),
        page: s.string("Page number for pagination."),
      },
      { required: ["aid", "cid"] },
    ),
  },
  {
    name: "bilibili_video_comments",
    method: "GET",
    path: "/api/bilibili/get-video-comment/v2",
    authLocation: "query",
    description:
      "Retrieves comments for a Bilibili video identified by AID, with optional cursor pagination. Use it to review audience discussion, continue through comment pages, or support comment moderation and analysis.",
    inputSchema: s.object(
      "Input for Bilibili Video Comments.",
      {
        aid: s.string("Bilibili Archive ID (AID).", { minLength: 1 }),
        cursor: s.string("Pagination cursor."),
      },
      { required: ["aid"] },
    ),
  },
  {
    name: "bilibili_video_search",
    method: "GET",
    path: "/api/bilibili/search-video/v2",
    authLocation: "query",
    description:
      "Searches Bilibili videos by keyword with page-based pagination and sorting by general ranking, play count, publish time, danmaku count, or favorites. Use it to support content discovery, topic research, or ranking-focused searches.",
    inputSchema: s.object(
      "Input for Bilibili Video Search.",
      {
        keyword: s.string("Search keyword.", { minLength: 1 }),
        page: s.string("Page number for pagination."),
        order: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting criteria for search results.\n\nAvailable Values:\n- `general`: General\n- `click`: Most Played\n- `pubdate`: Latest\n- `dm`: Most Danmaku\n- `stow`: Most Favorite",
            ),
            ["general", "click", "pubdate", "dm", "stow"],
          ),
          "general",
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "bilibili_share_link_resolution",
    method: "GET",
    path: "/api/bilibili/share-url-transfer/v1",
    authLocation: "query",
    description:
      "Resolve a supported Bilibili short share link that targets a video and return its public redirect URL. Use it to expand video links before subsequent Bilibili content lookup or processing.",
    inputSchema: s.object(
      "Input for Bilibili Share Link Resolution.",
      {
        shareUrl: s.string("A Bilibili short share URL beginning with https://b23.tv/.", {
          minLength: 1,
        }),
      },
      { required: ["shareUrl"] },
    ),
  },
  {
    name: "bilibili_user_relation_stats",
    method: "GET",
    path: "/api/bilibili/get-user-relation-stat/v1",
    authLocation: "query",
    description:
      "Retrieves relation statistics for a Bilibili user identified by WMID. Use it to compare audience relationships across creator accounts or track relation-count changes for a known user.",
    inputSchema: s.object(
      "Input for Bilibili User Relation Stats.",
      {
        wmid: s.string("Bilibili User ID (WMID).", { minLength: 1 }),
      },
      { required: ["wmid"] },
    ),
  },
  {
    name: "bilibili_video_captions",
    method: "GET",
    path: "/api/bilibili/get-video-caption/v2",
    authLocation: "query",
    description:
      "Retrieves caption data for a Bilibili video segment identified by BVID, AID, and CID. Use it to obtain subtitles for transcript extraction, accessibility review, or language-focused content analysis.",
    inputSchema: s.object(
      "Input for Bilibili Video Captions.",
      {
        bvid: s.string("Bilibili Video ID (BVID).", { minLength: 1 }),
        aid: s.string("Bilibili AID.", { minLength: 1 }),
        cid: s.string("Bilibili CID.", { minLength: 1 }),
      },
      { required: ["bvid", "aid", "cid"] },
    ),
  },
  {
    name: "toutiao_article_details",
    method: "GET",
    path: "/api/toutiao/get-article-detail/v1",
    authLocation: "query",
    description:
      "Retrieves details for a Toutiao article identified by its article ID. Use it to look up a known article for content review, archiving, or related media analysis.",
    inputSchema: s.object(
      "Input for Toutiao Article Details.",
      {
        id: s.string("The unique identifier of the Toutiao article.", { minLength: 1 }),
      },
      { required: ["id"] },
    ),
  },
  {
    name: "toutiao_video_details",
    method: "GET",
    path: "/api/toutiao/get-video-detail/v1",
    authLocation: "query",
    description:
      "Retrieves details for a Toutiao video identified by its video ID. Use it to look up a known video for content review, archiving, or related media analysis.",
    inputSchema: s.object(
      "Input for Toutiao Video Details.",
      {
        videoId: s.string("The unique identifier of the Toutiao video.", { minLength: 1 }),
      },
      { required: ["videoId"] },
    ),
  },
  {
    name: "toutiao_user_profile",
    method: "GET",
    path: "/api/toutiao/get-user-detail/v1",
    authLocation: "query",
    description:
      "Retrieves a Toutiao user profile identified by user ID. Use it to look up a known account for creator research, profile review, or related article analysis.",
    inputSchema: s.object(
      "Input for Toutiao User Profile.",
      {
        userId: s.string("The unique identifier of the Toutiao user.", { minLength: 1 }),
      },
      { required: ["userId"] },
    ),
  },
  {
    name: "toutiao_user_id",
    method: "GET",
    path: "/api/toutiao/get-user-id/v1",
    authLocation: "query",
    description:
      "Resolves the user ID associated with a Toutiao profile URL. Use it to convert a known profile link into the identifier required for subsequent user-profile lookups.",
    inputSchema: s.object(
      "Input for Toutiao User ID.",
      {
        userProfileUrl: s.string("The Toutiao user profile URL used to resolve the user ID.", {
          minLength: 1,
        }),
      },
      { required: ["userProfileUrl"] },
    ),
  },
  {
    name: "toutiao_web_keyword_search",
    method: "GET",
    path: "/api/toutiao/search/v2",
    authLocation: "query",
    description:
      "Searches Toutiao web articles by keyword. Use it to discover relevant articles for topic research, media monitoring, or source collection.",
    inputSchema: s.object(
      "Input for Toutiao Web Keyword Search.",
      {
        keyword: s.string("Search keyword or query.", { minLength: 1 }),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "zhihu_column_article_details",
    method: "GET",
    path: "/api/zhihu/get-column-article-detail/v1",
    authLocation: "query",
    description:
      "Retrieve details for a Zhihu column article identified by article ID. Use it to inspect a known article for reading, review, or archiving.",
    inputSchema: s.object(
      "Input for Zhihu Column Article Details.",
      {
        id: s.string("Article ID", { minLength: 1 }),
      },
      { required: ["id"] },
    ),
  },
  {
    name: "zhihu_answer_list",
    method: "GET",
    path: "/api/zhihu/get-answer-list/v1",
    authLocation: "query",
    description:
      "Retrieve answers for a Zhihu question with sorting and pagination controls. Use it to browse responses to a known question and continue through additional answer pages.",
    inputSchema: s.object(
      "Input for Zhihu Answer List.",
      {
        questionId: s.string("Question ID", { minLength: 1 }),
        cursor: s.withDefault(s.string("Pagination cursor from previous result."), ""),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
        order: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting criteria for answers.\n\nAvailable Values:\n- `_default`: Default sorting.\n- `_updated`: Sorted by updated time.",
            ),
            ["_default", "_updated"],
          ),
          "_updated",
        ),
        sessionId: s.withDefault(s.string("Session ID from previous result."), ""),
      },
      { required: ["questionId"] },
    ),
  },
  {
    name: "zhihu_keyword_search",
    method: "GET",
    path: "/api/zhihu/search/v1",
    authLocation: "query",
    description:
      "Search Zhihu by keyword with optional result-type, sort, time-interval, topic-display, and offset controls. Use it to find relevant answers, articles, or videos.",
    inputSchema: s.object(
      "Input for Zhihu Keyword Search.",
      {
        keyword: s.string("Search keywords.", { minLength: 1 }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
        showAllTopics: s.withDefault(
          s.withEnum(
            s.string(
              "Whether to show all topics.\n\nAvailable Values:\n- `FALSE`: Do not show topics.\n- `TRUE`: Show all topics.",
            ),
            ["FALSE", "TRUE"],
          ),
          "FALSE",
        ),
        vertical: s.withEnum(
          s.string(
            "Result type filter.\n\nAvailable Values:\n- `answer`: Answers only.\n- `article`: Articles only.\n- `zvideo`: Videos only.",
          ),
          ["answer", "article", "zvideo"],
        ),
        sort: s.withEnum(
          s.string(
            "Sorting criteria.\n\nAvailable Values:\n- `upvoted_count`: Most upvoted.\n- `created_time`: Latest published.",
          ),
          ["upvoted_count", "created_time"],
        ),
        timeInterval: s.withEnum(
          s.string(
            "Publish time interval filter.\n\nAvailable Values:\n- `a_day`: Within one day.\n- `a_week`: Within one week.\n- `a_month`: Within one month.\n- `three_months`: Within three months.\n- `half_a_year`: Within half a year.\n- `a_year`: Within one year.",
          ),
          ["a_day", "a_week", "a_month", "three_months", "half_a_year", "a_year"],
        ),
      },
      { required: ["keyword"] },
    ),
  },
  {
    name: "zhihu_column_article_list",
    method: "GET",
    path: "/api/zhihu/get-column-article-list/v1",
    authLocation: "query",
    description:
      "Retrieve articles from a Zhihu column with offset pagination. Use it to browse a known column's publication history and select articles for detail lookup.",
    inputSchema: s.object(
      "Input for Zhihu Column Article List.",
      {
        columnId: s.string("Column ID", { minLength: 1 }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
      },
      { required: ["columnId"] },
    ),
  },
  {
    name: "zhihu_user_info",
    method: "GET",
    path: "/api/zhihu/get-user-info/v1",
    authLocation: "query",
    description:
      "Retrieve the public profile for a Zhihu user identified by URL token. Use it to inspect an account found through Zhihu content or relationship data.",
    inputSchema: s.object(
      "Input for Zhihu User Info.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_user_followees",
    method: "GET",
    path: "/api/zhihu/get-user-followees/v1",
    authLocation: "query",
    description:
      "Retrieve accounts followed by a Zhihu user, with offset pagination. Use it to explore the outgoing connections of a known account.",
    inputSchema: s.object(
      "Input for Zhihu User Followees.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_user_followers",
    method: "GET",
    path: "/api/zhihu/get-user-followers/v1",
    authLocation: "query",
    description:
      "Retrieve accounts that follow a Zhihu user, with offset pagination. Use it to explore the audience connections of a known account.",
    inputSchema: s.object(
      "Input for Zhihu User Followers.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_user_articles",
    method: "GET",
    path: "/api/zhihu/get-user-articles/v1",
    authLocation: "query",
    description:
      "Retrieve articles published by a Zhihu user with offset pagination and publish-time or upvote sorting. Use it to browse a creator's articles in the selected order.",
    inputSchema: s.object(
      "Input for Zhihu User Articles.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
        sortType: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting criteria for user articles.\n\nAvailable Values:\n- `created`: Sort by publish time.\n- `voteups`: Sort by upvote count.",
            ),
            ["created", "voteups"],
          ),
          "created",
        ),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_user_included_articles",
    method: "GET",
    path: "/api/zhihu/get-user-included-articles/v1",
    authLocation: "query",
    description:
      "Retrieve the included-article records exposed for a Zhihu user, with offset pagination. Use it to browse that account's included-article list.",
    inputSchema: s.object(
      "Input for Zhihu User Included Articles.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_user_follow_columns",
    method: "GET",
    path: "/api/zhihu/get-user-follow-columns/v1",
    authLocation: "query",
    description:
      "Retrieve Zhihu columns followed by a user, with offset pagination. Use it to browse the columns associated with a known account's follow activity.",
    inputSchema: s.object(
      "Input for Zhihu User Follow Columns.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_user_follow_collections",
    method: "GET",
    path: "/api/zhihu/get-user-follow-collections/v1",
    authLocation: "query",
    description:
      "Retrieve Zhihu collections followed by a user, with offset pagination. Use it to browse the collections associated with a known account's follow activity.",
    inputSchema: s.object(
      "Input for Zhihu User Follow Collections.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_user_follow_topics",
    method: "GET",
    path: "/api/zhihu/get-user-follow-topics/v1",
    authLocation: "query",
    description:
      "Retrieve Zhihu topics followed by a user, with offset pagination. Use it to browse the topics associated with a known account's follow activity.",
    inputSchema: s.object(
      "Input for Zhihu User Follow Topics.",
      {
        userUrlToken: s.string("Zhihu user URL token, such as the value in `zhihu.com/people/{userUrlToken}`.", {
          minLength: 1,
        }),
        offset: s.withDefault(s.integer("Start offset, begins with 0."), 0),
      },
      { required: ["userUrlToken"] },
    ),
  },
  {
    name: "zhihu_answer_comments",
    method: "GET",
    path: "/api/zhihu/get-answer-comments/v1",
    authLocation: "query",
    description:
      "Retrieve comments for a Zhihu answer with hottest or latest sorting and offset pagination. Use it to review discussion around a known answer and continue through additional comment pages.",
    inputSchema: s.object(
      "Input for Zhihu Answer Comments.",
      {
        answerId: s.string("Answer ID", { minLength: 1 }),
        orderBy: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting order for comments.\n\nAvailable Values:\n- `score`: Sort by highest score.\n- `ts`: Sort by latest time.",
            ),
            ["score", "ts"],
          ),
          "score",
        ),
        offset: s.withDefault(s.string("Pagination offset from the previous result."), ""),
      },
      { required: ["answerId"] },
    ),
  },
  {
    name: "zhihu_comment_replies",
    method: "GET",
    path: "/api/zhihu/get-comment-replies/v1",
    authLocation: "query",
    description:
      "Retrieve replies to a Zhihu comment with hottest or latest sorting and offset pagination. Use it to follow discussion under a known comment and continue through additional reply pages.",
    inputSchema: s.object(
      "Input for Zhihu Comment Replies.",
      {
        commentId: s.string("Comment ID", { minLength: 1 }),
        orderBy: s.withDefault(
          s.withEnum(
            s.string(
              "Sorting order for replies.\n\nAvailable Values:\n- `score`: Sort by highest score.\n- `ts`: Sort by latest time.",
            ),
            ["score", "ts"],
          ),
          "score",
        ),
        offset: s.withDefault(s.string("Pagination offset from the previous result."), ""),
      },
      { required: ["commentId"] },
    ),
  },
  {
    name: "wechat_channels_video_share_url",
    method: "GET",
    path: "/api/weixin-channels/get-video-share-url/v1",
    authLocation: "query",
    description:
      "Generates a share link for a WeChat Channels video identified by objectId. Use it to share a known Channels video or obtain its link for a subsequent lookup.",
    inputSchema: s.object(
      "Video Share URL input.",
      {
        objectId: s.string("WeChat Channels video objectId as a numeric string of up to 32 digits.", {
          maxLength: 32,
          pattern: "^[0-9]+$",
        }),
      },
      { required: ["objectId"] },
    ),
  },
  {
    name: "xiaohongshu_rednote_user_favorited_notes",
    method: "GET",
    path: "/api/xiaohongshu/get-user-faved-note-list/v1",
    authLocation: "query",
    description:
      "Retrieves a Xiaohongshu (RedNote) user's favorited notes by user ID with cursor pagination. Use it to review a user's saved content and research content interests.",
    inputSchema: s.object(
      "User Favorited Notes input.",
      {
        userId: s.string("Unique user identifier on Xiaohongshu."),
        lastCursor: s.string(
          "For the next page, pass the cursor from the previous response. Omit or pass an empty value for the first page.",
          { default: "" },
        ),
      },
      { required: ["userId"] },
    ),
  },
];
