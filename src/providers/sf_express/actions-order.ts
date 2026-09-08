import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema, waybillNoSchema } from "./schemas.ts";

const service = "sf_express";

const languageSchema = s.stringEnum("The response language.", ["zh-CN", "zh-TW", "zh-HK", "zh-MO", "en"]);

/** The delivery-notice table spells the English member US rather than en. */
const deliveryNoticeLanguageSchema = s.stringEnum("The response language.", ["zh-CN", "zh-TW", "zh-HK", "zh-MO", "US"]);

const orderContactSchema = (role: string): ReturnType<typeof s.object> =>
  s.object(
    `The ${role} contact and address. At least one of tel or mobile is required.`,
    {
      company: s.nonEmptyString("The company name."),
      contact: s.nonEmptyString("The contact person name."),
      tel: s.nonEmptyString("The landline phone number."),
      mobile: s.nonEmptyString("The mobile phone number."),
      country: s.nonEmptyString(
        "The country or region code, for example CN for mainland China or 852 for Hong Kong. Defaults to CN.",
      ),
      province: s.nonEmptyString("The standard province name, for example 广东省; it drives route code recognition."),
      city: s.nonEmptyString("The standard city name, for example 深圳市; it drives route code recognition."),
      county: s.nonEmptyString("The standard district or county name, for example 南山区."),
      address: s.nonEmptyString(
        "The detailed street address. When province and city are omitted, the address must contain them.",
      ),
      post_code: s.nonEmptyString("The postal code; required for cross-border shipments."),
      email: s.email("The contact email address."),
      tax_no: s.nonEmptyString("The contact's tax number."),
      contact_remark: s.nonEmptyString("The contact attribute: 01 = 个人件, 02 = 公司件 (required for cross-border)."),
      cert_type: s.nonEmptyString("The ID document type (required for cross-border shipments)."),
      cert_no: s.nonEmptyString("The ID document number (required for cross-border shipments)."),
    },
    {
      optional: [
        "company",
        "tel",
        "mobile",
        "country",
        "province",
        "city",
        "county",
        "post_code",
        "email",
        "tax_no",
        "contact_remark",
        "cert_type",
        "cert_no",
      ],
    },
  );

const preOrderContactSchema = (role: string): ReturnType<typeof s.object> =>
  s.object(
    `The ${role} contact and address. tel and mobile are alternatives.`,
    {
      tel: s.nonEmptyString("The landline phone number."),
      mobile: s.nonEmptyString("The mobile phone number."),
      province: s.nonEmptyString("The standard province name, for example 广东省."),
      city: s.nonEmptyString("The standard city name, for example 深圳市."),
      county: s.nonEmptyString("The standard district or county name, for example 南山区."),
      address: s.nonEmptyString(
        "The detailed street address, for example 广东省深圳市福田区新洲十一街万基商务大厦10楼.",
      ),
    },
    { optional: ["tel", "mobile", "county"] },
  );

const cargoDetailSchema = s.object(
  "One cargo item. Cross-border shipments also require count, unit, weight, amount, currency, and source_area.",
  {
    name: s.nonEmptyString("The cargo name, for example 文件, 电子产品, or 衣服."),
    count: s.number("The cargo quantity."),
    unit: s.nonEmptyString("The cargo unit, for example 个, 台, or 本."),
    weight: s.number("The unit weight in kilograms."),
    amount: s.number("The cargo unit price."),
    currency: s.nonEmptyString("The currency of the unit price, for example CNY."),
    source_area: s.nonEmptyString("The origin country code, for example CHN."),
    hs_code: s.nonEmptyString("The customs HS code."),
    goods_code: s.nonEmptyString("The merchant's product code."),
    brand: s.nonEmptyString("The cargo brand."),
    specifications: s.nonEmptyString("The cargo specifications or model."),
    manufacturer: s.nonEmptyString("The manufacturer."),
    shipment_weight: s.number("The gross weight of the cargo in kilograms."),
    length: s.number("The cargo length in centimeters."),
    width: s.number("The cargo width in centimeters."),
    height: s.number("The cargo height in centimeters."),
    volume: s.number("The cargo volume in cubic centimeters."),
    cargo_declared_value: s.number("The declared value of the cargo."),
    declared_value_currency: s.nonEmptyString("The currency of the declared value."),
  },
  {
    optional: [
      "count",
      "unit",
      "weight",
      "amount",
      "currency",
      "source_area",
      "hs_code",
      "goods_code",
      "brand",
      "specifications",
      "manufacturer",
      "shipment_weight",
      "length",
      "width",
      "height",
      "volume",
      "cargo_declared_value",
      "declared_value_currency",
    ],
  },
);

