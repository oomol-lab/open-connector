import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema } from "./schemas.ts";

const service = "sf_express";

const tlContactSchema = (role: string): ReturnType<typeof s.object> =>
  s.object(
    `The ${role} contact and address.`,
    {
      contact: s.nonEmptyString("The contact name."),
      mobile: s.nonEmptyString("The contact mobile number."),
      address: s.nonEmptyString("The detailed street address."),
      company: s.nonEmptyString("The company name."),
      province: s.nonEmptyString("The province name, for example 广东省."),
      city: s.nonEmptyString("The city name, for example 深圳市."),
      county: s.nonEmptyString("The district or county name, for example 南山区."),
    },
    { optional: ["company", "province", "city", "county"] },
  );

const tlCargoTypeSchema = s.stringEnum(
  "The cargo category code: 1 医药卫生, 3 汽配, 4 快消品, 6 机具仪器, 7 化工橡塑, 8 服装鞋帽, 9 电子产品, 10 家电, 11 家具, 100 其他.",
  ["1", "3", "4", "6", "7", "8", "9", "10", "11", "100"],
);

const tlPackageTypeSchema = s.stringEnum(
  "The packaging code: 1 裸包装, 2 膜包装, 3 缓冲物包装, 4 纸包装, 5 木包装, 6 其他.",
  ["1", "2", "3", "4", "5", "6"],
);

const tlVehicleTypeSchema = s.stringEnum("The vehicle load capacity in tons: 1, 1.5, 3, 5, 7, 14, 20, or 30.", [
  "1",
  "1.5",
  "3",
  "5",
  "7",
  "14",
  "20",
  "30",
]);

const tlCarTypeSchema = s.stringEnum(
  "The vehicle type code: 002001 厢式运输车, 002007 平板运输车, 002011 中澳运输车, 002012 海关监管运输车, 002010 中港运输车, 002004 冷藏车-双温, 002005 冷藏车-单温, 002006 药品运输冷藏车, 002013 冷藏车, 002024 高栏运输车.",
  ["002001", "002007", "002011", "002012", "002010", "002004", "002005", "002006", "002013", "002024"],
);

const tlCargoSchema = s.object(
  "One cargo entry; all fields are optional per the SF documentation.",
  {
    name: s.nonEmptyString("The cargo name."),
    count: s.integer("The cargo quantity."),
    weight: s.number("The weight in kilograms."),
    length: s.number("The length in centimeters."),
    height: s.number("The height in centimeters."),
    width: s.number("The width in centimeters."),
    volume: s.number("The volume in cubic meters."),
  },
  { optional: ["name", "count", "weight", "length", "height", "width", "volume"] },
);

const tlExpectedStopSchema = s.object(
  "One scheduled stop on the route.",
  {
    stop_address: s.nonEmptyString("The detailed stop address."),
    stop_operate_type: s.integer("The stop operation: 1 装, 2 卸, 3 装卸."),
    stop_province: s.nonEmptyString("The stop province."),
    stop_city: s.nonEmptyString("The stop city."),
    stop_county: s.nonEmptyString("The stop district or county."),
  },
  { optional: ["stop_province", "stop_city", "stop_county"] },
);

const tlAdditionServiceSchema = s.object(
  "One value-added service entry, for example INSURE with the declared value in value.",
  {
    name: s.nonEmptyString("The service name, for example INSURE (保价)."),
    value: s.nonEmptyString("The service value."),
    value1: s.nonEmptyString("Service extension attribute 1."),
    value2: s.nonEmptyString("Service extension attribute 2."),
    value3: s.nonEmptyString("Service extension attribute 3."),
    value4: s.nonEmptyString("Service extension attribute 4."),
  },
  { optional: ["value", "value1", "value2", "value3", "value4"] },
);

const tlExtraInfoSchema = s.requiredObject("One extension attribute.", {
  attr_name: s.nonEmptyString("The extension attribute key."),
  attr_val: s.nonEmptyString("The extension attribute value."),
});

