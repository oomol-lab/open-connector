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

const trajectoryEventSchema = s.requiredObject("One logistics trajectory event.", {
  time: s.string("The event time in yyyy-MM-dd HH:mm:ss format."),
  status: s.string("The event status, such as 揽收, 在途, or 已签收."),
  context: s.string("The event description."),
});

const logisticEventSchema = s.object(
  "One historical logistics trajectory event.",
  {
    time: s.string("The event time in yyyy-MM-dd HH:mm:ss format."),
    context: s.string("The event description."),
    status: s.string("The event status, such as 揽收, 在途, or 已签收."),
  },
  { optional: ["status"] },
);

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
    data: s.array(
      "The candidate carriers for the tracking number.",
      s.requiredObject("One candidate carrier.", {
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
      s.requiredObject("One product price estimate.", {
        expType: s.string("The business or product type."),
        price: s.string("The estimated shipping price in CNY."),
        productName: s.nullableString("The product name when the carrier distinguishes products."),
      }),
    ),
    tips: tipsSchema,
  },
  { optional: ["tips"] },
);

const orderCarrierSchema = s.stringEnum("The carrier code used for pickup orders.", [
  "jd",
  "debangkuaidi",
  "shunfeng",
  "yuantong",
  "zhongtong",
  "shunfengkuaiyun",
  "sxjdfreight",
  "kuayue",
  "ems",
]);
const contactSchema = s.requiredObject("A sender or recipient contact.", {
  name: s.nonEmptyString("The contact name."),
  mobile: s.nonEmptyString("The contact mobile number."),
  address: s.nonEmptyString("The full contact address."),
});
const orderOutputSchema = s.looseObject("The parsed JSON object returned by Kuaidi100.", {
  data: s.unknown("The provider-defined response payload."),
  code: s.string("The provider business status code."),
  message: s.string("The provider response message."),
});

const estimateTimeInputProperties = {
  carrier: timeEstimateCarrierSchema,
  origin: s.nonEmptyString("The origin address, for example 广东省深圳市南山区."),
  destination: s.nonEmptyString("The destination address, for example 北京市海淀区."),
  orderTime: orderTimeSchema,
  productType: expTypeSchema,
};

