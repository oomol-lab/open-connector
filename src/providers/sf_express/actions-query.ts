import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema, waybillNoSchema } from "./schemas.ts";

const service = "sf_express";

const addressSchema = (role: string): ReturnType<typeof s.object> =>
  s.object(
    `The ${role} address. Provide either code (the SF area code) or both province and city.`,
    {
      province: s.nonEmptyString("The province name, for example 广东省. Required when code is omitted."),
      city: s.nonEmptyString("The city name, for example 深圳市. Required when code is omitted."),
      district: s.nonEmptyString("The district name."),
      address: s.nonEmptyString("The street address."),
      code: s.nonEmptyString(
        "The SF area code, for example 755 for Shenzhen. Overrides province and city when present.",
      ),
    },
    { optional: ["province", "city", "district", "address", "code"] },
  );

const routeEventSchema = s.object(
  "One route event.",
  {
    acceptTime: s.string("The event time in YYYY-MM-DD HH:mm:ss format."),
    acceptAddress: s.string("The location where the event happened."),
    remark: s.string("The event description."),
    opCode: s.string("The SF operation code."),
    firstStatusCode: s.string("The first-level status code."),
    firstStatusName: s.string("The first-level status name."),
    secondaryStatusCode: s.string("The second-level status code."),
    secondaryStatusName: s.string("The second-level status name."),
  },
  {
    optional: ["acceptAddress", "firstStatusCode", "firstStatusName", "secondaryStatusCode", "secondaryStatusName"],
  },
);

const searchRoutesOutputSchema = s.requiredObject("The SF Express route query results.", {
  results: s.array(
    "One result per queried tracking number.",
    s.object(
      "The route result for one tracking number.",
      {
        mailNo: s.string("The waybill number."),
        routes: s.array(
          "The route events; empty when the shipment has no queryable route (see reasonCode).",
          routeEventSchema,
        ),
        reasonCode: s.array(
          "The reason codes returned when no route was found, for example an unbound monthly card or a shipment older than 3 months.",
          s.string("A reason code returned by SF Express."),
        ),
        reasonRemark: s.array(
          "The reason details returned when no route was found.",
          s.string("A reason detail returned by SF Express."),
        ),
      },
      { optional: ["reasonCode", "reasonRemark"] },
    ),
  ),
});

const deliveryOptionsOutputSchema = s.requiredObject("The SF Express delivery standards and prices.", {
  options: s.array(
    "The delivery products with their promised time and optional price.",
    s.object(
      "One delivery product option.",
      {
        businessType: s.string("The product code, for example 2 for 标快."),
        businessTypeDesc: s.string("The product name, for example 顺丰特惠."),
        deliverTime: s.string("The promised delivery time window as start,end in YYYY-MM-DD HH:mm:ss format."),
        fee: s.nullableNumber("The estimated freight fee in CNY, or null when no price applies."),
        searchPrice: s.string("Whether the price was included (1) or not (0)."),
        closeTime: s.nullableString("The order cutoff time for the product."),
      },
      { optional: ["searchPrice"] },
    ),
  ),
});

const filterAddressSchema = (role: string): ReturnType<typeof s.object> =>
  s.object(
    `The ${role} address used for the coverage check.`,
    {
      tel: s.nonEmptyString("The contact phone number."),
      country: s.nonEmptyString("The country or region code, for example CN; required for cross-border shipments."),
      province: s.nonEmptyString("The province name, for example 广东省."),
      city: s.nonEmptyString("The city name, for example 深圳市."),
      county: s.nonEmptyString("The district or county name, for example 南山区."),
      address: s.nonEmptyString("The detailed street address."),
      post_code: s.nonEmptyString("The postal code; required for cross-border shipments."),
    },
    { optional: ["tel", "country", "province", "city", "county", "address", "post_code"] },
  );

const filterResultOutputSchema = s.requiredObject("The coverage check results.", {
  results: s.array(
    "One result per checked order.",
    s.object(
      "The coverage result for one order.",
      {
        orderId: s.string("The client order number, echoed back."),
        filterResult: s.integer(
          "The coverage verdict: 1 = manual review, 2 = deliverable (可收派), 3 = not deliverable, 4 = address unrecognizable.",
        ),
        originCode: s.string("The origin area code; present when deliverable."),
        destCode: s.string("The destination area code; present when deliverable."),
        remark: s.string(
          "The rejection reason code when filterResult is 3: 1 recipient out of range, 2 sender out of range, 3 other.",
        ),
      },
      { optional: ["orderId", "originCode", "destCode", "remark"] },
    ),
  ),
});