const tlOrderOutputSchema = s.requiredObject("The truckload order.", {
  orderId: s.string("The client order number, echoed back."),
  waybillNo: s.nullableString("The SF waybill number; present when one was generated."),
  signBackWaybillNo: s.nullableString("The sign-back receipt waybill number, when the sign-back service applies."),
});

const cityAddressSchema = s.object(
  "One order address (发货/收货地址).",
  {
    coordinate: s.nonEmptyString("The longitude,latitude pair, for example 113.93041,22.53332."),
    contact: s.nonEmptyString("The contact name."),
    tel: s.nonEmptyString("The contact phone number."),
    address: s.nonEmptyString("The address."),
    address_detail: s.nonEmptyString("The detailed address line."),
    floor: s.integer("The floor; pass 0 when no upstairs service is needed. Defaults to 0 when omitted."),
    lift: s.boolean(
      "Whether the building has an elevator. Defaults to no elevator when omitted, which can raise the upstairs fee.",
    ),
    reply_status: s.boolean("Whether a signed receipt is uploaded for this address."),
  },
  { optional: ["address_detail", "floor", "lift", "reply_status"] },
);

const cityAddressListOutputSchema = s.array(
  "The order's pickup and delivery addresses.",
  s.object("One order address.", {
    serialNo: s.integer("The address sequence: 0 is the pickup address, later entries are delivery addresses."),
    address: s.string("The address."),
    floor: s.integer("The floor."),
    lift: s.integer("Whether the building has an elevator: 0 no, 1 yes."),
    contact: s.string("The contact name."),
    tel: s.string("The contact phone number."),
  }),
);

const cityVasFeeSchema = s.object(
  "One value-added service to apply.",
  {
    vas_code: s.nonEmptyString("The service code, for example BAOJIA (保价) or DIANZIHUIDAN (电子回单)."),
    num: s.integer("The insured amount or package count, when the service needs one."),
  },
  { optional: ["num"] },
);

const cityOrderStatusSchema = s.integer(
  "The order status: 1 待处理, 2 服务中, 3 已完成, 4 已取消, 5 待支付, 9 供应商待处理.",
);