const serviceListSchema = s.array(
  "The value-added services (增值服务) to apply, from the SF value-added service product table.",
  s.object(
    "One value-added service entry.",
    {
      name: s.nonEmptyString("The value-added service name, for example COD or INSURE."),
      value: s.nonEmptyString("The service value, for example the insured amount for INSURE."),
      value1: s.nonEmptyString("Service extension attribute 1."),
      value2: s.nonEmptyString("Service extension attribute 2."),
      value3: s.nonEmptyString("Service extension attribute 3."),
      value4: s.nonEmptyString("Service extension attribute 4."),
    },
    { optional: ["value", "value1", "value2", "value3", "value4"] },
  ),
);

const extraInfoListSchema = s.array(
  "Extended attributes as attrName/attrVal pairs, for example pickupAppointEndTime for the pickup deadline.",
  s.object(
    "One extended attribute.",
    {
      attr_name: s.nonEmptyString("The extended field name (attrName)."),
      attr_val: s.string("The extended field value (attrVal)."),
    },
    { optional: ["attr_val"] },
  ),
);

const waybillNoInfoInputSchema = s.array(
  "Existing waybill numbers and per-package dimensions; required when confirming an order, and used for bringing your own waybill numbers when creating one.",
  s.object(
    "One waybill number entry with optional package dimensions.",
    {
      waybill_type: s.integer("The waybill number type: 1 = mother (母单), 2 = child (子单), 3 = sign-back (签回单)."),
      waybill_no: s.nonEmptyString("The SF waybill number."),
      box_no: s.nonEmptyString("The box number; unique per monthly card."),
      length: s.number("The package length in centimeters."),
      width: s.number("The package width in centimeters."),
      height: s.number("The package height in centimeters."),
      weight: s.number("The package weight in kilograms."),
    },
    { optional: ["waybill_no", "box_no", "length", "width", "height", "weight"] },
  ),
);

const waybillNoInfoOutputSchema = s.object(
  "One SF waybill number entry.",
  {
    waybillType: s.integer("The waybill number type: 1 = mother (母单), 2 = child (子单), 3 = sign-back (签回单)."),
    waybillNo: s.string("The SF waybill number."),
    boxNo: s.string("The box number."),
  },
  { optional: ["waybillType", "boxNo"] },
);

const routeLabelInfoOutputSchema = s.array(
  "The route label data used for waybill printing, returned as-is.",
  s.unknownObject("One route label entry with its routeLabelData."),
);

const customsInfoSchema = s.object(
  "The customs declaration info; declared_value is required for cross-border shipments.",
  {
    declared_value: s.number("The total declared value of the shipment, including sub-packages."),
    declared_value_currency: s.nonEmptyString("The declared value currency, for example CNY or USD."),
    customs_batchs: s.nonEmptyString("The customs declaration batch."),
    tax_pay_method: s.integer("The tax payment method: 1 = 寄付, 2 = 到付, 3 = 第三方付."),
    tax_settle_accounts: s.nonEmptyString("The tax settlement account."),
    payment_tool: s.nonEmptyString("The payment tool."),
    payment_number: s.nonEmptyString("The payment number."),
    order_name: s.nonEmptyString("The name of the person placing the order."),
    tax: s.nonEmptyString("The tax amount."),
  },
  {
    optional: [
      "declared_value",
      "declared_value_currency",
      "customs_batchs",
      "tax_pay_method",
      "tax_settle_accounts",
      "payment_tool",
      "payment_number",
      "order_name",
      "tax",
    ],
  },
);