const servicePointsOutputSchema = s.object(
  "The nearby SF Express service points.",
  {
    status: s.integer("The query status: 0 for success."),
    count: s.integer("The number of points returned."),
    src: s.string("The data source."),
    msg: s.string("The query message."),
    result: s.array(
      "The service points.",
      s.object("One service point.", {
        id: s.string("The service point id."),
        name: s.string("The service point name."),
        address: s.string("The service point address."),
        distance: s.number("The distance in meters from the queried location."),
        longitude: s.number("The point longitude."),
        latitude: s.number("The point latitude."),
        servertype: s.string("The service type code of the point."),
      }),
    ),
  },
  { optional: ["msg"] },
);

const productOptionSchema = s.object("One recommended SF product.", {
  productCode: s.string("The SF product code, for example S2."),
  productName: s.string("The product name, for example 顺丰标快."),
  productDisplayCode: s.string("The display name code."),
  productDisplayName: s.string("The product display name."),
  waybillLabelCode: s.string("The waybill label code."),
  waybillLabelName: s.string("The waybill label name, for example 标快."),
  expressType: s.string("The BSP product code usable as express_type when ordering."),
  businessType: s.string("The business type code, for example B1."),
  productType: s.string("The product line: 1 便利店, 2 医药, 3 时效, 4 高铁, 5 冷运, 6 快运, 7 国际, 8 特惠."),
  recommendProductType: s.integer("The recommendation type: 1 协议产品, 2 基础产品, 3 其他产品."),
  sortNo: s.integer("The recommendation sort order; ascending, may repeat or skip."),
  reachTime: s.string("The promised delivery time in yyyy-MM-dd HH:mm format."),
  standardTime: s.string("The standard transit time code, for example 2D1200."),
  cutOffTime: s.string("The order cutoff time in HHmm format, when the product has one."),
  weight: s.number("The billable weight in kilograms."),
  chargedWeight: s.number("The charged weight in kilograms."),
  totalFee: s.number("The total price in the response currency."),
  freight: s.number("The personalized freight charge."),
  stdFreight: s.number("The standard freight without customer-specific pricing."),
  initialFreight: s.number("The freight before channel discounts."),
  totalServiceFee: s.number("The total value-added service fee."),
  selfMailingFee: s.number("The self-drop-off discount."),
  selfTakeFee: s.number("The self-pickup discount."),
  otherFee: s.number("Other fees."),
  currency: s.string("The price currency, for example CNY."),
  suburbFlg: s.boolean("Whether the destination is a suburban area."),
  reverseLogistics: s.string("Whether reverse logistics applies: 0 no, 1 yes."),
  deliverySfbox: s.string("Whether locker or convenience-store delivery is allowed: 0 no, 1 yes."),
  overtimeRefund: s.string("Whether overtime refund is supported: 0 no, 1 yes."),
  specialCommodityMsg: s.string("A warning shown for special cargo, for example perishables."),
  serviceFeeList: s.array(
    "The value-added service fee details.",
    s.object("One value-added service fee.", {
      serviceCode: s.string("The value-added service code."),
      serviceName: s.string("The value-added service name."),
      serviceFee: s.number("The service fee in the response currency."),
    }),
  ),
});

const controlStrategySchema = s.object("One peak-season control strategy for a product.", {
  productCode: s.string("The product code the strategy applies to."),
  controlStrategy: s.string("The strategy: 0 不管控, 1 延时管控, 2 错峰管控, 3 加价管控, 4 温馨提示."),
  notificationMsg: s.string("The control notice, in the response language."),
});

const recommendProductOutputSchema = s.requiredObject("The recommended SF products.", {
  products: s.array("The recommended products, best first.", productOptionSchema),
  controlStrategies: s.array("The peak-season control strategies per product.", controlStrategySchema),
});

