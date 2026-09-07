import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema } from "./schemas.ts";

const service = "sf_express";

const temperatureLevelCodeSchema = s.stringEnum(
  "The cold-chain temperature level code: 2 = 0至10 (冷藏), 5 = 18至22, 9 = 0至4, 10 = -18以下, 30 = 冷冻, 31 = 常温 (ambient).",
  ["2", "5", "9", "10", "30", "31"],
);

const paymentTypeCodeSchema = s.stringEnum(
  "The payment type: AR = 到付 (freight collect), PR_CASH = 寄付现结 (sender pays cash), PR_ACCOUNT = 寄付月结 (monthly settlement, requires monthly_account).",
  ["AR", "PR_CASH", "PR_ACCOUNT"],
);

const productCodeSchema = s.stringEnum(
  "The cold-chain product code: SE0030 = 冷运大件到港, SE003001 = 冷运大件标快, SE0031 = 冷运整车, SE0059 = 冷运到店, SE003003 = 冷运专线.",
  ["SE0030", "SE003001", "SE0031", "SE0059", "SE003003"],
);

const orderItemOptionalFields = [
  "length",
  "width",
  "height",
  "net_height",
  "imported_flag",
  "carrier_name",
  "sku",
  "sku_unit",
  "price",
];

/**
 * One goods line. Order creation additionally requires sku_code, sku_name and
 * quantity; the fee estimate leaves all three optional.
 */
const orderItemSchema = (forOrder: boolean): JsonSchema =>
  s.object(
    "One goods line.",
    {
      sku_code: s.nonEmptyString(
        "The goods category, from the official category list (e.g. 海鲜水产, 畜禽肉, 乳制品) or a custom category.",
      ),
      sku_name: s.nonEmptyString("The goods name."),
      quantity: s.number("The number of pieces or boxes."),
      gross_weight: s.number("The gross weight in kilograms."),
      volume: s.number("The volume in cubic meters; may be provided without dimensions."),
      length: s.number("The length in centimeters."),
      width: s.number("The width in centimeters."),
      height: s.number("The height in centimeters."),
      net_height: s.number("The net weight in kilograms (upstream field name netHeight)."),
      imported_flag: s.integer("Whether the goods are imported: 1 = not imported, 2 = imported.", {
        minimum: 1,
        maximum: 2,
      }),
      carrier_name: s.string("The supplier name."),
      sku: s.string("The SKU code."),
      sku_unit: s.string("The unit of measure, e.g. kg or 个."),
      price: s.number("The unit price in CNY."),
    },
    {
      optional: forOrder ? orderItemOptionalFields : ["sku_code", "sku_name", "quantity", ...orderItemOptionalFields],
    },
  );

const orderServiceSchema = s.object(
  "One value-added service.",
  {
    service_code: s.nonEmptyString(
      "The value-added service code, e.g. VA0003 签单返还, VA0021 保价, VA0058 提货服务, VA0059 配送服务, VA0035 动检证, VA0063 拍照回传, VA0001 特殊入仓.",
    ),
    service_value: s.string("The service content; carries the amount for priced services such as 保价 or 代收货款."),
    user_def1: s.string("Reserved extension field 1 (service-specific, see the official appendix)."),
    user_def2: s.string("Reserved extension field 2."),
    user_def3: s.string("Reserved extension field 3."),
    user_def4: s.string("Reserved extension field 4."),
    user_def5: s.string("Reserved extension field 5."),
    user_def6: s.string("Reserved extension field 6."),
    user_def7: s.string("Reserved extension field 7."),
    user_def8: s.string("Reserved extension field 8."),
  },
  {
    optional: [
      "service_value",
      "user_def1",
      "user_def2",
      "user_def3",
      "user_def4",
      "user_def5",
      "user_def6",
      "user_def7",
      "user_def8",
    ],
  },
);

const flowAddressFields = (side: string): Record<string, ReturnType<typeof s.nonEmptyString>> => ({
  [`${side}_province_name`]: s.nonEmptyString(`The ${side} province name, e.g. 广东省.`),
  [`${side}_city_name`]: s.nonEmptyString(`The ${side} city name, e.g. 深圳市.`),
  [`${side}_district_name`]: s.nonEmptyString(
    `The ${side} district or county name, e.g. 南山区; for cities without districts pass the town name.`,
  ),
  [`${side}_location_name`]: s.nonEmptyString(`The ${side} location name without province/city/district.`),
});

