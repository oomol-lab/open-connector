import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema, waybillNoSchema } from "./schemas.ts";

const service = "sf_express";

/** The acknowledgement every supplier-side upload endpoint returns. */
const uploadAckOutputSchema = (echoDescription: string): ReturnType<typeof s.object> =>
  s.object("The upload acknowledgement.", {
    accepted: s.boolean("Whether SF accepted the upload."),
    waybillNo: s.string(echoDescription),
  });

const forwardOrderStatusSchema = s.integer(
  "The order status: 40 提货, 41 提货发车, 45 提货交接, 55 确认交接, 57 干线发车, 65 干线到达, 70 派送开始, 75 派件入仓.",
);

const routerInfoSchema = s.object(
  "One route entry; entries are uploaded incrementally, newest first.",
  {
    uniqueId: s.nonEmptyString("The unique id of this route entry, used by SF to deduplicate; a UUID works."),
    status: s.integer("The waybill status when the route happened; 0 = in transit."),
    operator: s.nonEmptyString("The operator name or employee code."),
    operateTime: dateTimeSchema("The time the route event actually happened in YYYY-MM-DD HH:mm:ss format."),
    context: s.nonEmptyString(
      "The route description, following the official node wording (装车/出运/卸车/派件出仓/签收).",
    ),
    cityName: s.nonEmptyString("The city where the route event happened."),
    provinceName: s.nonEmptyString("The province where the route event happened."),
    countyName: s.nonEmptyString("The county where the route event happened; required for return-receipt routes."),
  },
  { optional: ["countyName"] },
);

const trackPointSchema = s.object(
  "One vehicle track point.",
  {
    waybillNo: waybillNoSchema,
    timestamp: s.integer("The time the position was recorded, as epoch milliseconds."),
    licensePlateNumber: s.string("The vehicle plate number, for example 粤B88888."),
    driver: s.string("The driver name."),
    driverPhone: s.string("The driver phone number."),
    province: s.string("The province name."),
    city: s.string("The city name."),
    county: s.string("The county name."),
    address: s.string("The current address."),
    latitude: s.number("The latitude."),
    longitude: s.number("The longitude."),
    elevation: s.number("The elevation in meters."),
    latLongType: s.integer("The coordinate system: 1 百度, 2 高德, 3 Google."),
    source: s.nonEmptyString("The position source, for example GPS, 人工维护, or 定点签到."),
    remark: s.string("A remark."),
    traceType: s.integer("The check-in type: 1 发车, 2 点到, 3 派送中."),
    sispRouter: s.string("The SISP route text; only for the 干配转顺心 business line."),
    sispRouterExtend: s.record("The SISP route extension map; only for the 干配转顺心 business line.", true),
  },
  {
    optional: [
      "licensePlateNumber",
      "driver",
      "driverPhone",
      "province",
      "city",
      "county",
      "address",
      "latitude",
      "longitude",
      "elevation",
      "latLongType",
      "remark",
      "traceType",
      "sispRouter",
      "sispRouterExtend",
    ],
  },
);

const abnormalCodeSchema = s.stringEnum(
  "The exception code: HANDOVER_01 货物损坏, HANDOVER_06 复磅申诉, HANDOVER_07 疫情管控时效延误, HANDOVER_08 货物多件/少件 (装货交接); TRANSITING_10 货物损坏, TRANSITING_12 疫情管控时效延误, TRANSITING_13 货物多件/少件, TRANSITING_14 堵车, TRANSITING_15 事故/封路, TRANSITING_16 违禁品, TRANSITING_17 复磅申诉 (运输打卡); SIGN_01 堵车/事故/封路/天气等延误, SIGN_03 客户节假日停止营业, SIGN_04 无法联系客户, SIGN_05 客户改派送时间, SIGN_07 客户改派送地址, SIGN_13 疫情管控时效延误, SIGN_14 违禁品, SIGN_15 入仓排队时效延误, SIGN_17 客户拒收, SIGN_18 客户要求自取 (货物运达).",
  [
    "HANDOVER_01",
    "HANDOVER_06",
    "HANDOVER_07",
    "HANDOVER_08",
    "TRANSITING_10",
    "TRANSITING_12",
    "TRANSITING_13",
    "TRANSITING_14",
    "TRANSITING_15",
    "TRANSITING_16",
    "TRANSITING_17",
    "SIGN_01",
    "SIGN_03",
    "SIGN_04",
    "SIGN_05",
    "SIGN_07",
    "SIGN_13",
    "SIGN_14",
    "SIGN_15",
    "SIGN_17",
    "SIGN_18",
  ],
);