const vasOptionSchema = s.object("One recommended value-added service.", {
  recommendedType: s.integer(
    "The recommendation type: 1 绑定服务, 2 可选服务, 3 附加费(加项), 4 附加费(减项), 5 默认绑定可取消, 6 可选服务不可取消, 7 取消.",
  ),
  vasCode: s.string("The service code, for example IN67."),
  vasName: s.string("The service name, for example 保鲜服务."),
  floorPrice: s.number("The service price."),
  currency: s.string("The price currency, for example CNY."),
  chargedWeight: s.number("The billable weight in kilograms."),
  arrivalTime: s.string("The earliest delivery time with this service, in yyyy-MM-dd HH:mm:ss format."),
  cutOffTime: s.string("The order cutoff time for this service."),
  mutexVas: s.string("Mutually exclusive service codes, for example IN02 (保价)."),
  timelinessTips: s.string("A timeliness warning for this service."),
  freightBinding: s.integer("Whether the payment method binds to the freight: 0 no, 1 yes."),
  requiredInformation: s.string("A JSON string describing the extra information the service requires."),
  feeCode: s.integer("The service fee code."),
  minInsuredPrice: s.number("The minimum insured value for declared-value services."),
  maxInsuredPrice: s.number("The maximum insured value for declared-value services."),
  useCoupon: s.integer("Whether SF coupons can pay for this service: 0 no, 1 yes."),
  stressRecommend: s.integer("The recommendation weight: 0 normal, 1 priority, 2 secondary."),
  extendAttForKY: s.string("A JSON string with the heavy-cargo extension fields."),
  conditionJsonInfo: s.string("A JSON string array with the required extra fields."),
  extJson: s.string("A JSON string with the custom extension fields."),
  priorityCode: s.string("The configured priority code, for example B0."),
  recommendIndex: s.integer("The recommendation index."),
  order: s.integer("The algorithmic recommendation order."),
  vasOrder: s.number("The PSDS-configured service order."),
});

const pickupTimeOutputSchema = s.object(
  "The pickup time check result.",
  {
    status: s.boolean("Whether the address can be served at the requested time."),
    startTm: s.string("The service window start in HHmm format, returned when include_time_window is set."),
    endTm: s.string("The service window end in HHmm format, returned when include_time_window is set."),
    system: s.string("The source system, when returned."),
    exceptionReason: s.string("The reason the time cannot be served, when returned."),
  },
  { optional: ["startTm", "endTm", "system", "exceptionReason"] },
);

const declarationMethodSchema = s.stringEnum(
  "The customs declaration method (international shipments): 1 简易报关, 2 正式报关, 3 海运报关, 4 个人物品, 5 简报销售, 6 简报样品, 7 跨境直邮, 8 跨境保税, 9 个人行李, 10 自清关.",
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
);

const paymentMethodSchema = s.stringEnum("The payment method: 1 寄付, 2 到付, 3 寄转第三方, 4 到转第三方.", [
  "1",
  "2",
  "3",
  "4",
]);

const sendTimeSchema = dateTimeSchema("The shipment or pickup time in YYYY-MM-DD HH:mm:ss format.");