const destContactInfoSchema = s.object(
  "The updated recipient (收件人) address.",
  {
    company: s.nonEmptyString("The company name."),
    contact: s.nonEmptyString("The contact person name."),
    tel: s.nonEmptyString("The recipient landline phone number."),
    mobile: s.nonEmptyString("The recipient mobile phone number."),
    country: s.nonEmptyString("The two-letter country or region code."),
    province: s.nonEmptyString("The standard province name."),
    city: s.nonEmptyString("The standard city name."),
    county: s.nonEmptyString("The standard district or county name."),
    address: s.nonEmptyString("The detailed street address."),
  },
  { optional: ["company", "tel", "mobile"] },
);

const newDestAddressSchema = s.object(
  "The new destination address; required for redirect (转寄) and return (退回) instructions, omitted when cancelling one.",
  {
    province: s.nonEmptyString("The province name, for example 广东省."),
    city: s.nonEmptyString("The city name, for example 深圳市."),
    county: s.nonEmptyString("The district name, for example 南山区."),
    address: s.nonEmptyString("The detailed street address without province/city/district."),
    contact: s.nonEmptyString("The contact person name."),
    phone: s.nonEmptyString("The contact phone number."),
    country: s.nonEmptyString("The country name; defaults to China."),
    country_code: s.nonEmptyString("The country code; defaults to CN."),
    company: s.nonEmptyString("The company name."),
    area_code: s.nonEmptyString("The site code, for example 755WQ."),
    location_code: s.nonEmptyString("The city code."),
  },
  { optional: ["contact", "phone", "country", "country_code", "company", "area_code", "location_code"] },
);

const orderResultOutputSchema = s.object(
  "The SF Express order creation result.",
  {
    orderId: s.string("The client order number echoed back."),
    originCode: s.string("The origin area code, usable for waybill label printing."),
    destCode: s.string("The destination area code, usable for waybill label printing."),
    filterResult: s.nullableInteger(
      "The screening (筛单) result: 1 = 人工确认, 2 = 可收派, 3 = 不可以收派, 4 = 无法确定.",
    ),
    remark: s.string("The reason when the shipment cannot be served (filterResult 3)."),
    url: s.nullableString("The QR code URL for return operations."),
    paymentLink: s.nullableString("The URL for third-party freight payment."),
    waybillNoInfoList: s.array("The allocated SF waybill numbers.", waybillNoInfoOutputSchema),
    routeLabelInfo: routeLabelInfoOutputSchema,
    scenePlanCode: s.string("The component service code used for the order."),
  },
  { optional: ["originCode", "destCode", "remark", "scenePlanCode"] },
);