export const kuaidi100Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_trace",
    operationType: "read",
    description:
      "Query the real-time logistics trajectory for an express tracking number. The carrier is detected automatically.",
    requiredScopes: [],
    inputSchema: s.object(
      "The tracking number whose trajectory should be queried.",
      {
        trackingNumber: trackingNumberSchema,
        phone: s.nonEmptyString(
          "The sender or recipient phone number; required only for SF Express (顺丰), SF Freight (顺丰快运), and ZTO (中通) shipments.",
        ),
      },
      { optional: ["phone"] },
    ),
    outputSchema: queryTraceOutputSchema,
    followUpActions: ["kuaidi100.estimate_time_with_logistic"],
  }),
  defineProviderAction(service, {
    name: "auto_number",
    operationType: "read",
    description: "Detect the likely express carriers for a tracking number from its format.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The tracking number to identify.", {
      trackingNumber: trackingNumberSchema,
    }),
    outputSchema: autoNumberOutputSchema,
    followUpActions: ["kuaidi100.query_trace"],
  }),
  defineProviderAction(service, {
    name: "estimate_time",
    operationType: "read",
    description:
      "Estimate the delivery time for a shipment before it is sent, from the carrier, origin, destination, and optional order time and product type.",
    requiredScopes: [],
    inputSchema: s.object("The shipment whose delivery time should be estimated.", estimateTimeInputProperties, {
      optional: ["orderTime", "productType"],
    }),
    outputSchema: estimateTimeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "estimate_time_with_logistic",
    operationType: "read",
    description:
      "Estimate the remaining delivery time for an in-transit shipment from its existing logistics trajectory, usually the data returned by kuaidi100.query_trace.",
    requiredScopes: [],
    inputSchema: s.object(
      "The in-transit shipment whose arrival time should be estimated.",
      {
        carrier: timeEstimateCarrierSchema,
        origin: s.nonEmptyString("The origin address, for example 广东省深圳市南山区."),
        destination: s.nonEmptyString("The destination address, for example 北京市海淀区."),
        orderTime: orderTimeSchema,
        trajectory: s.array(
          "The historical logistics trajectory events, usually the data returned by kuaidi100.query_trace.",
          logisticEventSchema,
          {
            minItems: 1,
          },
        ),
      },
      { optional: [] },
    ),
    outputSchema: estimateTimeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "estimate_price",
    operationType: "read",
    description: "Estimate the shipping price for a carrier, sender and recipient addresses, and parcel weight.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The shipment whose price should be estimated.", {
      carrier: priceEstimateCarrierSchema,
      senderAddress: s.nonEmptyString("The sender address, for example 北京市海淀区."),
      recipientAddress: s.nonEmptyString("The recipient address, for example 广东省深圳市南山区."),
      weightKg: s.number("The parcel weight in kilograms.", { exclusiveMinimum: 0 }),
    }),
    outputSchema: estimatePriceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "order_price",
    operationType: "read",
    description:
      "Quote a pickup order before creating it. This uses the pickup-order pricing service, not the general estimate_price calculation.",
    requiredScopes: [],
    inputSchema: s.object(
      "The pickup order to quote.",
      {
        carrier: orderCarrierSchema,
        senderAddress: s.nonEmptyString("The sender address, at least to city level."),
        recipientAddress: s.nonEmptyString("The recipient address, at least to city level."),
        weightKg: s.number("The parcel weight in kilograms.", { exclusiveMinimum: 0 }),
        serviceType: s.nonEmptyString("The carrier service type, such as 顺丰标快."),
      },
      { optional: ["carrier", "weightKg", "serviceType"] },
    ),
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_order",
    operationType: "write",
    description: "Create a pay-offline pickup order after obtaining an order_price quote.",
    requiredScopes: [],
    inputSchema: s.object(
      "The pickup order to create.",
      {
        carrier: orderCarrierSchema,
        sender: contactSchema,
        recipient: contactSchema,
        itemName: s.nonEmptyString("The item name, such as 文件."),
        weightKg: s.number("The parcel weight in kilograms.", { exclusiveMinimum: 0 }),
        payment: s.stringEnum("Who pays the shipping fee.", ["SHIPPER", "CONSIGNEE"]),
        pickupDay: s.stringEnum("The requested pickup day.", ["今天", "明天", "后天"]),
        pickupStartTime: s.string("The pickup window start time in HH:mm format."),
        pickupEndTime: s.string("The pickup window end time in HH:mm format."),
        remark: s.string("An optional order note."),
      },
      { optional: ["weightKg", "payment", "pickupDay", "pickupStartTime", "pickupEndTime", "remark"] },
    ),
    outputSchema: orderOutputSchema,
    followUpActions: ["kuaidi100.query_order"],
  }),
  defineProviderAction(service, {
    name: "query_order",
    operationType: "read",
    description: "Get a pickup order and optionally include its logistics trajectory.",
    requiredScopes: [],
    inputSchema: s.object(
      "The pickup order to retrieve.",
      {
        orderId: s.nonEmptyString("The Kuaidi100 pickup order ID."),
        includeTracking: s.boolean("Whether to include the logistics trajectory."),
        phone: s.string("The phone number needed by carriers such as SF Express or ZTO."),
      },
      { optional: ["includeTracking", "phone"] },
    ),
    outputSchema: orderOutputSchema,
    followUpActions: ["kuaidi100.cancel_order"],
  }),
  defineProviderAction(service, {
    name: "cancel_order",
    operationType: "destructive",
    description: "Cancel a pickup order that is no longer needed.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The pickup order cancellation.", {
      orderId: s.nonEmptyString("The Kuaidi100 pickup order ID."),
      reason: s.string("The cancellation reason, up to 30 characters.", { minLength: 1, maxLength: 30 }),
    }),
    outputSchema: orderOutputSchema,
  }),
];