const netpointSchema = s.object("The serving point info.", {
  mdneUnitName: s.string("The point name."),
  mdneDetailedAddress: s.string("The point address."),
  mdneContactPhone: s.string("The contact phone."),
  mdneOuterBusinessStarttime: s.string("The business opening time."),
  mdneOuterBusinessEndtime: s.string("The business closing time."),
});

const flowSideInfoSchema = s.object("The service info for one side of the flow.", {
  serviceType: s.string("The service type, e.g. DISPATCH or ONLY_PICK_UP."),
  netpoint: netpointSchema,
});

/** Actions for the SF Express cold-chain transport endpoints. */
export const sfExpressColdchainActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "coldchain_check_transport_flow",
    description:
      "Check whether SF Cold Chain can serve a given origin-destination flow with a product, returning the serving points' business hours and the available temperature levels.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The flow and product to check.", {
      product_code: s.nonEmptyString("The cold-chain product code, e.g. SE0030."),
      sender_province_name: s.nonEmptyString("The origin province name, e.g. 广东省."),
      sender_city_name: s.nonEmptyString("The origin city name, e.g. 深圳市."),
      sender_county_name: s.nonEmptyString(
        "The origin district or county name, e.g. 南山区; for cities without districts pass the town name.",
      ),
      sender_city_area_number: s.nonEmptyString("The origin city code, e.g. 755."),
      sender_address: s.nonEmptyString("The origin detailed address."),
      receiver_province_name: s.nonEmptyString("The destination province name, e.g. 北京."),
      receiver_city_name: s.nonEmptyString("The destination city name, e.g. 北京市."),
      receiver_county_name: s.nonEmptyString("The destination district or county name, e.g. 顺义区."),
      receiver_city_area_number: s.nonEmptyString("The destination city code, e.g. 010."),
      receiver_address: s.nonEmptyString("The destination detailed address."),
    }),
    outputSchema: s.object("The flow availability.", {
      senderInfo: flowSideInfoSchema,
      receiverInfo: flowSideInfoSchema,
      temperatureLevel: s.array(
        "The temperature levels available for this flow.",
        s.object("One available temperature level.", {
          ebcdCode: s.string("The temperature level code."),
          ebcdNameCn: s.string("The temperature level name, e.g. 0至10."),
          ebcdTemperatureType: s.string("The temperature type, e.g. 冷藏."),
          ebcdSquenceNo: s.string("The sequence number."),
          ebcdProductCode: s.string("The product code this level applies to."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "coldchain_estimate_transport_fee",
    description:
      "Estimate the SF Cold Chain transport fee for a flow and one or more products, returning the per-product fee breakdown.",
    requiredScopes: [],
    inputSchema: s.object(
      "The shipment whose transport fee should be estimated.",
      {
        erp_order: s.nonEmptyString("The client order number (ERP单号); must be unique per call."),
        product_code: s.nonEmptyString("The product code(s), e.g. SE0022; multiple codes comma-separated."),
        order_time: dateTimeSchema("The order time in yyyy-MM-dd HH:mm:ss format."),
        ...flowAddressFields("shipper"),
        ...flowAddressFields("consignee"),
        order_items: s.array("The goods lines; weight and volume are required per line.", orderItemSchema(false)),
        order_services: s.array("The value-added services to price in.", orderServiceSchema),
      },
      { optional: ["order_items", "order_services"] },
    ),
    outputSchema: s.object("The per-product fee estimates.", {
      results: s.record(
        "One entry per requested product code.",
        s.object("The fee result for one product.", {
          code: s.string("The per-product status code: 200 for success."),
          message: s.string("The per-product status message."),
          fees: s.array(
            "The fee breakdown.",
            s.object("One fee item.", {
              feeName: s.string("The fee name, e.g. 保费."),
              serviceCode: s.string("The value-added service code this fee belongs to."),
              totalAmount: s.nullableNumber("The fee amount in CNY; null when SF does not price the line."),
            }),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "coldchain_estimate_delivery_time",
    description:
      "Estimate the SF Cold Chain delivery time for a flow and one or more products, including pickup and delivery transit times.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The shipment whose delivery time should be estimated.", {
      consign_time: dateTimeSchema("The consign time in yyyy-MM-dd HH:mm:ss format."),
      receiver_city_area_number: s.nonEmptyString("The destination city code, e.g. 010."),
      sender_city_area_number: s.nonEmptyString("The origin city code, e.g. 755."),
      product_code: s.nonEmptyString("The product code(s); multiple codes comma-separated."),
      self_send: s.boolean("Whether the sender drops off the goods (自寄件) instead of SF picking up."),
      oneself_pickup: s.boolean("Whether the recipient picks up the goods (自取件) instead of SF delivering."),
    }),
    outputSchema: s.object("The per-product delivery time estimates.", {
      results: s.array(
        "One estimate per requested product; a per-product failure (e.g. 无有效的时效配置) arrives as a result, not an error.",
        s.object(
          "The estimate for one product.",
          {
            productCode: s.string("The product code."),
            code: s.string("The per-product status code: 200 for success."),
            message: s.string("The per-product status message."),
            effectiveInfo: s.nullable(
              s.object("The delivery time details.", {
                arriveTime: s.string("The estimated arrival time in yyyy-MM-dd HH:mm:ss format."),
                delayRemark: s.string("The delay remark."),
                planDescription: s.string("The schedule description, e.g. 每日发运."),
                delayDay: s.string("The extra delay days."),
                effectiveDay: s.string("The promised transit days."),
              }),
            ),
          },
          { optional: ["code", "message", "effectiveInfo"] },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "coldchain_create_order",
    description:
      "Create an SF Cold Chain transport order (陆运运输). The monthly account is required for monthly-settlement payment (PR_ACCOUNT).",
    requiredScopes: [],
    inputSchema: s.object(
      "The cold-chain transport order to create.",
      {
        erp_order: s.nonEmptyString(
          "The client order number (ERP单号); must not repeat — a cancelled order needs a new one.",
        ),
        product_code: productCodeSchema,
        payment_type_code: paymentTypeCodeSchema,
        monthly_account: s.nonEmptyString(
          "The SF monthly settlement card number (月结账号); required when payment_type_code is PR_ACCOUNT, omitted otherwise.",
        ),
        order_time: dateTimeSchema("The order time in yyyy-MM-dd HH:mm:ss format."),
        temperature_level_code: temperatureLevelCodeSchema,
        remark: s.string("The order remark."),
        shipper_name: s.string("The shipper company name."),
        shipper_contact_name: s.nonEmptyString("The shipper contact name."),
        shipper_contact_tel: s.nonEmptyString("The shipper contact mobile phone."),
        ...flowAddressFields("shipper"),
        require_pickup_time_fm: dateTimeSchema(
          "The pickup window start in yyyy-MM-dd HH:mm:ss format; used with the 提货服务 value-added service.",
        ),
        require_pickup_time_to: dateTimeSchema("The pickup window end in yyyy-MM-dd HH:mm:ss format."),
        consignee_name: s.string("The consignee company name."),
        focus_code: s.string("The client code (客户代码)."),
        consignee_contact_name: s.nonEmptyString("The consignee contact name."),
        consignee_contact_tel: s.nonEmptyString("The consignee contact phone."),
        ...flowAddressFields("consignee"),
        require_delivery_time_fm: dateTimeSchema("The delivery window start in yyyy-MM-dd HH:mm:ss format."),
        require_delivery_time_to: dateTimeSchema("The delivery window end in yyyy-MM-dd HH:mm:ss format."),
        total_weight: s.number("The total weight in kilograms."),
        total_volume: s.number("The total volume in cubic meters."),
        car_type: s.string(
          "The vehicle type (required for 专车 orders), e.g. 4.2米-食品-冷运-冷藏; see the official vehicle list.",
        ),
        freight_fee: s.number(
          "The fixed price (一口价) for a chartered vehicle order; must be greater than 0 when set.",
          {
            exclusiveMinimum: 0,
          },
        ),
        source_code: s.string("The order source code (订单来源)."),
        order_items: s.array("The goods lines.", orderItemSchema(true), { minItems: 1 }),
        order_services: s.array("The value-added services.", orderServiceSchema),
      },
      {
        optional: [
          "monthly_account",
          "remark",
          "shipper_name",
          "require_pickup_time_fm",
          "require_pickup_time_to",
          "consignee_name",
          "focus_code",
          "require_delivery_time_fm",
          "require_delivery_time_to",
          "total_weight",
          "total_volume",
          "car_type",
          "freight_fee",
          "source_code",
          "order_services",
        ],
      },
    ),
    outputSchema: s.object("The created order.", {
      sfOrderNo: s.string("The SF order number (TP-prefixed in production)."),
      erpOrder: s.string("The client order number, echoed back."),
    }),
    followUpActions: ["sf_express.coldchain_query_waybill_no", "sf_express.coldchain_query_route"],
  }),
  defineProviderAction(service, {
    name: "coldchain_cancel_order",
    description: "Cancel an SF Cold Chain transport order that has not been accepted yet.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order to cancel.",
      {
        erp_order: s.nonEmptyString("The client order number (ERP单号) to cancel."),
        sf_order_no: s.nonEmptyString("The SF order number to cancel."),
        source_code: s.string("The order source code (订单来源)."),
      },
      { optional: ["sf_order_no", "source_code"] },
    ),
    outputSchema: s.object("The cancellation result; the upstream returns no content on success.", {}),
  }),
  defineProviderAction(service, {
    name: "coldchain_query_waybill_no",
    description:
      "Query the waybill numbers (master waybill, sign-back receipt number, child waybills) generated for an SF Cold Chain order.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order whose waybill numbers should be queried.",
      {
        erp_order: s.nonEmptyString("The client order number (ERP单号)."),
        sf_order_no: s.nonEmptyString("The SF order number."),
        source_code: s.string("The order source code (订单来源)."),
      },
      { optional: ["sf_order_no", "source_code"] },
    ),
    outputSchema: s.object(
      "The waybill numbers for the order.",
      {
        erpOrder: s.string("The client order number."),
        sfOrderNo: s.string("The SF order number."),
        waybillNo: s.string("The master waybill number."),
        receiptWaybillNo: s.string("The sign-back receipt waybill number."),
        childWaybillNos: s.stringArray("The child waybill numbers."),
      },
      { optional: ["erpOrder", "sfOrderNo", "waybillNo", "receiptWaybillNo", "childWaybillNos"] },
    ),
    followUpActions: ["sf_express.coldchain_query_route"],
  }),
  defineProviderAction(service, {
    name: "coldchain_query_route",
    description:
      "Query SF Cold Chain route events by waybill number, SF order number, or client order number, combined with the order source code.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The route query; at least one identifier plus the order source code.",
        {
          waybill_no: s.nonEmptyString("The waybill number to query by."),
          sf_order_no: s.nonEmptyString("The SF order number to query by."),
          erp_order: s.nonEmptyString("The client order number (ERP单号) to query by."),
          source_code: s.nonEmptyString("The order source code (订单来源)."),
        },
        { optional: ["waybill_no", "sf_order_no", "erp_order"] },
      ),
      ["waybill_no", "sf_order_no", "erp_order"],
    ),
    outputSchema: s.object("The route events.", {
      routes: s.array(
        "The route events.",
        s.object(
          "One route event.",
          {
            routeId: s.string("The event serial number."),
            barScanTm: s.string("The scan time in yyyy-MM-dd HH:mm:ss format."),
            outsideName: s.string("The public name of the operating point."),
            distName: s.string("The city where the event happened."),
            opCode: s.string("The operation code."),
            owsRemark: s.string("The event description."),
            waybillNo: s.string("The waybill number."),
            sfOrderNo: s.string("The SF order number."),
            erpOrder: s.string("The client order number."),
          },
          { optional: ["routeId", "owsRemark"] },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "coldchain_query_order_info",
    description:
      "Query the full details of an SF Cold Chain order, including parties, weights, goods lines, value-added services, and the sign-back receipt.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order whose details should be queried.",
      {
        erp_order: s.nonEmptyString("The client order number (ERP单号)."),
        source_code: s.string("The order source code (订单来源)."),
      },
      { optional: ["source_code"] },
    ),
    outputSchema: s.object("The cold-chain order details.", {
      order: s.unknownObject(
        "The order record: orderNo, erpNo, waybillNo, orderStatus, productCode, paymentTypeCode, addresses, weights, temperature level, driver/vehicle, and more, per the official field list.",
      ),
      childWaybillList: s.array("The child waybills.", s.unknownObject("A child waybill record with childWaybillNo.")),
      orderGoodsList: s.array(
        "The goods lines.",
        s.unknownObject("A goods line with skuCode, skuName, quantity, grossWeight, volume, and more."),
      ),
      orderServiceList: s.array(
        "The value-added services on the order.",
        s.unknownObject("A service line with serviceCode, paymentTypeCode, feeAmount, extensionInfo, and more."),
      ),
      orderReturn: s.nullable(s.unknownObject("The sign-back receipt record, or null when none exists.")),
    }),
  }),
];
