import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema } from "./schemas.ts";

const service = "sf_express";

const orderIdSchema = s.nonEmptyString("The client order number (客户订单号); must be unique per partnerID.");

const freightContactSchema = (role: string, includeEmail: boolean): ReturnType<typeof s.object> => {
  const properties: Record<string, JsonSchema> = {
    company: s.nonEmptyString(`The ${role} company name.`),
    contact: s.nonEmptyString(`The ${role} contact person.`),
    mobile: s.nonEmptyString(`The ${role} mobile number; either mobile or tel is required.`),
    tel: s.nonEmptyString(`The ${role} landline number; either mobile or tel is required.`),
    province: s.nonEmptyString(`The ${role} province name, for example 广东省.`),
    city: s.nonEmptyString(`The ${role} city name, for example 深圳市.`),
    county: s.nonEmptyString(`The ${role} district or county name, for example 南山区.`),
    address: s.nonEmptyString(`The ${role} detailed street address, without province/city/district.`),
  };
  const optional = ["company", "mobile", "tel"];
  if (includeEmail) {
    properties.email = s.nonEmptyString(`The ${role} email address.`);
    optional.push("email");
  }
  return s.requireAnyProperty(s.object(`The ${role} party.`, properties, { optional }), ["mobile", "tel"]);
};

const cargoItemSchema = s.object(
  "One cargo item (托寄物明细).",
  {
    name: s.nonEmptyString("The cargo name."),
    unit: s.nonEmptyString("The unit, for example 个, 台, 件."),
    category: s.nonEmptyString("The cargo category."),
    spec: s.nonEmptyString("The specification."),
    count: s.integer("The item count."),
    length: s.number("The length in centimeters."),
    height: s.number("The height in centimeters."),
    width: s.number("The width in centimeters."),
    volume: s.number("The volume in cubic centimeters."),
    weight: s.number("The weight in kilograms."),
    goodsCode: s.nonEmptyString("The goods code."),
    stateBarCode: s.nonEmptyString("The state bar code."),
    boxNo: s.nonEmptyString("The box number."),
    snCode: s.nonEmptyString("The SN code used by the inspection service."),
  },
  {
    optional: [
      "name",
      "unit",
      "category",
      "spec",
      "count",
      "length",
      "height",
      "width",
      "volume",
      "weight",
      "goodsCode",
      "stateBarCode",
      "boxNo",
      "snCode",
    ],
  },
);

const packageItemSchema = s.object(
  "One package with its reserved waybill number and dimensions.",
  {
    waybillNo: s.nonEmptyString("The reserved waybill or sub waybill number."),
    boxNo: s.nonEmptyString("The box number."),
    length: s.number("The package length in centimeters."),
    height: s.number("The package height in centimeters."),
    width: s.number("The package width in centimeters."),
    weight: s.number("The package weight; unit per unitWeight, default KG."),
    unitWeight: s.nonEmptyString("The weight unit, default 千克 (KG)."),
    volume: s.number("The package volume; unit per unitVolume, default cubic centimeters."),
    unitVolume: s.nonEmptyString("The volume unit, default 立方厘米."),
  },
  {
    optional: ["waybillNo", "boxNo", "length", "height", "width", "weight", "unitWeight", "volume", "unitVolume"],
  },
);

const additionServiceSchema = s.object(
  "One value-added service (增值服务), for example COD (代收货款) or INSURE (保价).",
  {
    name: s.nonEmptyString("The service code, for example COD, INSURE, PKFEE, HIN (安装服务)."),
    value: s.nonEmptyString("The service value; meaning depends on the service code."),
    value1: s.nonEmptyString("Service extension attribute 1."),
    value2: s.nonEmptyString("Service extension attribute 2."),
    value3: s.nonEmptyString("Service extension attribute 3."),
    value4: s.nonEmptyString("Service extension attribute 4."),
    value5: s.nonEmptyString("Service extension attribute 5; carries a JSON string for PKFEE and HIN."),
  },
  { optional: ["value", "value1", "value2", "value3", "value4", "value5"] },
);

const thirdSignBackSchema = s.object(
  "The third-party sign-back recipient, used when the signed receipt is forwarded to an address other than the sender's.",
  {
    province: s.nonEmptyString("The receipt recipient province."),
    city: s.nonEmptyString("The receipt recipient city."),
    county: s.nonEmptyString("The receipt recipient district or county."),
    address: s.nonEmptyString("The receipt recipient detailed address."),
    contact: s.nonEmptyString("The receipt recipient contact person."),
    mobile: s.nonEmptyString("The receipt recipient mobile number."),
    tel: s.nonEmptyString("The receipt recipient landline number."),
    company: s.nonEmptyString("The receipt recipient company name."),
  },
  { optional: ["tel", "company"] },
);