/** Actions for the SF Express Freight truckload and city-delivery endpoints. */
export const sfExpressFreightTlCityActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "freight_create_tl_order",
    description:
      "Create an SF Freight truckload (整车直达) order. Set generate_waybill_no to have SF assign a waybill number, or pass your own waybill_no. A monthly card (monthly_card) is required when pay_method is 1 (寄付月结) or 2 (寄付转第三方).",
    requiredScopes: [],
    inputSchema: s.object(
      "The truckload order to create.",
      {
        order_id: s.nonEmptyString("The unique client order number."),
        pay_method: s.integer("The payment method: 1 寄付月结, 2 寄付转第三方, 3 寄付现结."),
        sender: tlContactSchema("sender"),
        recipient: tlContactSchema("recipient"),
        generate_waybill_no: s.boolean("Whether SF assigns the waybill number. When false, waybill_no is required."),
        waybill_no: s.nonEmptyString("Your own waybill number; used when generate_waybill_no is false."),
        monthly_card: s.nonEmptyString(
          "The SF monthly settlement card (月结卡号); required when pay_method is 1 or 2.",
        ),
        required_delivery_time: dateTimeSchema("The requested pickup time in YYYY-MM-DD HH:mm:ss format."),
        cargo_type: tlCargoTypeSchema,
        package_type: tlPackageTypeSchema,
        cargo_name: s.nonEmptyString("The cargo name, for example 冰箱."),
        total_cargo_quantity: s.integer("The total number of cargo items."),
        total_cargo_weight: s.number("The total cargo weight in kilograms."),
        total_cargo_volume: s.number("The total cargo volume in cubic meters."),
        vehicle_type: tlVehicleTypeSchema,
        car_type: tlCarTypeSchema,
        need_tracking_return: s.boolean(
          "Whether the sign-back receipt service is required (arrange it with your SF contact first).",
        ),
        receive_remark: s.nonEmptyString("The pickup remark for the order."),
        delivery_remark: s.nonEmptyString("The delivery remark for the order."),
        emp_code: s.nonEmptyString("The designated pickup courier employee code."),
        price: s.number("The estimated freight price in CNY."),
        cargoes: s.array("The cargo entries.", tlCargoSchema),
        expected_stops: s.array("The scheduled stops on the route.", tlExpectedStopSchema),
        addition_services: s.array("The value-added services to apply.", tlAdditionServiceSchema),
        extra_infos: s.array("The extension attributes.", tlExtraInfoSchema),
      },
      {
        optional: [
          "generate_waybill_no",
          "waybill_no",
          "monthly_card",
          "required_delivery_time",
          "cargo_type",
          "package_type",
          "cargo_name",
          "total_cargo_quantity",
          "total_cargo_weight",
          "total_cargo_volume",
          "vehicle_type",
          "car_type",
          "need_tracking_return",
          "receive_remark",
          "delivery_remark",
          "emp_code",
          "price",
          "cargoes",
          "expected_stops",
          "addition_services",
          "extra_infos",
        ],
      },
    ),
    outputSchema: tlOrderOutputSchema,
    followUpActions: ["sf_express.freight_query_tl_order"],
  }),
  defineProviderAction(service, {
    name: "freight_cancel_tl_order",
    description:
      "Cancel an SF Freight truckload order. Cancellation only succeeds while the order is in a cancellable state; otherwise the error message explains why.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order to cancel.",
      {
        order_id: s.nonEmptyString("The client order number."),
        waybill_no: s.nonEmptyString("The SF waybill number; takes precedence when provided."),
        operator: s.nonEmptyString("The operator name."),
        cancel_reason: s.nonEmptyString("The cancellation reason."),
      },
      { optional: ["waybill_no", "operator", "cancel_reason"] },
    ),
    outputSchema: s.object("The cancellation result.", {
      orderId: s.string("The client order number, echoed back."),
      cancelled: s.literal(true, { description: "The order was cancelled." }),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_query_tl_order",
    description:
      "Query an SF Freight truckload order by client order number; pass waybill_no as well when you have it.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order to query.",
      {
        order_id: s.nonEmptyString("The client order number."),
        waybill_no: s.nonEmptyString("The SF waybill number."),
      },
      { optional: ["waybill_no"] },
    ),
    outputSchema: tlOrderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "freight_create_vehicle_track_url",
    description:
      "Create the vehicle track playback page URL for an SF Freight waybill. Requires the monthly card that paid the waybill.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill whose vehicle track page should be generated.", {
      waybill_no: s.nonEmptyString("The SF waybill number."),
      monthly_card: s.nonEmptyString("The SF monthly settlement card (月结卡号) for the waybill."),
    }),
    outputSchema: s.object("The vehicle track page.", {
      url: s.string("The vehicle track playback page URL."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_confirm_order",
    description:
      "Place an SF Freight city-delivery (城市配送货运) order. send_start_time must be at least 2 hours in the future.",
    requiredScopes: [],
    inputSchema: s.object(
      "The city-delivery order to place.",
      {
        vehicle: s.nonEmptyString("The vehicle model, for example 中面 or 4.2米箱货."),
        car_num: s.integer("The number of vehicles.", { minimum: 1 }),
        send_start_time: dateTimeSchema(
          "The requested pickup time in YYYY-MM-DD HH:mm:ss format; must be at least 2 hours ahead.",
        ),
        address_list: s.array("The pickup and delivery addresses.", cityAddressSchema, { minItems: 1 }),
        phone: s.nonEmptyString("The ordering phone number."),
        nickname: s.nonEmptyString("The ordering user nickname."),
        place: s.nonEmptyString("The origin city, for example 深圳市."),
        destination_city: s.nonEmptyString("The destination city."),
        monthly_card: s.nonEmptyString("The SF monthly settlement card (月结卡号)."),
        vas_fee_list: s.array("The value-added services to apply.", cityVasFeeSchema),
        remark: s.nonEmptyString("The order remark."),
        customer_order_no: s.nonEmptyString("Your own order reference number."),
        goods_name: s.nonEmptyString("The goods name, at most 100 characters.", { maxLength: 100 }),
      },
      { optional: ["vas_fee_list", "remark", "customer_order_no", "goods_name"] },
    ),
    outputSchema: s.object("The placed city-delivery order.", {
      orderNo: s.string("The SF city-delivery order number."),
    }),
    followUpActions: ["sf_express.freight_city_get_order_detail"],
  }),
  defineProviderAction(service, {
    name: "freight_city_calc_fee",
    description: "Calculate the freight fee for an SF Freight city-delivery shipment before ordering.",
    requiredScopes: [],
    inputSchema: s.object(
      "The shipment whose fee should be calculated.",
      {
        vehicle: s.nonEmptyString("The vehicle model, for example 4.2米箱货."),
        car_num: s.integer("The number of vehicles.", { minimum: 1 }),
        send_start_time: dateTimeSchema("The planned pickup time in YYYY-MM-DD HH:mm:ss format."),
        addresses: s.array("The order addresses.", cityAddressSchema, { minItems: 1 }),
        city: s.nonEmptyString("The city, for example 深圳市."),
        order_source: s.nonEmptyString("The order source tag."),
        vas_fee_list: s.array("The value-added services to price.", cityVasFeeSchema),
      },
      { optional: ["vas_fee_list"] },
    ),
    outputSchema: s.object("The city-delivery fee breakdown.", {
      baseFee: s.number("The base freight fee in CNY."),
      totalFee: s.number("The total fee in CNY."),
      totalVasFee: s.number("The total value-added service fee in CNY."),
      mileage: s.number("The mileage in kilometers."),
      cutPayment: s.number("The deducted payment in CNY, when returned."),
      orderVasFeeList: s.array(
        "The per-service fee breakdown.",
        s.object("One value-added service fee.", {
          vasCode: s.string("The service code."),
          vehicle: s.string("The vehicle model."),
          num: s.integer("The insured amount or package count, when returned."),
          fee: s.number("The service fee in CNY."),
          name: s.string("The service name."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_list_orders",
    description:
      "List SF Freight city-delivery orders for an ordering phone number, with optional time and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order list filters.",
      {
        phone: s.nonEmptyString("The ordering phone number."),
        create_time_start: dateTimeSchema("The start of the order creation time range."),
        create_time_end: dateTimeSchema("The end of the order creation time range."),
        index: s.positiveInteger("The page number, starting from 1."),
        size: s.positiveInteger("The page size (10 by default)."),
      },
      { optional: ["create_time_start", "create_time_end", "index", "size"] },
    ),
    outputSchema: s.object("The city-delivery orders.", {
      orders: s.array(
        "The orders.",
        s.object("One city-delivery order.", {
          orderNo: s.string("The order number."),
          orderTime: s.string("The order creation time."),
          finishTime: s.string("The service completion time."),
          contact: s.string("The contact name."),
          tel: s.string("The contact phone number."),
          orderStatus: cityOrderStatusSchema,
          remark: s.string("The order remark."),
          customerOrderNo: s.string("The client order reference number."),
          totalFee: s.number("The total fee in CNY."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_get_order_detail",
    description: "Get the details of an SF Freight city-delivery order by order number or client order number.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The order whose details should be returned.",
        {
          order_no: s.nonEmptyString("The SF city-delivery order number."),
          customer_order_no: s.nonEmptyString("Your own order reference number."),
        },
        { optional: ["order_no", "customer_order_no"] },
      ),
      ["order_no", "customer_order_no"],
    ),
    outputSchema: s.object("The city-delivery order detail.", {
      orderNo: s.string("The order number."),
      orderTime: s.string("The order creation time."),
      finishTime: s.string("The service completion time."),
      monthSettlementCard: s.string("The monthly settlement card used."),
      contact: s.string("The contact name."),
      tel: s.string("The contact phone number."),
      sendStartTime: s.string("The scheduled pickup time."),
      orderStatus: cityOrderStatusSchema,
      mileage: s.number("The mileage in kilometers."),
      mileageFee: s.number("The mileage fee in CNY."),
      remark: s.string("The order remark."),
      customerOrderNo: s.string("The client order reference number."),
      carNumber: s.integer("The number of vehicles."),
      totalFee: s.number("The total fee in CNY."),
      vasTotal: s.number("The total value-added service fee in CNY."),
      vehicle: s.string("The vehicle model."),
      city: s.string("The city."),
      payType: s.integer("The payment type."),
      chauffeurName: s.string("The driver name."),
      chauffeurTel: s.string("The driver phone number."),
      chauffeurCoordinate: s.string("The driver's latest longitude,latitude position."),
      cancelMessage: s.string("The cancellation reason, when cancelled."),
      addressList: cityAddressListOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_cancel_order",
    description: "Cancel an SF Freight city-delivery order.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The order to cancel; provide order_no or customer_order_no.",
        {
          cancel_message: s.nonEmptyString("The cancellation reason."),
          order_no: s.nonEmptyString("The SF city-delivery order number."),
          customer_order_no: s.nonEmptyString("Your own order reference number."),
        },
        { optional: ["order_no", "customer_order_no"] },
      ),
      ["order_no", "customer_order_no"],
    ),
    outputSchema: s.object("The cancellation result.", {
      orderNo: s.nullableString("The order number, echoed back when one was provided."),
      customerOrderNo: s.nullableString("The client order reference number, echoed back when provided."),
      cancelled: s.literal(true, { description: "The order was cancelled." }),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_list_available_vas",
    description: "List the value-added services available for a city and vehicle model in SF Freight city delivery.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The city and vehicle whose services should be listed.", {
      place: s.nonEmptyString("The city, for example 深圳市."),
      vehicle: s.nonEmptyString("The vehicle model, for example 4.2米箱货."),
    }),
    outputSchema: s.object("The available value-added services.", {
      services: s.array(
        "The available services.",
        s.object(
          "One available value-added service.",
          {
            vasCode: s.string("The service code, for example BAOJIA (保价)."),
            name: s.string("The service name."),
            numUnit: s.nullableString("The billing unit."),
            bailMinFee: s.string("The minimum charge."),
            fee: s.string("The unit price."),
            infoName: s.nullableString("The name of the quantity field this service expects."),
          },
          { optional: ["bailMinFee", "fee"] },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_list_vehicles",
    description: "List the vehicle models available for a city and business scenario in SF Freight city delivery.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The city and scenario whose vehicle models should be listed.", {
      city: s.nonEmptyString("The city name, for example 深圳市."),
      order_category: s.integer("The business scenario: 1 个人搬家, 2 标准货运."),
    }),
    outputSchema: s.object("The available vehicle models.", {
      carModels: s.array(
        "The available vehicle models.",
        s.object(
          "One vehicle model.",
          {
            model: s.string("The model name, for example 依维柯."),
            weight: s.number("The load capacity in tons."),
            length: s.number("The cargo box length in meters."),
            width: s.number("The cargo box width in meters."),
            height: s.number("The cargo box height in meters."),
            volume: s.number("The cargo box volume in cubic meters."),
            flag: s.integer("Whether the model has special specifications."),
            specialModelList: s.array(
              "The selectable special specifications.",
              s.object("One special specification.", {
                name: s.string("The specification name, for example 双排座."),
                code: s.string("The specification code, for example SHUANGPAIZUO."),
              }),
            ),
            photo: s.string("The vehicle model picture URL."),
          },
          {
            optional: ["weight", "length", "width", "height", "volume", "flag", "photo", "specialModelList"],
          },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_list_cities",
    description: "List the cities where SF Freight city delivery is available.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The available cities.", {
      cities: s.array("The city names.", s.string("A city name, for example 深圳市.")),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_city_list_appointment_times",
    description: "Get the pickup appointment time window available for a city in SF Freight city delivery.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The city whose appointment window should be read.", {
      city: s.nonEmptyString("The city, for example 深圳市."),
    }),
    outputSchema: s.object("The available appointment time window.", {
      startTime: s.string("The earliest pickup time, for example 08:00:00."),
      endTime: s.string("The latest pickup time, for example 23:00:00."),
    }),
  }),
];
