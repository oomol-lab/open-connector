import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kuaidi100";

const trackingNumberSchema = s.nonEmptyString("The express tracking number (快递单号).");

const timeEstimateCarrierSchema = s.stringEnum(
  "The Kuaidi100 carrier code in lowercase: yuantong (圆通), zhongtong (中通), shunfeng (顺丰), shunfengkuaiyun (顺丰快运), jd (京东), jtexpress (极兔速递), shentong (申通), yunda (韵达), ems (EMS), kuayue (跨越), debangkuaidi (德邦快递), emsguoji (EMS国际件), youzhengguonei (邮政国内), youzhengguoji (国际包裹), zhaijisong (宅急送), zhimakaimen (芝麻开门), lianbangkuaidi (联邦快递), tiandihuayu (天地华宇), annengwuliu (安能快运), jinguangsudikuaijian (京广速递), jiayunmeiwuliu (加运美).",
  [
    "yuantong",
    "zhongtong",
    "shunfeng",
    "shunfengkuaiyun",
    "jd",
    "jtexpress",
    "shentong",
    "yunda",
    "ems",
    "kuayue",
    "debangkuaidi",
    "emsguoji",
    "youzhengguonei",
    "youzhengguoji",
    "zhaijisong",
    "zhimakaimen",
    "lianbangkuaidi",
    "tiandihuayu",
    "annengwuliu",
    "jinguangsudikuaijian",
    "jiayunmeiwuliu",
  ],
);

const priceEstimateCarrierSchema = s.stringEnum(
  "The Kuaidi100 carrier code in lowercase: shunfeng (顺丰), jd (京东), debangkuaidi (德邦快递), yuantong (圆通), zhongtong (中通), shentong (申通), yunda (韵达), ems (EMS).",
  ["shunfeng", "jd", "debangkuaidi", "yuantong", "zhongtong", "shentong", "yunda", "ems"],
);