const ltlOrderResultSchema = s.object(
  "The SF Freight order result.",
  {
    orderId: s.string("The client order number, echoed back."),
    waybillNo: s.string("The SF master waybill number assigned to the order."),
    subWaybillNos: s.array("The sub waybill numbers.", s.string("A sub waybill number.")),
    returnTrackingNo: s.string("The sign-back receipt waybill number, when one was requested."),
    destCode: s.string("The destination area code."),
    filterResult: s.integer(
      "The coverage verdict: 1 = manual review (人工确认), 2 = deliverable (可收派), 3 = not deliverable.",
    ),
    filterRemark: s.string("The reason code or note when the order is not deliverable."),
    mappingMark: s.string("The address mapping code."),
    paymentLink: s.string("The third-party freight payment URL."),
    rlsInfo: s.unknownObject(
      "The route label information used for waybill printing; carries invokeResult plus the printable route-label fields.",
    ),
  },
  {
    optional: [
      "waybillNo",
      "subWaybillNos",
      "returnTrackingNo",
      "destCode",
      "filterResult",
      "filterRemark",
      "mappingMark",
      "paymentLink",
      "rlsInfo",
    ],
  },
);

const routeInfoSchema = s.object(
  "One cross-border route event.",
  {
    info: s.string("The route description."),
    status: s.integer("The shipment status: 10 = 已揽收, 20 = 运输中, 50 = 已签收."),
    statusDesc: s.string("The status description."),
    time: s.integer("The event time as epoch milliseconds."),
    opCode: s.string("The operation code."),
  },
  { optional: ["status", "time", "opCode"] },
);