const createOrderInputProperties = {
  order_id: s.nonEmptyString("The unique client order number; reusing one returns the waybill first allocated to it.", {
    maxLength: 64,
  }),
  is_return_qr_code: s.boolean("Whether to return the return-business QR code URL; SF omits it by default."),
  is_return_route_label: s.boolean("Whether to return the route label (路由标签); SF returns it by default."),
  express_type_id: s.integer(
    "The SF product type (快件产品类别) code from the SF product table; only products agreed with your SF sales manager are usable. Defaults to 1. Mutually exclusive with scene_plan_code.",
  ),
  scene_plan_code: s.nonEmptyString(
    "The component service code (组件服务编码) for specific business scenarios, agreed with your SF account manager in advance. Mutually exclusive with express_type_id.",
  ),
  sender: orderContactSchema("sender (寄件方)"),
  recipient: orderContactSchema("recipient (到件方)"),
  cargo_details: s.array("The cargo items (托寄物).", cargoDetailSchema, { minItems: 1 }),
  cargo_desc: s.nonEmptyString("The cargo type description, for example 文件 or 电子产品.", { maxLength: 20 }),
  monthly_card: s.nonEmptyString(
    "The SF monthly settlement card (月结卡号). Required for monthly-settlement payment; must not be sent for cash payment. Production cards are bound in the SF console under 应用详情->绑定月结.",
  ),
  pay_method: s.integer("The payment method: 1 = 寄方付, 2 = 收方付, 3 = 第三方付. Defaults to 1.", {
    minimum: 1,
    maximum: 3,
  }),
  parcel_qty: s.positiveInteger(
    "The number of packages; values above 1 produce one mother waybill plus child waybills, and then total_weight is required.",
    { maximum: 307 },
  ),
  total_weight: s.number("The total shipment weight in kilograms; required for multi-package (子母件) shipments.", {
    exclusiveMinimum: 0,
  }),
  total_length: s.number("The total shipment length in centimeters."),
  total_width: s.number("The total shipment width in centimeters."),
  total_height: s.number("The total shipment height in centimeters."),
  total_volume: s.number("The total shipment volume in cubic centimeters, used for volumetric weight."),
  total_net_weight: s.number("The total net weight of the goods in kilograms."),
  send_start_time: dateTimeSchema(
    "The start of the requested pickup window (要求上门取件开始时间) in YYYY-MM-DD HH:mm:ss format; defaults to the order time.",
  ),
  is_docall: s.boolean(
    "Whether SF should dispatch a courier for pickup at the appointment time (1) or the shipment is dropped at an agreed site (0, default).",
  ),
  is_sign_back: s.boolean("Whether to return the sign-back (签回单) waybill number."),
  cust_reference_no: s.nonEmptyString("Your own reference number, for example the original order number."),
  order_source: s.nonEmptyString("The source platform code, for example tmall, pinduoduo, or jd."),
  remark: s.nonEmptyString("The order remark.", { maxLength: 100 }),
  temperature_range: s.integer(
    "The temperature range type, required when express_type_id is 12 (医药温控件): 1 = 冷藏, 3 = 冷冻.",
  ),
  service_list: serviceListSchema,
  customs_info: customsInfoSchema,
  waybill_no_info_list: waybillNoInfoInputSchema,
  extra_info_list: extraInfoListSchema,
  special_delivery_type_code: s.nonEmptyString("The special delivery type code, for example 2 = 极效前置单(当日达)."),
  special_delivery_value: s.nonEmptyString("The special delivery value, for example 1:09296231 for ID verification."),
  language: s.withDefault(languageSchema, "zh-CN"),
};

const createOrderOptionalFields = [
  "express_type_id",
  "is_return_qr_code",
  "is_return_route_label",
  "scene_plan_code",
  "cargo_desc",
  "monthly_card",
  "pay_method",
  "parcel_qty",
  "total_weight",
  "total_length",
  "total_width",
  "total_height",
  "total_volume",
  "total_net_weight",
  "send_start_time",
  "is_docall",
  "is_sign_back",
  "cust_reference_no",
  "order_source",
  "remark",
  "temperature_range",
  "service_list",
  "customs_info",
  "waybill_no_info_list",
  "extra_info_list",
  "special_delivery_type_code",
  "special_delivery_value",
  "language",
];