const orderTimeSchema = s.string(
  "The order placement time in yyyy-MM-dd HH:mm:ss format, for example 2026-09-04 08:08:08. Defaults to the current time when omitted.",
  { pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$" },
);

const expTypeSchema = s.nonEmptyString("The carrier business or product type, such as 标准快递.");

const tipsSchema = s.string("An upstream notice, present when the call consumed the Kuaidi100 free daily quota.");

const trajectoryEventSchema = s.object("One logistics trajectory event.", {
  time: s.string("The event time in yyyy-MM-dd HH:mm:ss format."),
  status: s.string("The event status, such as 揽收, 在途, or 已签收."),
  context: s.string("The event description."),
});

const queryTraceOutputSchema = s.object(
  "The Kuaidi100 logistics trajectory for a tracking number.",
  {
    kuaidiCom: s.string("The Kuaidi100 carrier code handling the shipment."),
    kuaidiName: s.string("The carrier display name."),
    kuaidiNum: s.string("The queried tracking number."),
    state: s.string("The current shipment state, such as 在途 (in transit) or 已签收 (delivered)."),
    fromTo: s.string("The shipment route in origin -> destination form."),
    data: s.array("The logistics trajectory events.", trajectoryEventSchema),
    tips: tipsSchema,
  },
  { optional: ["tips"] },
);

const autoNumberOutputSchema = s.object(
  "The carriers that could own the tracking number.",
  {
    companies: s.array(
      "The candidate carriers for the tracking number.",
      s.object("One candidate carrier.", {
        comCode: s.string("The Kuaidi100 carrier code."),
        name: s.string("The carrier display name."),
        lengthPre: s.string("The tracking number length the carrier uses."),
      }),
    ),
    tips: tipsSchema,
  },
  { optional: ["tips"] },
);

const estimateTimeOutputSchema = s.object(
  "The Kuaidi100 delivery time estimate.",
  {
    fromName: s.string("The normalized origin name."),
    toName: s.string("The normalized destination name."),
    orderTime: s.string("The order time the estimate is based on."),
    arrivalTime: s.string("The estimated arrival time in yyyy-MM-dd HH:mm:ss format."),
    deliveryExpendTime: s.string("The estimated total transit duration in days."),
    remainTime: s.nullableInteger("The remaining transit time in hours, or null when it does not apply."),
    expType: s.nullableString("The business or product type the estimate used."),
    tips: tipsSchema,
  },
  { optional: ["tips"] },
);

const estimatePriceOutputSchema = s.object(
  "The Kuaidi100 shipping price estimate.",
  {
    kuaidicom: s.string("The Kuaidi100 carrier code."),
    kuaidiName: s.string("The carrier display name."),
    from: s.string("The normalized sender address."),
    to: s.string("The normalized recipient address."),
    weight: s.string("The parcel weight in kilograms the estimate used."),
    combos: s.array(
      "The per-product price estimates.",
      s.object("One product price estimate.", {
        expType: s.string("The business or product type."),
        price: s.string("The estimated shipping price in CNY."),
        productName: s.nullableString("The product name when the carrier distinguishes products."),
      }),
    ),
    tips: tipsSchema,
  },
  { optional: ["tips"] },
);

const estimateTimeInputProperties = {
  kuaidi_com: timeEstimateCarrierSchema,
  from_loc: s.nonEmptyString("The origin address, for example 广东省深圳市南山区."),
  to_loc: s.nonEmptyString("The destination address, for example 北京市海淀区."),
  order_time: orderTimeSchema,
  exp_type: expTypeSchema,
};

export const kuaidi100Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_trace",
    description:
      "Query the real-time logistics trajectory for an express tracking number. The carrier is detected automatically.",
    requiredScopes: [],
    inputSchema: s.object(
      "The tracking number whose trajectory should be queried.",
      {
        kuaidi_num: trackingNumberSchema,
        phone: s.nonEmptyString(
          "The sender or recipient phone number; required only for SF Express (顺丰) and ZTO (中通) shipments.",
        ),
      },
      { optional: ["phone"] },
    ),
    outputSchema: queryTraceOutputSchema,
    followUpActions: ["kuaidi100.estimate_time_with_logistic"],
  }),
  defineProviderAction(service, {
    name: "auto_number",
    description: "Detect the likely express carriers for a tracking number from its format.",
    requiredScopes: [],
    inputSchema: s.object("The tracking number to identify.", {
      kuaidi_num: trackingNumberSchema,
    }),
    outputSchema: autoNumberOutputSchema,
    followUpActions: ["kuaidi100.query_trace"],
  }),
  defineProviderAction(service, {
    name: "estimate_time",
    description:
      "Estimate the delivery time for a shipment before it is sent, from the carrier, origin, destination, and optional order time and product type.",
    requiredScopes: [],
    inputSchema: s.object("The shipment whose delivery time should be estimated.", estimateTimeInputProperties, {
      optional: ["order_time", "exp_type"],
    }),
    outputSchema: estimateTimeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "estimate_time_with_logistic",
    description:
      "Estimate the remaining delivery time for an in-transit shipment from its existing logistics trajectory, usually the data returned by kuaidi100.query_trace.",
    requiredScopes: [],
    inputSchema: s.object(
      "The in-transit shipment whose arrival time should be estimated.",
      {
        ...estimateTimeInputProperties,
        logistic: s.array(
          "The historical logistics trajectory events, usually the data returned by kuaidi100.query_trace.",
          trajectoryEventSchema,
          {
            minItems: 1,
          },
        ),
      },
      { optional: ["order_time", "exp_type"] },
    ),
    outputSchema: estimateTimeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "estimate_price",
    description: "Estimate the shipping price for a carrier, sender and recipient addresses, and parcel weight.",
    requiredScopes: [],
    inputSchema: s.object("The shipment whose price should be estimated.", {
      kuaidi_com: priceEstimateCarrierSchema,
      send_addr: s.nonEmptyString("The sender address, for example 北京市海淀区."),
      rec_addr: s.nonEmptyString("The recipient address, for example 广东省深圳市南山区."),
      weight: s.number("The parcel weight in kilograms.", { exclusiveMinimum: 0 }),
    }),
    outputSchema: estimatePriceOutputSchema,
  }),
];