/** Actions for the SF Express Freight LTL ordering, business query, and work order endpoints. */
export const sfExpressFreightCoreActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "freight_create_ltl_order",
    description:
      "Place an SF Freight (快运) LTL order for bulky or heavy shipments. This is for 大件 special scenarios only; for regular parcels use sf_express.create_order. When waybill_no is provided, the order uses that reserved master waybill number instead of generating one.",
    requiredScopes: [],
    inputSchema: s.object(
      "The freight order to place.",
      {
        order_id: orderIdSchema,
        waybill_no: s.nonEmptyString("A reserved master waybill number to use instead of generating one."),
        sub_waybills: s.stringArray("The reserved sub waybill numbers to use with waybill_no."),
        sender: freightContactSchema("sender", false),
        recipient: freightContactSchema("recipient", true),
        monthly_card: s.nonEmptyString("The SF monthly settlement card number (月结卡号) to charge."),
        pickup_mode: s.integer(
          "The pickup mode: 1 = customer drop-off (客户自送), 2 = courier pickup (上门接货, default).",
        ),
        is_do_call: s.boolean(
          "Whether to dispatch a courier call (下call): true = a courier picks up within about an hour; false = the shipper prints labels and the courier collects on a fixed schedule.",
        ),
        expected_pickup_time: dateTimeSchema(
          "The expected pickup time in YYYY-MM-DD HH:mm:ss format; effective only when is_do_call is true. A time past 20:00 is moved to the next day.",
        ),
        pay_method: s.integer(
          "The freight payment method: 1 = sender pays (寄方付), 2 = recipient pays (收方付), 3 = third party pays.",
        ),
        parcel_qty: s.integer("The number of packages; values above 1 yield one master waybill and N-1 sub waybills."),
        cargo_length: s.number("The total cargo length in centimeters."),
        cargo_width: s.number("The total cargo width in centimeters."),
        cargo_height: s.number("The total cargo height in centimeters."),
        volume: s.number("The total cargo volume in cubic centimeters, used for volumetric weight."),
        cargo_total_weight: s.number(
          "The total cargo weight in kilograms; required when addition_services includes the HIN 安装服务 service.",
        ),
        need_return_tracking_no: s.boolean("Whether to return the sign-back receipt waybill number."),
        special_delivery_type_code: s.nonEmptyString(
          "The special delivery type code: 1 = identity verification (身份验证).",
        ),
        special_delivery_value: s.nonEmptyString(
          "The special delivery detail, for example 1:09296231 meaning the last 8 digits of an ID card.",
        ),
        delivery_mode: s.integer("The delivery mode: 1 = delivery (派送, default), 2 = self pickup (自提)."),
        has_elevator: s.boolean("Whether the delivery site has an elevator."),
        delivery_res_type: s.integer(
          "The delivery appointment type: 1 = any day, 2 = workdays only, 3 = rest days only, 4 = weekends only, 5 = Monday to Saturday, 6 = Monday to Friday.",
        ),
        cargo_type: s.nonEmptyString("The cargo category, for example 家电 or 家俱."),
        cargo_name: s.nonEmptyString("The cargo name, for example 小天鹅洗衣机."),
        declared_value: s.number(
          "The declared value of the goods (声明价值), in currency_code; this is not the INSURE value-added service amount.",
        ),
        currency_code: s.nonEmptyString("The declared value currency, default CNY."),
        product_code: s.nonEmptyString(
          "The SF Freight product code, for example SE0100 重货包裹, SE0101 标准零担, SE0114 大票直送, SE0020 整车直达, S1 顺丰特快, S2 顺丰标快.",
        ),
        original_number: s.nonEmptyString("The original e-commerce order number."),
        order_source: s.nonEmptyString("The order source platform, for example taobao, tmall, jd, pdd."),
        remark: s.nonEmptyString("The order remark."),
        cargo_list: s.array("The cargo items (托寄物明细).", cargoItemSchema, { minItems: 1 }),
        package_list: s.array("The packages with reserved waybill numbers.", packageItemSchema),
        addition_services: s.array("The value-added services (增值服务).", additionServiceSchema),
        third_sign_back: thirdSignBackSchema,
      },
      {
        optional: [
          "waybill_no",
          "sub_waybills",
          "monthly_card",
          "pickup_mode",
          "expected_pickup_time",
          "parcel_qty",
          "cargo_length",
          "cargo_width",
          "cargo_height",
          "volume",
          "cargo_total_weight",
          "need_return_tracking_no",
          "special_delivery_type_code",
          "special_delivery_value",
          "delivery_mode",
          "has_elevator",
          "delivery_res_type",
          "cargo_type",
          "cargo_name",
          "declared_value",
          "currency_code",
          "product_code",
          "original_number",
          "order_source",
          "remark",
          "package_list",
          "addition_services",
          "third_sign_back",
        ],
      },
    ),
    outputSchema: ltlOrderResultSchema,
    followUpActions: ["sf_express.freight_get_ltl_order_result", "sf_express.freight_cancel_ltl_order"],
  }),
  defineProviderAction(service, {
    name: "freight_cancel_ltl_order",
    description: "Cancel an SF Freight LTL order. Only orders not yet picked up can be cancelled.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order to cancel.",
      {
        order_id: orderIdSchema,
        reuse_order_id: s.boolean("When true, the order number can be reused for a new order after cancellation."),
      },
      { optional: ["reuse_order_id"] },
    ),
    outputSchema: s.object("The cancellation result.", {
      orderId: s.string("The cancelled client order number, echoed back."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_get_ltl_order_result",
    description:
      "Get the latest dispatch result of an SF Freight LTL order placed with courier call (下call), including the assigned waybill numbers.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The order whose result should be queried.", {
      order_id: orderIdSchema,
    }),
    outputSchema: ltlOrderResultSchema,
  }),
  defineProviderAction(service, {
    name: "freight_append_ltl_sub_waybill",
    description:
      "Append sub waybill numbers to an SF Freight LTL order, for shippers who finalize the package count after packing. Only own orders before pickup; at most 1200 sub waybills per order. Reprint the waybills afterwards if they were already printed.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The order to append sub waybills to.", {
      order_id: orderIdSchema,
      count: s.positiveInteger("The number of sub waybills to append; the order can hold at most 1200 in total."),
    }),
    outputSchema: ltlOrderResultSchema,
  }),
  defineProviderAction(service, {
    name: "freight_check_address_reachable",
    description: "Check whether an address is within SF Freight pickup or delivery coverage (订单筛单).",
    requiredScopes: [],
    inputSchema: s.object(
      "The address to check.",
      {
        direction: s.stringEnum(
          "The direction to check: pickup for the sender-side (寄件) or delivery for the recipient-side (收件) coverage.",
          ["pickup", "delivery"],
        ),
        province: s.nonEmptyString("The province name, for example 广东省."),
        city: s.nonEmptyString("The city name, for example 深圳市."),
        district: s.nonEmptyString("The district or county name."),
        address: s.nonEmptyString("The detailed street address."),
      },
      { optional: ["district", "address"] },
    ),
    outputSchema: s.object("The coverage check result.", {
      reachable: s.integer("The verdict: 1 = reachable (可达), 2 = unreachable (不可达), 3 = cannot infer (无法推断)."),
      resultMsg: s.string("The result message."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_query_standard_price",
    description:
      "Query the standard base freight price for an SF Freight product between two addresses. At least one of weight, size, or declare_value is required for pricing.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The shipment to price.",
        {
          sender: s.object(
            "The sender location.",
            {
              province: s.nonEmptyString("The sender province."),
              city: s.nonEmptyString("The sender city."),
              district: s.nonEmptyString("The sender district."),
              address: s.nonEmptyString(
                "The sender detailed address; required, and needed for areas where coverage does not span the whole district.",
              ),
            },
            { optional: ["district"] },
          ),
          recipient: s.object(
            "The recipient location.",
            {
              province: s.nonEmptyString("The recipient province."),
              city: s.nonEmptyString("The recipient city."),
              district: s.nonEmptyString("The recipient district."),
              address: s.nonEmptyString("The recipient detailed address; needed where coverage is partial."),
            },
            { optional: ["district", "address"] },
          ),
          product_code: s.nonEmptyString("The SF Freight product code, for example SE0100 重货包裹."),
          currency_type: s.nonEmptyString("The payment currency, default CNY."),
          weight: s.number("The actual weight in kilograms."),
          size: s.number("The sum of length, width, and height in centimeters."),
          declare_value: s.number("The declared value of the goods."),
          volume: s.number("The volume in cubic centimeters; when set it is used for volumetric weight."),
          consigned_time: dateTimeSchema("The shipment time in YYYY-MM-DD HH:mm:ss format."),
          suburb_flg: s.boolean("Whether this is a suburban shipment (郊区件)."),
        },
        {
          optional: [
            "product_code",
            "currency_type",
            "weight",
            "size",
            "declare_value",
            "volume",
            "consigned_time",
            "suburb_flg",
          ],
        },
      ),
      ["weight", "size", "declare_value"],
    ),
    outputSchema: s.object("The standard price estimate.", {
      totalPrice: s.number("The total base freight price."),
      currencyType: s.string("The payment currency; empty means the payer country's currency."),
      rate: s.number("The exchange rate applied."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_register_ltl_picture_push",
    description:
      "Register an SF Freight waybill for waybill picture push. The picture push callback must be configured in the SF console before pushes arrive.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill to register for picture push.", {
      order_id: orderIdSchema,
      waybill_no: s.nonEmptyString("The SF waybill number."),
      image_types: s.stringArray(
        "The picture type codes to push, for example 68 (waybill image), per the SF 图片查询 documentation.",
        {
          minItems: 1,
        },
      ),
    }),
    outputSchema: s.object("The registration result.", {
      orderId: s.string("The registered client order number, echoed back."),
      waybillNo: s.string("The registered waybill number, echoed back."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_query_crossborder_route",
    description:
      "Query the route of an SF cross-border bulky (大件跨境) waybill. For transfer waybill numbers (转单号), use freight_query_crossborder_transfer_routes.",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybill whose route should be queried.",
      {
        waybill_no: s.nonEmptyString("The SF waybill number."),
        order_time: s.nonEmptyString("The order placement time, for example 2023-03-01 22:20."),
      },
      { optional: ["order_time"] },
    ),
    outputSchema: s.object(
      "The cross-border waybill route.",
      {
        waybillNo: s.string("The SF waybill number."),
        cargoVolume: s.number("The cargo volume in cubic centimeters."),
        cargoWeight: s.number("The cargo weight in kilograms."),
        cargoAmount: s.integer("The cargo item count."),
        expectDeliveryTime: s.integer("The delivery or expected delivery time as epoch milliseconds; see timeTag."),
        orderStatus: s.integer("The shipment status: 10 = 已揽收, 20 = 运输中, 50 = 已签收."),
        payMethod: s.string("The payment method."),
        senderCity: s.string("The sender city."),
        receiverCity: s.string("The recipient city."),
        routeInfos: s.array("The route events.", routeInfoSchema),
        timeTag: s.string("What expectDeliveryTime means, for example 签收时间."),
        waybillAmount: s.integer("The number of transfer waybills (转单号)."),
        subWaybillNos: s.array("The transfer waybill numbers.", s.string("A transfer waybill number.")),
        waybillReceived: s.integer("How many transfer waybills are signed for."),
        waybillTransporting: s.integer("How many transfer waybills are in transit."),
        waybillDelivering: s.integer("How many transfer waybills are out for delivery."),
      },
      {
        optional: [
          "cargoVolume",
          "cargoWeight",
          "cargoAmount",
          "expectDeliveryTime",
          "orderStatus",
          "payMethod",
          "senderCity",
          "receiverCity",
          "routeInfos",
          "timeTag",
          "waybillAmount",
          "subWaybillNos",
          "waybillReceived",
          "waybillTransporting",
          "waybillDelivering",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "freight_query_crossborder_transfer_routes",
    description: "Query the route events of a transfer waybill number (转单号) for an SF cross-border bulky shipment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The transfer waybill whose route should be queried.",
      {
        waybill_no: s.nonEmptyString("The transfer waybill number (转单号)."),
        order_time: s.nonEmptyString("The order placement time, for example 2023-03-01 22:20."),
      },
      { optional: ["order_time"] },
    ),
    outputSchema: s.object("The transfer waybill route events.", {
      routes: s.array("The route events.", routeInfoSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_list_crossborder_transfer_nos",
    description: "List the transfer waybill numbers (转单号) of an SF cross-border bulky mother waybill.",
    requiredScopes: [],
    inputSchema: s.object(
      "The mother waybill whose transfer numbers should be listed.",
      {
        waybill_no: s.nonEmptyString("The SF mother waybill number."),
        order_time: s.nonEmptyString("The order placement time, for example 2023-03-01 22:20."),
      },
      { optional: ["order_time"] },
    ),
    outputSchema: s.object("The transfer waybill list.", {
      receiverCity: s.string("The recipient city."),
      senderCity: s.string("The sender city."),
      waybillAmount: s.integer("The number of transfer waybills."),
      waybillDelivering: s.integer("How many transfer waybills are out for delivery."),
      waybillReceived: s.integer("How many transfer waybills are signed for."),
      waybillTransporting: s.integer("How many transfer waybills are in transit."),
      childrenList: s.array(
        "The transfer waybills.",
        s.object("One transfer waybill.", {
          orderStatus: s.integer("The shipment status: 10 = 已揽收, 20 = 运输中, 50 = 已签收."),
          receiverCity: s.string("The recipient city."),
          senderCity: s.string("The sender city."),
          waybillNo: s.string("The transfer waybill number."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_report_work_order",
    description: "Report a work order (工单) about an SF Freight shipment to SF customer service.",
    requiredScopes: [],
    inputSchema: s.object(
      "The work order to report.",
      {
        order_no: s.nonEmptyString("The SF waybill or order number the work order is about."),
        creator: s.nonEmptyString("The reporter name."),
        creator_phone: s.nonEmptyString("The reporter contact number."),
        category_one: s.nonEmptyString("The first-level voice category (一级声音), for example 预约异常."),
        category_two: s.nonEmptyString("The second-level voice category (二级声音), for example 客户电话错误."),
        category_three: s.nonEmptyString("The third-level voice category (三级声音)."),
        urgency: s.stringEnum("The urgency: normal (普通) or urgent (紧急).", ["normal", "urgent"]),
        content: s.nonEmptyString("The work order content."),
        pics: s.stringArray("Up to 6 picture URLs, each at most 10MB.", { maxItems: 6 }),
        handle_time_limit_minutes: s.integer("The required handling time limit in minutes."),
        report_source_no: s.nonEmptyString(
          "The third-party work order number (第三方工单唯一编码); used to correlate later work order interactions.",
        ),
      },
      { optional: ["creator_phone", "category_three", "pics", "handle_time_limit_minutes"] },
    ),
    outputSchema: s.object("The created work order.", {
      workOrderId: s.string("The SF work order id."),
    }),
    followUpActions: ["sf_express.freight_reply_work_order"],
  }),
  defineProviderAction(service, {
    name: "freight_reply_work_order",
    description: "Reply to an SF Freight work order, identified by work_order_id or report_source_no (at least one).",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The work order reply.",
        {
          work_order_id: s.nonEmptyString("The SF work order id from freight_report_work_order."),
          report_source_no: s.nonEmptyString("The third-party work order number used when reporting."),
          reply_id: s.nonEmptyString("A unique reply id used for deduplication."),
          content: s.nonEmptyString("The reply content."),
          reply_name: s.nonEmptyString("The replier name."),
          reply_phone: s.nonEmptyString("The replier contact number."),
          pics: s.stringArray("Up to 6 picture URLs, each at most 10MB.", { maxItems: 6 }),
          is_done: s.boolean("Whether this reply closes the work order."),
          is_solve: s.boolean("Whether the issue is solved."),
        },
        { optional: ["work_order_id", "report_source_no", "reply_phone", "pics", "is_solve"] },
      ),
      ["work_order_id", "report_source_no"],
    ),
    outputSchema: s.object("The reply result.", {
      replyId: s.string("The reply id, echoed back."),
    }),
  }),
];