export const sfExpressOrderActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_order",
    description:
      "Create a real SF Express shipment order (下订单) and allocate waybill numbers; charges may apply. Mainland China and Hong Kong/Macao/Taiwan lanes are supported. The response includes the screening result (filterResult) and the allocated waybill numbers. Use pre_order to validate an order without creating it.",
    requiredScopes: [],
    inputSchema: s.object("The order to create.", createOrderInputProperties, { optional: createOrderOptionalFields }),
    outputSchema: orderResultOutputSchema,
    followUpActions: ["sf_express.query_order_result", "sf_express.search_routes"],
  }),
  defineProviderAction(service, {
    name: "pre_order",
    description:
      "Validate whether an SF Express order would be accepted (预下单) — checks cargo, monthly card, address reachability, and number controls — without creating it, and returns the available service time windows.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order to validate.",
      {
        order_id: s.nonEmptyString("The client order number.", { maxLength: 64 }),
        express_type_id: s.integer("The SF product type (快件产品类别) code from the SF product table."),
        sender: preOrderContactSchema("sender (寄件方)"),
        recipient: preOrderContactSchema("recipient (到件方)"),
        cargo_name: s.nonEmptyString("The cargo name; when provided, the cargo category is validated.", {
          maxLength: 20,
        }),
        monthly_card: s.nonEmptyString("The SF monthly settlement card (月结卡号)."),
      },
      {
        optional: ["cargo_name", "monthly_card"],
      },
    ),
    outputSchema: s.object("The available service time windows for the order.", {
      windows: s.array(
        "The available service time windows.",
        s.object("One service date window.", {
          serviceDate: s.string("The service date, for example 2021-04-25."),
          startTime: s.string("The window start time."),
          endTime: s.string("The window end time."),
        }),
      ),
    }),
    followUpActions: ["sf_express.create_order"],
  }),
  defineProviderAction(service, {
    name: "update_order",
    description:
      "Confirm (deal_type confirm) or cancel (deal_type cancel) an SF Express order before shipment, optionally updating weight, volume, or the recipient address. Confirming requires the waybill numbers. A cancelled order number cannot be reused.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order update to apply.",
      {
        order_id: s.nonEmptyString("The client order number.", { maxLength: 64 }),
        deal_type: s.stringEnum("The operation: confirm (确认) or cancel (取消). Defaults to confirm.", [
          "confirm",
          "cancel",
        ]),
        waybill_no_info_list: waybillNoInfoInputSchema,
        total_weight: s.number("The updated total weight in kilograms.", { exclusiveMinimum: 0 }),
        total_volume: s.number("The updated total volume in cubic centimeters."),
        total_length: s.number("The updated total length in centimeters."),
        total_width: s.number("The updated total width in centimeters."),
        total_height: s.number("The updated total height in centimeters."),
        express_type_id: s.integer("The updated SF product type code."),
        service_list: serviceListSchema,
        extra_info_list: extraInfoListSchema,
        dest_contact_info: destContactInfoSchema,
        is_docall: s.boolean("Whether to notify the courier for pickup via the handheld terminal."),
        special_delivery_type_code: s.nonEmptyString("The special delivery type code."),
        special_delivery_value: s.nonEmptyString("The special delivery value."),
        send_start_time: dateTimeSchema(
          "The start of the requested pickup window (要求上门取件开始时间) in YYYY-MM-DD HH:mm:ss format.",
        ),
        pickup_appoint_end_time: dateTimeSchema(
          "The end of the requested pickup window (预约取件截止时间) in YYYY-MM-DD HH:mm:ss format.",
        ),
        customs_batchs: s.nonEmptyString("The customs declaration batch."),
        collect_emp_code: s.nonEmptyString("The pickup courier employee code."),
        source_zone_code: s.nonEmptyString("The origin site code."),
        dest_zone_code: s.nonEmptyString("The destination site code."),
        remark: s.nonEmptyString("The remark.", { maxLength: 100 }),
      },
      {
        optional: [
          "deal_type",
          "waybill_no_info_list",
          "total_weight",
          "total_volume",
          "total_length",
          "total_width",
          "total_height",
          "express_type_id",
          "service_list",
          "extra_info_list",
          "dest_contact_info",
          "is_docall",
          "special_delivery_type_code",
          "special_delivery_value",
          "send_start_time",
          "pickup_appoint_end_time",
          "customs_batchs",
          "collect_emp_code",
          "source_zone_code",
          "dest_zone_code",
          "remark",
        ],
      },
    ),
    outputSchema: s.object("The order update result.", {
      orderId: s.string("The client order number echoed back."),
      resStatus: s.integer("The result status: 1 = the order number does not match the SF waybill, 2 = success."),
      waybillNoInfoList: s.array("The SF waybill numbers.", waybillNoInfoOutputSchema),
    }),
    followUpActions: ["sf_express.query_order_result"],
  }),
  defineProviderAction(service, {
    name: "query_order_result",
    description:
      "Query the processing result of a previously placed SF Express order, for example when the create_order response never arrived.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order whose result should be queried.",
      {
        order_id: s.nonEmptyString("The client order number.", { maxLength: 64 }),
        search_type: s.stringEnum("The query type: forward (正向单) or return (退货单).", ["forward", "return"]),
        main_waybill_no: s.nonEmptyString("The mother waybill number returned by the order creation."),
        language: languageSchema,
      },
      { optional: ["search_type", "main_waybill_no", "language"] },
    ),
    outputSchema: s.object(
      "The order processing result.",
      {
        orderId: s.string("The client order number echoed back."),
        origincode: s.string("The origin area code (lowercase field name is upstream's)."),
        destcode: s.string("The destination area code (lowercase field name is upstream's)."),
        filterResult: s.nullableString("The screening (筛单) result: 1 = 人工确认, 2 = 可收派, 3 = 不可以收派."),
        remark: s.string("The reason when the shipment cannot be served (filterResult 3)."),
        waybillNoInfoList: s.array("The allocated SF waybill numbers.", waybillNoInfoOutputSchema),
        routeLabelInfo: routeLabelInfoOutputSchema,
        returnExtraInfoList: s.array(
          "Extended result attributes as attrName/attrVal pairs.",
          s.unknownObject("One extended attribute."),
        ),
      },
      { optional: ["origincode", "destcode", "remark", "returnExtraInfoList"] },
    ),
    followUpActions: ["sf_express.search_routes"],
  }),
  defineProviderAction(service, {
    name: "get_sub_waybill_nos",
    description:
      "Allocate additional child waybill numbers (子单号) for an existing SF Express order, at most 20 per call.",
    requiredScopes: [],
    inputSchema: s.object(
      "The child waybill number request.",
      {
        order_id: s.nonEmptyString("The client order number.", { maxLength: 64 }),
        parcel_qty: s.positiveInteger("The number of child waybill numbers to allocate; at most 20 per call.", {
          maximum: 20,
        }),
        waybill_no_info_list: waybillNoInfoInputSchema,
      },
      { optional: ["waybill_no_info_list"] },
    ),
    outputSchema: s.object("The allocated child waybill numbers.", {
      orderId: s.string("The client order number echoed back."),
      parcelQty: s.nullableInteger("The number of child waybill numbers allocated."),
      waybillNoInfoList: s.array("The allocated SF waybill numbers.", waybillNoInfoOutputSchema),
    }),
    followUpActions: ["sf_express.query_order_result"],
  }),
  defineProviderAction(service, {
    name: "intercept_order",
    description:
      "Intercept, redirect, return, or adjust an in-transit SF Express waybill (截单转寄退回), for example redirecting it to a new address or returning it to the sender. Only for waybills already picked up; cancel an unshipped order with update_order instead.",
    requiredScopes: [],
    inputSchema: s.object(
      "The interception instruction.",
      {
        waybill_no: waybillNoSchema,
        action_type: s.stringEnum(
          "The instruction type: redirect (转寄), return (退回), priority (优派), redeliver (再派), change_to_self_pickup (改自取, pair with self_pick_point), change_to_door (改派送), change_delivery_time (更改派送时间), change_recipient (修改收件人信息), change_pay_method (更改付款方式), change_cod (修改代收货款), or void (作废).",
          [
            "redirect",
            "return",
            "priority",
            "redeliver",
            "change_to_self_pickup",
            "change_to_door",
            "change_delivery_time",
            "change_recipient",
            "change_pay_method",
            "change_cod",
            "void",
          ],
        ),
        role: s.stringEnum("The initiator: sender (寄方), recipient (收方), or third_party (第三方).", [
          "sender",
          "recipient",
          "third_party",
        ]),
        pay_mode: s.stringEnum(
          "The payment mode: sender_cash (寄付现结), recipient_cash (到付现结), sender_to_third_monthly (寄付转第三方月结), or sender_monthly (寄付月结).",
          ["sender_cash", "recipient_cash", "sender_to_third_monthly", "sender_monthly"],
        ),
        monthly_card_no: s.nonEmptyString(
          "The monthly settlement card number; required when paying by monthly card or changing the COD amount.",
        ),
        product_type: s.nonEmptyString("The product type."),
        cod_amount: s.number("The new COD (代收货款) amount for change_cod."),
        deliver_date: s.string("The requested delivery date in YYYY-MM-DD format.", { format: "date" }),
        deliver_time_min: s.string("The earliest delivery time, for example 09:00.", {
          pattern: "^\\d{2}:\\d{2}$",
        }),
        deliver_time_max: s.string("The latest delivery time, for example 12:00.", {
          pattern: "^\\d{2}:\\d{2}$",
        }),
        self_pick_point: s.stringEnum(
          "The self-pickup point type: partner_point (合作点), locker (快递柜), site (网点), or transfer_center (中转场).",
          ["partner_point", "locker", "site", "transfer_center"],
        ),
        new_dest_address: newDestAddressSchema,
        cancel: s.boolean(
          "Whether to cancel a previously issued redirect or return instruction instead of issuing one.",
        ),
        command_id: s.nonEmptyString(
          "The instruction code (cusId) returned when the redirect or return was issued; required when cancel is true.",
        ),
      },
      {
        optional: [
          "monthly_card_no",
          "product_type",
          "cod_amount",
          "deliver_date",
          "deliver_time_min",
          "deliver_time_max",
          "self_pick_point",
          "new_dest_address",
          "cancel",
          "command_id",
        ],
      },
    ),
    outputSchema: s.object(
      "The interception result.",
      {
        cusId: s.string("The instruction code; keep it to cancel the instruction later."),
        amount: s.nullableNumber("The fee for the instruction."),
        freightAdditionInfoResp: s.object(
          "The fee addition info.",
          {
            interceptionDeptCode: s.string("The estimated interception site code."),
            transferFlg: s.string("Whether the interception site is a transfer center: 1 = yes."),
          },
          { optional: ["interceptionDeptCode", "transferFlg"] },
        ),
      },
      { optional: ["cusId", "amount", "freightAdditionInfoResp"] },
    ),
    followUpActions: ["sf_express.search_routes"],
  }),
  defineProviderAction(service, {
    name: "send_delivery_notice",
    description:
      "Send a delivery or return notification for an SF Express waybill (派件通知), used in pre-sale scenarios where the goods were stocked in an SF warehouse in advance.",
    requiredScopes: [],
    inputSchema: s.object(
      "The notification to send.",
      {
        waybill_no: waybillNoSchema,
        data_type: s.stringEnum("The notification type: delivery (派送通知) or return (通知退回).", [
          "delivery",
          "return",
        ]),
        language: deliveryNoticeLanguageSchema,
      },
      { optional: ["language"] },
    ),
    outputSchema: s.object("The notification result.", {
      waybillNo: s.string("The waybill number notified."),
      notified: s.boolean("Whether the notification was accepted."),
    }),
  }),
  defineProviderAction(service, {
    name: "query_waybill_fee",
    description:
      "Query the freight fee breakdown (清单运费) of an SF Express shipment by order number (only orders placed under your partnerID) or by waybill number (the waybill's monthly card must be bound to your partnerID).",
    requiredScopes: [],
    inputSchema: s.object(
      "The shipment whose fee breakdown should be queried.",
      {
        query_type: s.stringEnum(
          "Query by order (order number placed under your partnerID) or by waybill (waybill number whose monthly card is bound to your partnerID).",
          ["order", "waybill"],
        ),
        tracking_num: s.nonEmptyString("The order number or waybill number to query."),
        biz_template_code: s.nonEmptyString("The business template code configured for your partnerID."),
      },
      { optional: ["biz_template_code"] },
    ),
    outputSchema: s.object("The freight fee breakdown.", {
      waybillInfo: s.object(
        "The waybill summary.",
        {
          waybillNo: s.string("The waybill number."),
          orderId: s.string("The client order number."),
          waybillChilds: s.string("The child waybill numbers, comma-separated."),
          customerAcctCode: s.string("The monthly settlement account."),
          meterageWeightQty: s.nullableNumber("The billable weight in kilograms."),
          realWeightQty: s.nullableNumber("The actual weight in kilograms."),
          consigneeEmpCode: s.string("The pickup courier employee number."),
          deliverEmpCode: s.string("The delivery courier employee number."),
          cargoTypeCode: s.string("The cargo content code."),
          cargoTypeName: s.string("The cargo content name."),
          limitTypeCode: s.string("The time-limit type code."),
          limitName: s.string("The time-limit type name."),
          expressTypeCode: s.string("The business type code."),
          expressTypeName: s.string("The business type name."),
          productCode: s.string("The product code."),
          productName: s.string("The product name."),
          consValue: s.nullableNumber("The declared value."),
          consValueCurrencyCode: s.string("The declared value currency."),
          jProvince: s.string("The sender province."),
          jCity: s.string("The sender city."),
          consignorAddr: s.string("The sender detailed address."),
          consignorContName: s.string("The sender contact name."),
          consignorPhone: s.string("The sender phone number."),
          consignorMobile: s.string("The sender mobile number."),
          dProvince: s.string("The recipient province."),
          dCity: s.string("The recipient city."),
          addresseeAddr: s.string("The recipient detailed address."),
          addresseeContName: s.string("The recipient contact name."),
          addresseePhone: s.string("The recipient phone number."),
          addresseeMobile: s.string("The recipient mobile number."),
        },
        {
          optional: [
            "waybillNo",
            "orderId",
            "waybillChilds",
            "customerAcctCode",
            "meterageWeightQty",
            "realWeightQty",
            "consigneeEmpCode",
            "deliverEmpCode",
            "cargoTypeCode",
            "cargoTypeName",
            "limitTypeCode",
            "limitName",
            "expressTypeCode",
            "expressTypeName",
            "productCode",
            "productName",
            "consValue",
            "consValueCurrencyCode",
            "jProvince",
            "jCity",
            "consignorAddr",
            "consignorContName",
            "consignorPhone",
            "consignorMobile",
            "dProvince",
            "dCity",
            "addresseeAddr",
            "addresseeContName",
            "addresseePhone",
            "addresseeMobile",
          ],
        },
      ),
      waybillFeeList: s.array(
        "The fee items.",
        s.object(
          "One fee item.",
          {
            type: s.string("The fee type code, for example 1 = 运费, 3 = 基础保."),
            name: s.string("The fee name."),
            value: s.nullableNumber("The fee amount; null when the fee item carries no amount."),
            paymentTypeCode: s.string("The payment type: 1 = 寄付, 2 = 到付, 3 = 第三方付."),
            settlementTypeCode: s.string("The settlement type: 1 = 现结, 2 = 月结."),
            serviceProdCode: s.string("The value-added service code."),
            insuredValue: s.string("The insured value."),
            customerAcctCode: s.string("The monthly settlement account."),
          },
          {
            optional: ["paymentTypeCode", "settlementTypeCode", "serviceProdCode", "insuredValue", "customerAcctCode"],
          },
        ),
      ),
    }),
  }),
];
