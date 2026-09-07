import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { waybillNoSchema } from "./schemas.ts";

const service = "sf_express";

const registerContactInfoSchema = s.object(
  "The contact used as fallback verification together with check_phone_no.",
  {
    contact: s.nonEmptyString("The contact name (联系人)."),
    province: s.nonEmptyString("The province name."),
    city: s.nonEmptyString("The city name."),
    county: s.nonEmptyString("The district or county name."),
    contact_type: s.stringEnum("Whether this contact is the sender (default) or the recipient.", [
      "sender",
      "recipient",
    ]),
  },
  { optional: ["contact_type"] },
);

/** Actions for the SF Express push-registration endpoints (the customer-callable registrations). */
export const sfExpressPushActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "register_route_push",
    description:
      "Register an SF Express order or waybill for route (tracking) push. Prerequisite: the route push callback must already be configured in the SF console (控制台 → 开发者对接 → 查看API → 路由注册接口 → 配置信息); after registration, SF pushes route updates to that address.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order or waybill to register for route push.",
      {
        register_by: s.stringEnum("Register by client order number (order) or SF waybill number (waybill).", [
          "order",
          "waybill",
        ]),
        attribute_no: s.nonEmptyString("The client order number or SF waybill number to register."),
        check_phone_no: s.string(
          "The last 4 digits of the sender or recipient phone number for phone verification mode.",
          {
            pattern: "^\\d{4}$",
          },
        ),
        contact_info: registerContactInfoSchema,
        language: s.stringEnum("The response language.", ["zh-CN", "zh-TW", "zh-HK", "zh-MO", "en"]),
        country: s.string("The country or region code, for example CN."),
      },
      { optional: ["check_phone_no", "contact_info", "language", "country"] },
    ),
    outputSchema: s.object("The registration result.", {
      registered: s.boolean("Whether the route push registration succeeded."),
      attributeNo: s.string("The registered order or waybill number."),
    }),
  }),
  defineProviderAction(service, {
    name: "register_waybill_picture_push",
    description:
      "Register a waybill for waybill picture push (回单 receipt, 清单 manifest, 拍照回传 photo proof, etc.). SF pushes the AES-encrypted picture to the configured callback once generated; register after the shipment is signed for, because pictures are produced late. The decryption key comes from the SF console (控制台 → 开发者对接 → 查看API → 图片注册及推送接口).",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The waybill picture registration.",
        {
          waybill_no: waybillNoSchema,
          img_type: s.stringEnum(
            "The picture type: 0 其他, 1 清单, 2 回单(非电子回单), 3 第三方, 4 代收货款, 5 电子签收, 6 发票, 7 装箱单, 8 代理报关委托书, 9 合同, 10 报关单, 11 核消单, 12 许可证, 13 同城件拍照上传, 14 开箱验证图片, 15 派送证明, 16 特安托寄物照片, 17 医药图片, 18 丰小哥开箱拍照, 19 nike笼车方案pod单照片, 20 复重图片, 21 派件特安件妥投标记异常, 22 签单返回范本图片, 24 中转复重图片, 25 重货大件入户派件端增加拍照, 71 拍照回传(增值服务 IN91), 122 电子回单(增值服务 IN149, PDF), 182 入仓增值服务图片.",
            [
              "0",
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "10",
              "11",
              "12",
              "13",
              "14",
              "15",
              "16",
              "17",
              "18",
              "19",
              "20",
              "21",
              "22",
              "24",
              "25",
              "71",
              "122",
              "182",
            ],
          ),
          customer_acct_code: s.nonEmptyString(
            "The monthly settlement card number (月结卡号); required when the backend verifies by monthly card (the default).",
          ),
          phone: s.nonEmptyString("The sender or recipient phone number; required when the backend verifies by phone."),
        },
        { optional: ["customer_acct_code", "phone"] },
      ),
      ["customer_acct_code", "phone"],
    ),
    outputSchema: s.object("The registration result.", {
      registered: s.boolean("Whether the picture push registration succeeded."),
      waybillNo: s.string("The registered waybill number."),
      imgType: s.string("The registered picture type."),
    }),
  }),
];