const fbaShipmentIdSchema = s.string("The FBA shipment id.", { pattern: "^FBA[0-9A-Z]{7,9}$" });

export const sfExpressFreightForwardCrossborderActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "freight_forward_upload_sign_image",
    description:
      "Upload the recipient's signature or other proof-of-delivery images for an SF Freight forwarding waybill; SF reviews them and then marks the waybill signed. Image URLs must be publicly accessible.",
    requiredScopes: [],
    inputSchema: s.object(
      "The sign-image upload.",
      {
        waybill_no: waybillNoSchema,
        scan_time: dateTimeSchema("The scan time in YYYY-MM-DD HH:mm:ss format."),
        pic_urls: s.stringArray("The waybill sign image URLs.", { minItems: 1 }),
        scan_station: s.string("The scanning station code."),
        scan_operator: s.string("The scanning operator employee code."),
        scan_area_code: s.string("The scanning regional office code."),
        sign_back_pics: s.stringArray("The sign-back photo URLs."),
        deliver_goods_pics: s.stringArray("The delivery photo URLs."),
        remark: s.string("A remark.", { maxLength: 512 }),
        auto_audit: s.boolean("Whether the uploaded sign images skip manual review; default false."),
        ocr_auto_audit: s.boolean("Whether OCR review applies; default true."),
        delay_remark: s.string(
          "The delay explanation; required when scan_time is later than the promised delivery time.",
        ),
        latitude: s.number("The upload latitude."),
        longitude: s.number("The upload longitude."),
        original: s.integer("Whether this is the original receipt: 1 original, 0 lost or other.", {
          maximum: 1,
          minimum: 0,
        }),
        city: s.string("The operating city.", { maxLength: 32 }),
        sisp_router: s.string("The SISP route text; only for the 干配转顺心 business line."),
        sisp_router_extend: s.record("The SISP route extension map; only for the 干配转顺心 business line.", true),
      },
      {
        optional: [
          "scan_station",
          "scan_operator",
          "scan_area_code",
          "sign_back_pics",
          "deliver_goods_pics",
          "remark",
          "auto_audit",
          "ocr_auto_audit",
          "delay_remark",
          "latitude",
          "longitude",
          "original",
          "city",
          "sisp_router",
          "sisp_router_extend",
        ],
      },
    ),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_upload_driver",
    description:
      "Upload the pickup driver information for an SF Freight forwarding order once the carrier assigns the driver.",
    requiredScopes: [],
    inputSchema: s.object(
      "The driver information to upload.",
      {
        forward_order_id: s.integer("The SF Freight forwarding order number (快运转寄订单号)."),
        waybill_no: waybillNoSchema,
        driver: s.nonEmptyString("The driver name."),
        driver_mobile: s.nonEmptyString("The driver mobile number."),
        license_plate_number: s.nonEmptyString("The vehicle plate number, for example 粤B1F5489."),
        carrier_company: s.string("The carrier company name."),
        carrier_phone: s.string("The carrier company phone number."),
      },
      { optional: ["carrier_company", "carrier_phone"] },
    ),
    outputSchema: s.object("The upload acknowledgement.", {
      accepted: s.boolean("Whether SF accepted the upload."),
      forwardOrderId: s.integer("The forwarding order number, echoed back."),
      waybillNo: s.string("The waybill number, echoed back."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_forward_upload_track_batch",
    description:
      "Upload multiple vehicle track points for one SF Freight forwarding waybill in a single call. All track points must belong to the same waybill number.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The track points to upload.", {
      tracks: s.array("The track points, all for the same waybill number.", trackPointSchema, { minItems: 1 }),
    }),
    outputSchema: s.object("The upload acknowledgement.", {
      accepted: s.boolean("Whether SF accepted the upload."),
      count: s.integer("The number of track points uploaded."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_forward_upload_waybill_remark",
    description: "Upload a remark for an SF Freight forwarding waybill.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill remark.", {
      waybill_no: waybillNoSchema,
      operator: s.nonEmptyString("The operator name."),
      remark: s.nonEmptyString("The remark content.", { maxLength: 500 }),
    }),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_upload_receipt",
    description: "Upload the sign-back receipt number for an SF Freight forwarding waybill.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The receipt reference.", {
      waybill_no: waybillNoSchema,
      return_waybill_no: s.nonEmptyString("The sign-back receipt waybill number (签回单号)."),
      company: s.nonEmptyString("The carrier company name, for example 顺丰物流."),
    }),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_update_order_status",
    description: "Upload a real-time order status update for an SF Freight forwarding shipment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order status update.",
      {
        forward_order_id: s.integer("The SF Freight forwarding order number (快运转寄订单号)."),
        waybill_no: waybillNoSchema,
        status: forwardOrderStatusSchema,
        remark: s.string("A remark.", { maxLength: 256 }),
        operate_time: dateTimeSchema("The time the status changed in YYYY-MM-DD HH:mm:ss format."),
        operator: s.string("The operator, for example the driver or dispatcher name."),
        contact: s.string("A contact name, for example the business contact or regional manager."),
        contact_phone: s.string("The contact phone number."),
        pic_urls: s.stringArray("Publicly accessible image URLs; SF fetches them asynchronously."),
        number: s.integer("The actual box count of the waybill."),
        box_nos: s.stringArray("The box codes actually scanned at pickup handover."),
        is_check: s.integer(
          "The waybill verification result at pickup handover: 0 = information correct, 1 = waybill information wrong (then abnormal is required).",
          { maximum: 1, minimum: 0 },
        ),
        abnormal: s.string("The abnormality remark, including major incidents.", { maxLength: 512 }),
        volume: s.number("The verified total volume in cm³; may be reported at pickup handover."),
        weight: s.number("The verified total weight in kg; may be reported at pickup handover."),
        latitude: s.number("The latitude of the operation."),
        longitude: s.number("The longitude of the operation."),
        city: s.string("The operating city.", { maxLength: 32 }),
        important_event_remark: s.string("The major event note.", { maxLength: 256 }),
        sisp_router: s.string("The SISP route text; only for the 干配转顺心 business line."),
        sisp_router_extend: s.string("The SISP route extension info; only for the 干配转顺心 business line."),
      },
      {
        optional: [
          "remark",
          "operate_time",
          "operator",
          "contact",
          "contact_phone",
          "pic_urls",
          "number",
          "box_nos",
          "is_check",
          "abnormal",
          "volume",
          "weight",
          "latitude",
          "longitude",
          "city",
          "important_event_remark",
          "sisp_router",
          "sisp_router_extend",
        ],
      },
    ),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_upload_route",
    description:
      "Upload route events for an SF Freight forwarding waybill. Upload incrementally, newest first; cover all loading, unloading, and out-for-delivery nodes (use freight_forward_upload_sign_image for the signed node).",
    requiredScopes: [],
    inputSchema: s.object(
      "The route upload.",
      {
        waybill_no: s.nonEmptyString("The master waybill number (母单)."),
        sub_waybill_no: s.string("The sub waybill number; when set, the routes are uploaded for the sub waybill."),
        status: s.integer("The current waybill signing status; only 0 (in transit) is supported.", {
          maximum: 0,
          minimum: 0,
        }),
        router_infos: s.array("The route entries.", routerInfoSchema, { minItems: 1 }),
      },
      { optional: ["sub_waybill_no"] },
    ),
    outputSchema: uploadAckOutputSchema("The master waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_upload_track",
    description: "Upload one vehicle track point for an SF Freight forwarding waybill.",
    requiredScopes: [],
    inputSchema: s.object(
      "The track point to upload.",
      {
        waybill_no: waybillNoSchema,
        timestamp: s.integer("The time the position was recorded, as epoch milliseconds."),
        source: s.nonEmptyString("The position source, for example GPS, 人工维护, or 定点签到."),
        trace_type: s.integer("The check-in type: 1 发车, 2 点到, 3 派送中."),
        license_plate_number: s.string("The vehicle plate number, for example 粤B88888."),
        driver: s.string("The driver name."),
        driver_phone: s.string("The driver phone number."),
        province: s.string("The province name."),
        city: s.string("The city name."),
        county: s.string("The county name."),
        address: s.string("The current address."),
        latitude: s.number("The latitude."),
        longitude: s.number("The longitude."),
        elevation: s.number("The elevation in meters."),
        lat_long_type: s.integer("The coordinate system: 1 百度, 2 高德, 3 Google."),
        remark: s.string("A remark."),
        sisp_router: s.string("The SISP route text; only for the 干配转顺心 business line."),
        sisp_router_extend: s.record("The SISP route extension map; only for the 干配转顺心 business line.", true),
      },
      {
        optional: [
          "trace_type",
          "license_plate_number",
          "driver",
          "driver_phone",
          "province",
          "city",
          "county",
          "address",
          "latitude",
          "longitude",
          "elevation",
          "lat_long_type",
          "remark",
          "sisp_router",
          "sisp_router_extend",
        ],
      },
    ),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_apply_add_fee",
    description:
      "Apply for an additional last-mile fee on an SF Freight forwarding waybill; currently only 入仓垫付 (warehouse entry advance, type 50) is supported.",
    requiredScopes: [],
    inputSchema: s.object(
      "The fee application.",
      {
        waybill_no: waybillNoSchema,
        fee_type: s.integer("The fee type: 50 = 入仓垫付 (warehouse entry advance)."),
        report_image: s.nonEmptyString("A publicly accessible URL of the supporting image."),
        amount: s.number("The additional fee amount.", { exclusiveMinimum: 0 }),
        report_remark: s.string("A remark.", { maxLength: 500 }),
      },
      { optional: ["report_remark"] },
    ),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_place_return_order",
    description: "Place a return-receipt order (标快到付) for one or more SF Freight forwarding waybills.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The return-receipt order.", {
      waybill_nos: s.stringArray("The waybill numbers.", { minItems: 1 }),
      send_contact: s.nonEmptyString("The sender contact name."),
      send_mobile: s.nonEmptyString("The sender mobile number."),
      send_province: s.nonEmptyString("The sender province name."),
      send_city: s.nonEmptyString("The sender city name."),
      send_county: s.nonEmptyString("The sender county or district name."),
      send_address: s.nonEmptyString("The sender detailed address, without province/city/district."),
    }),
    outputSchema: s.object("The order placement result.", {
      result: s.unknownObject(
        "The order response returned by SF (CreateOrderResponse; its fields are not documented).",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_forward_report_exception",
    description:
      "Report an exception for an SF Freight forwarding waybill, for example damage, miscount, delay, or a reweigh appeal. delay_days is required for codes SIGN_03/SIGN_05/SIGN_15/TRANSITING_15; weight and sub_items are required for the reweigh codes HANDOVER_06/TRANSITING_17.",
    requiredScopes: [],
    inputSchema: s.object(
      "The exception report.",
      {
        waybill_no: waybillNoSchema,
        abnormal_type: s.integer("The exception stage: 0 装货交接, 1 运输打卡, 2 货物运达.", {
          maximum: 2,
          minimum: 0,
        }),
        abnormal_code: abnormalCodeSchema,
        supplier_code: s.string("The forwarding supplier code; required for reweigh appeals."),
        upload_time: dateTimeSchema("The upload time in YYYY-MM-DD HH:mm:ss format."),
        upload_operator: s.string("The uploader name."),
        remark: s.string("The exception description."),
        weight: s.string("The weight in kg; required for reweigh codes."),
        volume: s.string("The volume in cm³."),
        delay_days: s.integer("The delay in days; required for the delay codes."),
        pic_url: s.string("Image URLs, joined with English semicolons."),
        sub_items: s.array(
          "The per-piece exception dimensions; required for reweigh codes.",
          s.object("One sub-item exception.", {
            length: s.string("The length in cm."),
            width: s.string("The width in cm."),
            height: s.string("The height in cm."),
            quantity: s.integer("The piece count."),
          }),
        ),
      },
      {
        optional: [
          "supplier_code",
          "upload_time",
          "upload_operator",
          "remark",
          "weight",
          "volume",
          "delay_days",
          "pic_url",
          "sub_items",
        ],
      },
    ),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_start_pay",
    description: "Get the payment QR code for an unpaid SF Freight forwarding waybill.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill to pay.", {
      waybill_no: waybillNoSchema,
      supplier_code: s.nonEmptyString("The forwarding supplier code (供应商编码)."),
      client_code: s.nonEmptyString(
        "The supplier access code (对接供应商的接入编码) SF issues; sent beside msgData as clientCode.",
      ),
    }),
    outputSchema: s.object("The payment start result.", {
      result: s.unknown(
        "The raw payment result returned by SF; carries the QR code information when the waybill is unpaid.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_forward_apply_monthly_payment",
    description:
      "Bind the payment of an SF Freight forwarding waybill to a monthly settlement card (月结卡号) so the fee is charged to it. Requires a monthly card.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The monthly-payment binding.",
        {
          waybill_no: waybillNoSchema,
          supplier_code: s.nonEmptyString("The forwarding supplier code (供应商编码)."),
          client_code: s.nonEmptyString(
            "The supplier access code (对接供应商的接入编码) SF issues; sent beside msgData as clientCode.",
          ),
          operator: s.nonEmptyString("The operator name or code."),
          mon_code: s.string("The monthly settlement card number (月结卡号)."),
          mon_code_id: s.string("The monthly settlement card id; one of mon_code or mon_code_id is required."),
        },
        { optional: ["mon_code", "mon_code_id"] },
      ),
      ["mon_code", "mon_code_id"],
    ),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_forward_upload_return_route",
    description:
      "Upload route events for an SF Freight forwarding return receipt. Upload incrementally, newest first; cover all loading, unloading, out-for-delivery, and signed nodes.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The return-receipt route upload.", {
      waybill_no: s.nonEmptyString("The return-receipt master waybill number (回单号)."),
      router_infos: s.array("The route entries.", routerInfoSchema, { minItems: 1 }),
    }),
    outputSchema: uploadAckOutputSchema("The return-receipt waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_report_trace",
    description:
      "Report logistics traces for an SF cross-border bulky shipment, as the carrier agent. Routes are stored newest first; milestone values make the corresponding nodes visible to end customers.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The trace report.", {
      reference_no: s.nonEmptyString("The SF master waybill number (顺丰母单号)."),
      client_code: s.nonEmptyString("The reporting agent's short code (代理商简称), for example TWTH."),
      routes: s.array(
        "The dynamic route events, newest first.",
        s.object(
          "One route event.",
          {
            opTime: s.integer("The operation time as epoch milliseconds."),
            opDesc: s.nonEmptyString("The operation description (route text)."),
            mileStone: s.stringEnum("The customer-visible milestone, when the event matches one.", [
              "InfoReceived",
              "PickedUp",
              "Departure",
              "Arrival",
              "AvailableForPickup",
              "OutForDelivery",
              "Delivered",
              "Returned",
              "Returning",
            ]),
          },
          { optional: ["mileStone"] },
        ),
        { minItems: 1 },
      ),
      base_routes: s.array(
        "The base route information.",
        s.object(
          "One base route entry.",
          {
            serviceType: s.stringEnum("The info type.", ["TransferNo", "ShipNo", "FlightNo", "ISA", "Port"]),
            transferNo: s.string("The transfer number; required when serviceType is TransferNo."),
            shipNo: s.string("The vessel name; required when serviceType is ShipNo."),
            flightNo: s.string("The flight number; required when serviceType is FlightNo."),
            etd: s.string("The estimated departure time in YYYY-MM-DD HH:mm:ss format."),
            eta: s.string("The estimated arrival time in YYYY-MM-DD HH:mm:ss format."),
            isaId: s.string("The ISA id (Amazon inbound appointment number)."),
            carrierCode: s.string(
              "The carrier code for TransferNo entries, for example FEDEX, DHL, UPS, TNT, GLS, DPD.",
            ),
            departPort: s.string("The departure port code for Port entries."),
            arrivePort: s.string("The arrival port code for Port entries."),
          },
          {
            optional: [
              "transferNo",
              "shipNo",
              "flightNo",
              "etd",
              "eta",
              "isaId",
              "carrierCode",
              "departPort",
              "arrivePort",
            ],
          },
        ),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.object("The trace report acknowledgement.", {
      accepted: s.boolean("Whether SF accepted the report."),
      referenceNo: s.string("The master waybill number, echoed back."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_place_order",
    description:
      "Place an SF cross-border bulky (大件跨境) order and receive the master and sub waybill numbers. A monthly card (monthly_card) is required when settlement_type is 2 (寄付月结).",
    requiredScopes: [],
    inputSchema: s.object(
      "The cross-border order.",
      {
        customer_reference_no: s.nonEmptyString("The unique client order number."),
        username: s.nonEmptyString("The ordering account (mobile number)."),
        settlement_type: s.stringEnum("The payment type: 1 = 寄付现结 (pay now), 2 = 寄付月结 (monthly settlement).", [
          "1",
          "2",
        ]),
        monthly_card: s.nonEmptyString("The monthly settlement card number; required when settlement_type is 2."),
        receiver_type: s.stringEnum(
          "The destination address type: 1 FBA仓库, 2 非FBA地址, 3 沃尔玛仓库, 4 顺丰海外仓, 5 希音仓库.",
          ["1", "2", "3", "4", "5"],
        ),
        warehouse_code: s.string("The FBA warehouse code; required when receiver_type is 1 (FBA仓库)."),
        recipient: s.object(
          "The recipient. address, contact, mobile, and post_code are required for non-FBA destinations.",
          {
            country: s.nonEmptyString("The destination country/region name (English), for example US."),
            country_code: s.nonEmptyString("The destination country/region code, for example US."),
            address: s.string("The detailed address."),
            city: s.string("The city."),
            company: s.string("The company name."),
            contact: s.string("The contact name."),
            mobile: s.string("The mobile number."),
            post_code: s.string("The postal code."),
            province: s.string("The province or state."),
          },
          { optional: ["address", "city", "company", "contact", "mobile", "post_code", "province"] },
        ),
        sender: s.object(
          "The sender.",
          {
            address: s.nonEmptyString("The detailed address."),
            contact: s.nonEmptyString("The contact name."),
            province: s.nonEmptyString("The province name in Chinese."),
            city: s.nonEmptyString("The city name in Chinese."),
            county: s.nonEmptyString("The county or district name in Chinese."),
            mobile: s.nonEmptyString("The mobile number."),
            company: s.string("The company name."),
            province_code: s.string("The province code."),
            city_code: s.string("The city code."),
            county_code: s.string("The county code."),
          },
          { optional: ["company", "province_code", "city_code", "county_code"] },
        ),
        cargo_type: s.stringEnum("The cargo type: 1 普货, 2 带电, 3 带磁, 4 带磁带电.", ["1", "2", "3", "4"]),
        cargo_name: s.string("The cargo name."),
        total_declared_value: s.number("The total declared value."),
        declared_value_code: s.stringEnum("The declared value currency.", ["CNY", "USD", "HKD", "EUR"]),
        product_type: s.stringEnum(
          "The product type: A100 FBA跨境特快, A101 FBA跨境标快, S100 FBA跨境快船, S101 FBA跨境普船, S103 跨境整柜, L100 跨境卡航, L101 跨境中欧班列, T100 海运标快, S108 跨境超大件-快船, S109 跨境超大件-普船.",
          ["A100", "A101", "S100", "S101", "S103", "L100", "L101", "T100", "S108", "S109"],
        ),
        customs_type: s.stringEnum(
          "The customs declaration mode: agent_declear 非报关件, customer_declear 出口正式报关.",
          ["agent_declear", "customer_declear"],
        ),
        declared_value: s.nonEmptyString("The insurance amount in CNY (投保金额)."),
        pickup_mode: s.integer("The domestic pickup mode: 1 客户自送, 2 上门接货, 3 其他方式上门接货.", {
          maximum: 3,
          minimum: 1,
        }),
        packages: s.array(
          "The packages with box dimensions.",
          s.object(
            "One package.",
            {
              box_no: s.nonEmptyString("The box number (the FBA number or a numeric sequence)."),
              package_high: s.number("The package height in cm."),
              package_long: s.number("The package length in cm."),
              package_weight: s.number("The package gross weight in kg."),
              net_weight: s.number("The package net weight in kg."),
              package_width: s.number("The package width in cm."),
              sku: s.string("The SKU."),
              english_name: s.string("The English product name."),
              chinese_name: s.string("The Chinese product name."),
              brand: s.string("The brand."),
              model: s.string("The model."),
              chinese_material: s.string("The material in Chinese."),
              english_material: s.string("The material in English."),
              purpose: s.string("The purpose."),
              packing: s.string("The packaging."),
              customs_code: s.string("The customs code."),
              number_of_boxes: s.string("The item count per box."),
              declared_value: s.string("The declared value of this package's product."),
              declared_total_value: s.string("The declared total value."),
              sales_link: s.string("The sales link."),
              pic: s.string("A picture URL."),
            },
            {
              optional: [
                "sku",
                "english_name",
                "chinese_name",
                "brand",
                "model",
                "chinese_material",
                "english_material",
                "purpose",
                "packing",
                "customs_code",
                "number_of_boxes",
                "declared_value",
                "declared_total_value",
                "sales_link",
                "pic",
              ],
            },
          ),
          { minItems: 1 },
        ),
        bill_fba_list: s.array(
          "The FBA info list.",
          s.object("One FBA entry.", {
            fba_no: s.string("The FBA number."),
            tracking_no: s.string("The shipment tracking number."),
          }),
        ),
        vat_register_no: s.string("The VAT registration number."),
        vat_register_company: s.string("The VAT-registered company name."),
        vat_register_company_addr: s.string("The VAT-registered company address."),
        eori: s.string("The EORI number."),
        tax_contain_type: s.stringEnum("The clearance mode: 1 关税预付, 2 关税不预付, 3 PVA递延.", ["1", "2", "3"]),
        collection_time: dateTimeSchema("The appointed pickup time for pickup_mode 3, in YYYY-MM-DD HH:mm:ss format."),
        collection_remark: s.string("The pickup remark for pickup_mode 3."),
        domestic_courier_number: s.string("The self-delivery tracking number for pickup_mode 1."),
        domestic_courier_code: s.string("The self-delivery carrier code for pickup_mode 1."),
        remark: s.string("A remark."),
        exclusive_emp_no: s.string("The designated pickup courier employee code."),
        terminal_carrier_code: s.stringEnum("The last-mile carrier: 快递 or 卡车, or the carrier that runs it.", [
          "UPS",
          "FEDEX",
          "DHL",
          "express",
          "Trucking",
          "NULL",
        ]),
        depart_code: s.stringEnum("The departure point: 86 大陆飞, 852 香港飞; required for product types A100/A101.", [
          "86",
          "852",
        ]),
        shipping_code: s.string(
          "The trunk transport code; required for product types S100/S101/S108/S109. One of carrier_mason 美森正班快船, carrier_mason_ad_hoc 美森统配快船, carrier_mason_timing 美森定时达, carrier_zim 以星快船, carrier_evergreen 长荣快船, carrier_general 海运普船, carrier_fixed_pick_up 普船定提, carrier_general_express 普船快线, air_line 空运专线, air_express_line 空运快线, air_distribution_line 空运统配.",
        ),
        user_app_key: s.string("The order source system code."),
        send_time: dateTimeSchema("The requested delivery time in YYYY-MM-DD HH:mm:ss format."),
      },
      {
        optional: [
          "monthly_card",
          "warehouse_code",
          "cargo_name",
          "bill_fba_list",
          "vat_register_no",
          "vat_register_company",
          "vat_register_company_addr",
          "eori",
          "tax_contain_type",
          "collection_time",
          "collection_remark",
          "domestic_courier_number",
          "domestic_courier_code",
          "remark",
          "exclusive_emp_no",
          "terminal_carrier_code",
          "depart_code",
          "shipping_code",
          "user_app_key",
          "send_time",
        ],
      },
    ),
    outputSchema: s.object(
      "The placed order.",
      {
        waybillNo: s.string("The master waybill number."),
        subWaybillNos: s.array("The sub waybill numbers.", s.string("A sub waybill number.")),
        warningMsg: s.nullableString("The warning message, when any."),
        compensationMsg: s.string("The compensation standard note."),
      },
      { optional: ["subWaybillNos", "warningMsg", "compensationMsg"] },
    ),
    followUpActions: ["sf_express.freight_crossborder_get_print_batch"],
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_query_postcode_address",
    description:
      "Check whether a destination postal code is served for SF cross-border bulky shipments, returning the address info and remote-area flag.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The postal code to check.", {
      city_zip_code: s.nonEmptyString("The postal code, for example 01007."),
      country_code: s.nonEmptyString("The country code (English), for example US."),
    }),
    outputSchema: s.object("The postal code matches.", {
      addresses: s.array(
        "The matching address entries.",
        s.object(
          "One matched address.",
          {
            cityZipCode: s.string("The postal code."),
            countryCode: s.string("The country code."),
            disable: s.boolean("Whether the entry is disabled."),
            distEnName: s.string("The district name in English."),
            isIsolated: s.boolean("Whether the address is a remote area."),
            provinceName: s.string("The province or state name."),
          },
          { optional: ["cityZipCode", "countryCode", "disable", "distEnName", "isIsolated", "provinceName"] },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_get_print_batch",
    description: "Start an SF cross-border bulky waybill print download and get the print batch number.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill to print.", {
      waybill_no: waybillNoSchema,
    }),
    outputSchema: s.object("The print batch.", {
      printBatchNo: s.string("The print batch number, used with freight_crossborder_query_print_result."),
    }),
    followUpActions: ["sf_express.freight_crossborder_query_print_result"],
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_query_print_result",
    description:
      "Get the waybill print file download URLs for a print batch created by freight_crossborder_get_print_batch.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The print batch.", {
      print_batch_no: s.nonEmptyString("The print batch number."),
    }),
    outputSchema: s.object(
      "The print files.",
      {
        files: s.array(
          "The printable files.",
          s.object("One print file.", {
            seqNo: s.integer("The file sequence number."),
            token: s.nullableString("The download token."),
            url: s.nullableString("The file download URL."),
            waybillNo: s.nullableString("The waybill number the file belongs to."),
          }),
        ),
        status: s.string("The batch status."),
        errorReason: s.nullableString("The failure reason, when any."),
      },
      { optional: ["status", "errorReason"] },
    ),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_confirm_delivery_window",
    description: "Confirm and update a new delivery window option for an FBA shipment as the carrier agent.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The delivery window confirmation.", {
      fba_shipment_id: fbaShipmentIdSchema,
      delivery_window_option_id: s.nonEmptyString(
        "The delivery window option id, from freight_crossborder_query_delivery_window_options.",
      ),
      reference_id: s.nonEmptyString("The reference id usable to confirm the delivery window."),
    }),
    outputSchema: s.object("The confirmation result.", {
      sellerAllowCarrierUpdateDw: s.boolean("Whether the seller allows the carrier to update the delivery window."),
      successful: s.boolean("Whether Amazon accepted the update; this is the authoritative verdict."),
      errorCode: s.nullableString("The failure code, when any."),
      errorMessage: s.nullableString("The failure message, when any."),
    }),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_query_delivery_window_options",
    description: "Query the selectable delivery window options for an FBA shipment as the carrier agent.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The FBA shipment.", {
      fba_shipment_id: fbaShipmentIdSchema,
    }),
    outputSchema: s.object(
      "The delivery window options.",
      {
        deliveryWindowOptions: s.array(
          "The selectable delivery windows.",
          s.object(
            "One delivery window option.",
            {
              startDate: s.string("The window start time (UTC)."),
              endDate: s.string("The window end time (UTC)."),
              deliveryWindowOptionId: s.string("The option id, used to confirm the window."),
              availabilityStatus: s.string("The warehouse congestion status, for example AVAILABLE or BLOCKED."),
              availabilityStatusValidUntilTime: s.string("The congestion data validity time (UTC)."),
              gracePeriodEndDate: s.string("The deadline for changing to this window (UTC)."),
            },
            {
              optional: [
                "startDate",
                "endDate",
                "deliveryWindowOptionId",
                "availabilityStatus",
                "availabilityStatusValidUntilTime",
                "gracePeriodEndDate",
              ],
            },
          ),
        ),
        referenceId: s.string("The reference id usable to confirm a delivery window."),
        fbaNo: s.string("The FBA number."),
        sellerAllowCarrierUpdateDw: s.integer("Whether the seller allows updates: 0 = no, 1 = yes."),
      },
      { optional: ["referenceId", "fbaNo", "sellerAllowCarrierUpdateDw"] },
    ),
    followUpActions: ["sf_express.freight_crossborder_confirm_delivery_window"],
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_get_delivery_window",
    description: "Query the current delivery window of an FBA shipment as the carrier agent.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The FBA shipment.", {
      fba_shipment_id: fbaShipmentIdSchema,
    }),
    outputSchema: s.object(
      "The current delivery window.",
      {
        startDate: s.string("The window start date."),
        endDate: s.string("The window end date."),
        fbaNo: s.string("The FBA number."),
        sellerAllowCarrierUpdateDw: s.integer("Whether the seller allows updates: 0 = no, 1 = yes."),
        gracePeriodEndDate: s.string("The deadline for changing the window."),
      },
      { optional: ["startDate", "endDate", "fbaNo", "sellerAllowCarrierUpdateDw", "gracePeriodEndDate"] },
    ),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_get_pod_info",
    description: "Query the proof-of-delivery information for an SF cross-border bulky waybill.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill to query.", {
      waybill_no: waybillNoSchema,
    }),
    outputSchema: s.object(
      "The POD information.",
      {
        waybillNo: s.string("The waybill number."),
        signed: s.boolean("Whether the waybill is signed."),
        hasPod: s.boolean("Whether POD files exist."),
        statusCode: s.integer("The waybill status code, for example 240."),
        statusDescription: s.string("The status description, for example 已签收."),
        podUrls: s.array("The POD file download URLs.", s.string("A POD file URL.")),
        message: s.string("The result message."),
      },
      { optional: ["waybillNo", "statusCode", "statusDescription", "message"] },
    ),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_upload_pod_files",
    description:
      "Upload proof-of-delivery files for an SF cross-border bulky waybill, as publicly accessible file URLs.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The POD files to upload.", {
      waybill_no: waybillNoSchema,
      file_paths: s.stringArray("The publicly accessible file URLs.", { minItems: 1 }),
    }),
    outputSchema: uploadAckOutputSchema("The waybill number, echoed back."),
  }),
  defineProviderAction(service, {
    name: "freight_crossborder_cancel_order",
    description: "Cancel one or more SF cross-border bulky orders by waybill number.",
    requiredScopes: [],
    inputSchema: s.object(
      "The orders to cancel.",
      {
        waybill_nos: s.stringArray("The waybill numbers.", { minItems: 1 }),
        user_name: s.nonEmptyString("The operator who cancels, for example a mobile number."),
        remark: s.string("The cancellation reason."),
      },
      { optional: ["remark"] },
    ),
    outputSchema: s.object("The cancellation results.", {
      results: s.array(
        "One result per waybill number.",
        s.object(
          "One cancellation result.",
          {
            waybillNo: s.string("The waybill number."),
            status: s.string("The cancellation status, for example Success."),
            subWaybillNo: s.string("The related sub waybill number, when any."),
            msg: s.string("The result message."),
          },
          { optional: ["waybillNo", "status", "subWaybillNo", "msg"] },
        ),
      ),
    }),
  }),
];