/** Actions for the SF Express service-query endpoints. */
export const sfExpressQueryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_routes",
    description:
      "Query logistics routes (tracking events) for up to 10 SF Express shipments. Waybill-only queries return routes only for shipments paid with a monthly card bound to your partnerID; for any other shipment, pass the sender or recipient phone's last 4 digits in check_phone_nos. Only shipments from the last 3 months have routes.",
    requiredScopes: [],
    inputSchema: s.object(
      "The tracking numbers whose routes should be queried.",
      {
        tracking_numbers: s.stringArray(
          "The SF waybill numbers, or the client order numbers when tracking_type is client_order.",
          { minItems: 1, maxItems: 10 },
        ),
        tracking_type: s.stringEnum(
          "The number type: waybill for SF waybill numbers (default) or client_order for order numbers placed through your own partnerID.",
          ["waybill", "client_order"],
        ),
        check_phone_nos: s.stringArray(
          "The last 4 digits of the sender or recipient phone numbers, one per entry in tracking_numbers. Required for waybill queries unless every waybill was paid with a monthly card bound to your partnerID.",
        ),
        language: s.stringEnum("The response language.", ["zh-CN", "zh-TW", "zh-HK", "zh-MO", "en"]),
      },
      { optional: ["tracking_type", "check_phone_nos", "language"] },
    ),
    outputSchema: searchRoutesOutputSchema,
    followUpActions: ["sf_express.estimate_delivery_time"],
  }),
  defineProviderAction(service, {
    name: "query_delivery_time_price",
    description:
      "Query the SF Express delivery time standards for an origin and destination, optionally with freight prices per product.",
    requiredScopes: [],
    inputSchema: s.object(
      "The shipment whose delivery standards should be queried.",
      {
        src_address: addressSchema("origin"),
        dest_address: addressSchema("destination"),
        business_type: s.stringEnum(
          "The product to query: 1 = 特快, 2 = 标快, 5 = 顺丰次晨, 6 = 即日件. Omit to list the default products. Querying a specific product requires monthly_card.",
          ["1", "2", "5", "6"],
        ),
        monthly_card: s.nonEmptyString(
          "The SF monthly settlement card (月结卡号) used for personalized pricing; required when business_type is set.",
        ),
        weight: s.number("The total weight in kilograms, up to 2 decimal places.", { exclusiveMinimum: 0 }),
        volume: s.number("The volume in cubic centimeters, up to 2 decimal places."),
        consigned_time: dateTimeSchema("The planned shipment time in YYYY-MM-DD HH:mm:ss format."),
        search_price: s.boolean("Whether to include freight prices in the response."),
      },
      {
        optional: ["business_type", "monthly_card", "weight", "volume", "consigned_time", "search_price"],
      },
    ),
    outputSchema: deliveryOptionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "estimate_delivery_time",
    description:
      "Query the promised delivery time for an SF Express waybill, verified by the sender or recipient phone number or by the monthly card that paid the waybill.",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybill whose promised delivery time should be queried.",
      {
        waybill_no: waybillNoSchema,
        check_type: s.stringEnum(
          "The verification type: phone for a sender or recipient phone number (default), or monthly_card for the monthly settlement card that paid the waybill.",
          ["phone", "monthly_card"],
        ),
        check_nos: s.stringArray(
          "The verification values matching check_type: full phone numbers or monthly card numbers.",
          { minItems: 1 },
        ),
      },
      { optional: ["check_type"] },
    ),
    outputSchema: s.requiredObject("The promised delivery time.", {
      searchNo: s.string("The queried waybill number."),
      promiseTm: s.string("The promised delivery time in YYYY-MM-DD HH:mm:ss format."),
    }),
  }),
  defineProviderAction(service, {
    name: "validate_waybill_no",
    description: "Check whether a waybill number is a valid SF Express waybill number.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill number to validate.", {
      waybill_no: waybillNoSchema,
    }),
    outputSchema: s.requiredObject("The validation result.", {
      waybillNo: s.string("The checked waybill number."),
      valid: s.boolean("Whether the waybill number is valid."),
    }),
    followUpActions: ["sf_express.search_routes"],
  }),
  defineProviderAction(service, {
    name: "filter_order",
    description:
      "Check whether origin and destination addresses are within SF Express pickup and delivery coverage (筛单), before placing an order.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The orders whose coverage should be checked.", {
      orders: s.array(
        "One entry per order to check.",
        s.object(
          "One order coverage check.",
          {
            order_id: s.nonEmptyString("The client order number, echoed back in the result."),
            filter_type: s.stringEnum(
              "auto: the system judges from its address library (default); manual: unresolvable addresses are queued for manual review.",
              ["auto", "manual"],
            ),
            monthly_card: s.nonEmptyString("The SF monthly settlement card (月结卡号)."),
            sender: filterAddressSchema("sender (寄件方)"),
            recipient: filterAddressSchema("recipient (到件方)"),
          },
          { required: ["sender", "recipient"] },
        ),
        { minItems: 1 },
      ),
    }),
    outputSchema: filterResultOutputSchema,
    followUpActions: ["sf_express.create_order"],
  }),
  defineProviderAction(service, {
    name: "query_service_points",
    description:
      "List nearby SF Express service points (自营服务点, 合作商家店, 顺丰站, 丰巢柜, and more) around an address or a coordinate.",
    requiredScopes: [],
    inputSchema: s.object("The location whose nearby service points should be listed.", {
      address: s.nonEmptyString("The address to search around; provide address, or both longitude and latitude."),
      longitude: s.number("The longitude of the search center; required with latitude when address is omitted."),
      latitude: s.number("The latitude of the search center; required with longitude when address is omitted."),
      dept_types: s.array(
        "The point types to include: 1 自营服务点, 2 合作商家店, 3 嘿客店/顺丰优选, 4 顺丰站, 5 丰巢柜.",
        s.stringEnum("A point type code.", ["1", "2", "3", "4", "5"]),
      ),
      service_types: s.array(
        "The service types to include: 1 自寄, 2 自取, 3 寄取件, 4 个人地址服务, 5 便民服务, 6 自寄自取优惠服务.",
        s.stringEnum("A service type code.", ["1", "2", "3", "4", "5", "6"]),
      ),
      count: s.positiveInteger("The maximum number of points to return."),
      distance: s.positiveInteger("The search radius in meters; default 1000."),
      city: s.nonEmptyString("The city name; required for Hong Kong (香港)."),
    }),
    outputSchema: servicePointsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "recommend_product",
    description: "Recommend SF Express products with prices and promised delivery times for a shipment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The shipment to recommend products for.",
      {
        src_province: s.nonEmptyString("The origin province, for example 广东省."),
        src_city: s.nonEmptyString("The origin city, for example 深圳市."),
        src_county: s.nonEmptyString("The origin district or county."),
        dest_province: s.nonEmptyString("The destination province."),
        dest_city: s.nonEmptyString("The destination city."),
        dest_county: s.nonEmptyString("The destination district or county."),
        src_address: s.nonEmptyString("The origin street address."),
        dest_address: s.nonEmptyString("The destination street address."),
        send_time: sendTimeSchema,
        order_time: dateTimeSchema("The order time in YYYY-MM-DD HH:mm:ss format; defaults to the current time."),
        weight: s.number("The total weight in kilograms.", { exclusiveMinimum: 0 }),
        length: s.number("The parcel length in centimeters."),
        width: s.number("The parcel width in centimeters."),
        height: s.number("The parcel height in centimeters."),
        commodity_names: s.stringArray("The cargo names, for example [文件, 苹果]."),
        payment_terms: paymentMethodSchema,
        monthly_card: s.nonEmptyString("The SF monthly settlement card (月结卡号) for personalized pricing."),
        total_num: s.positiveInteger("The total number of parcels."),
        phone_number: s.nonEmptyString(
          "The sender phone when payment_terms is 1 or 3, or the recipient phone when it is 2 or 4.",
        ),
        waybill_no: waybillNoSchema,
        trace_id: s.nonEmptyString("A unique trace id for data tracking, for example a UUID."),
        import_declaration_method: declarationMethodSchema,
        export_declaration_method: declarationMethodSchema,
        declared_value: s.number("The declared cargo value for international shipments."),
        declared_currency: s.nonEmptyString("The declared value currency, for example CNY."),
      },
      {
        required: [
          "src_province",
          "src_city",
          "dest_province",
          "dest_city",
          "src_address",
          "dest_address",
          "send_time",
          "weight",
          "payment_terms",
        ],
      },
    ),
    outputSchema: recommendProductOutputSchema,
    followUpActions: ["sf_express.recommend_vas", "sf_express.create_order"],
  }),
  defineProviderAction(service, {
    name: "recommend_vas",
    description:
      "Recommend value-added services (保鲜, 保价, 定时派送, and more) with prices for a shipment on a chosen product.",
    requiredScopes: [],
    inputSchema: s.object(
      "The shipment and product to recommend value-added services for.",
      {
        express_type: s.nonEmptyString(
          "The BSP product code, for example 2 for S2 标快; use the expressType of a product returned by sf_express.recommend_product.",
        ),
        prod_price: s.number("The product price, when known."),
        src_province: s.nonEmptyString("The origin province."),
        src_city: s.nonEmptyString("The origin city."),
        src_county: s.nonEmptyString("The origin district or county."),
        dest_province: s.nonEmptyString("The destination province."),
        dest_city: s.nonEmptyString("The destination city."),
        dest_county: s.nonEmptyString("The destination district or county."),
        send_time: sendTimeSchema,
        order_time: dateTimeSchema("The order time in YYYY-MM-DD HH:mm:ss format; defaults to the current time."),
        weight: s.number("The total weight in kilograms.", { exclusiveMinimum: 0 }),
        weight_unit: s.integer("The weight unit: 1 千克 (default), 2 克, 3 吨, 4 英镑.", { minimum: 1, maximum: 4 }),
        length: s.number("The parcel length in centimeters."),
        width: s.number("The parcel width in centimeters."),
        height: s.number("The parcel height in centimeters."),
        length_unit: s.integer("The length unit: 1 厘米 (default), 2 米, 3 千米, 4 英寸.", { minimum: 1, maximum: 4 }),
        pay_method: paymentMethodSchema,
        monthly_card: s.nonEmptyString("The SF monthly settlement card (月结卡号)."),
        package_number: s.positiveInteger("The number of parcels."),
        commodity_names: s.stringArray("The cargo names."),
        src_address: s.nonEmptyString("The origin street address."),
        dest_address: s.nonEmptyString("The destination street address."),
        dest_postal_code: s.nonEmptyString("The destination postal code; required for overseas destinations."),
        apply_link: s.stringEnum("The stage the services apply to: 0 下单环节 (default), 1 收件环节, 2 派件环节.", [
          "0",
          "1",
          "2",
        ]),
        overseas_country_code: s.nonEmptyString("The overseas country code, for example US."),
        single_ticket: s.requiredObject("The single-ticket information required by heavy-cargo services.", {
          real_total_weight: s.integer("The single-ticket weight in kilograms."),
          pieces_number: s.integer("The single-ticket parcel count."),
        }),
        single_products: s.array(
          "The per-parcel information required by heavy-cargo services.",
          s.requiredObject("One parcel in the shipment.", {
            single_product_no: s.stringArray("The parcel tracking numbers."),
            single_length: s.integer("The parcel length in meters."),
            single_width: s.integer("The parcel width in meters."),
            single_height: s.integer("The parcel height in meters."),
            single_weight: s.integer("The parcel weight in kilograms."),
            quantity: s.integer("The count of parcels with this specification."),
          }),
        ),
        special_service: s.nonEmptyString(
          "Special services, comma-separated; currently only 1 = 高峰加价服务 (IN100).",
        ),
        client_code: s.nonEmptyString("The access code; required for access-code scenarios."),
        order_type: s.nonEmptyString("The order type, for example 31/32/33/34."),
        label_fresh: s.array(
          "The freshness labels: 1 保鲜, 0 非保鲜.",
          s.integer("1 for 保鲜, 0 for 非保鲜.", { minimum: 0, maximum: 1 }),
        ),
        pay_country: s.nonEmptyString("The payment country code used for pricing, for example CN."),
        arrival_time: dateTimeSchema(
          "The estimated delivery time in YYYY-MM-DD HH:mm:ss format, usually the reachTime returned by sf_express.recommend_product.",
        ),
        src_phone_num: s.nonEmptyString(
          "The sender phone when pay_method is 1 or 3, or the recipient phone when it is 2 or 4.",
        ),
      },
      {
        required: [
          "express_type",
          "src_province",
          "src_city",
          "dest_province",
          "dest_city",
          "send_time",
          "weight",
          "pay_method",
          "package_number",
          "pay_country",
          "arrival_time",
        ],
      },
    ),
    outputSchema: s.requiredObject("The recommended value-added services.", {
      services: s.array("The recommended services.", vasOptionSchema),
    }),
    followUpActions: ["sf_express.create_order"],
  }),
  defineProviderAction(service, {
    name: "check_pickup_time",
    description:
      "Check whether an SF Express pickup at an address can be served at a planned time, optionally returning the service window.",
    requiredScopes: [],
    inputSchema: s.object(
      "The pickup to check.",
      {
        address: s.nonEmptyString("The pickup or delivery street address."),
        address_type: s.stringEnum("sender for a pickup (寄件) address, recipient for a delivery (收件) address.", [
          "sender",
          "recipient",
        ]),
        send_time: sendTimeSchema,
        city_code: s.nonEmptyString(
          "The SF city code, for example 755 for Shenzhen; when omitted, province, city and county are all required.",
        ),
        province: s.nonEmptyString("The province name; used with city and county when city_code is omitted."),
        city: s.nonEmptyString("The city name; used with province and county when city_code is omitted."),
        county: s.nonEmptyString("The district or county name; used with province and city when city_code is omitted."),
        sys_code: s.nonEmptyString("The source system code."),
        include_time_window: s.boolean("Whether to also return the service window (startTm/endTm)."),
      },
      { optional: ["city_code", "province", "city", "county", "sys_code", "include_time_window"] },
    ),
    outputSchema: pickupTimeOutputSchema,
  }),
];
