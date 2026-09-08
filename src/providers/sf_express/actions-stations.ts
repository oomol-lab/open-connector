import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dateTimeSchema } from "./schemas.ts";

const service = "sf_express";

const stationDatePattern = "^\\d{4}-\\d{2}-\\d{2}$";

/** KB-family endpoints carry a snake_case msgData with a fixed `api` discriminator and the KB partner id inside. */
const kbPartnerFields = {
  partner_id: s.nonEmptyString("The KB partner id (合作伙伴ID) issued for the station channel, e.g. KBWL8S6H."),
  waybill_no: s.nonEmptyString("The SF waybill number."),
  store_code: s.nonEmptyString("The station's own store code (合作网点自有编码)."),
  agent_code: s.nonEmptyString("The agent/store code (合作网点自有编码)."),
  area_code: s.nonEmptyString("The SF area code (地区编码), e.g. 755A."),
  city_id: s.nonEmptyString("The city code (城市编码), e.g. 755."),
};

const msgOutputSchema = s.object("The operation result.", {
  msg: s.string("The message returned by SF Express."),
});

const stationAckOutputSchema = (echoDescription: string, field: "waybillNo" | "storeCode" = "waybillNo") =>
  s.object("The operation acknowledgement.", {
    [field]: s.string(echoDescription),
  });

/** The shared input of the KB handover trio (pre-check-in / check-in / check-out). */
const kbPackInputSchema = (description: string): ReturnType<typeof s.object> =>
  s.object(
    description,
    {
      store_code: kbPartnerFields.store_code,
      partner_id: kbPartnerFields.partner_id,
      waybill_no: kbPartnerFields.waybill_no,
      extend_json: s.record("Extra business attributes sent as a JSON string.", true),
    },
    { optional: ["extend_json"] },
  );

/** EOS-family endpoints wrap the business payload in { header, content }. */
const headerFields = {
  operatorId: s.nonEmptyString("The operator employee number (操作人工号)."),
  deptCode: s.nonEmptyString("The city/department code (城市编码), e.g. 755."),
  netCode: s.nonEmptyString("The district code (区代码), sent as sgs_netcode."),
  accessCode: s.nonEmptyString("The system access code (系统接入编码) allocated by SF Express."),
};

const headerInputSchema = s.object("The request header block required by this endpoint.", headerFields, {
  optional: ["deptCode", "netCode"],
});

/** COM_RECE_EOS_ADD_STORE_INFO is the one EOS endpoint whose header table marks every field 否. */
const optionalHeaderInputSchema = s.object("The request header block; every field is optional here.", headerFields, {
  optional: ["operatorId", "deptCode", "netCode", "accessCode"],
});

const storeAddressFields = {
  provincename: s.nonEmptyString("The province name, e.g. 广东省."),
  cityname: s.nonEmptyString("The city name, e.g. 深圳市."),
  countyname: s.nonEmptyString("The district or county name, e.g. 南山区."),
  townname: s.nonEmptyString("The town or subdistrict name."),
  address: s.nonEmptyString("The detailed street address."),
};

const storeInfoOutputSchema = s.object(
  "The saved store identifiers.",
  {
    storeCode: s.string("The station's own store code."),
    virtualAddr: s.string("The SF-assigned station id (便利店编码/驿站ID)."),
    aoiAreaCode: s.string("The AOI area code."),
    aoiCode: s.string("The AOI code."),
    cnCode: s.string("The business division code (经营本部代码)."),
    areaCode: s.string("The area code."),
    deptCode: s.string("The department code (网点代码)."),
  },
  { optional: ["storeCode", "virtualAddr", "aoiAreaCode", "aoiCode", "cnCode", "areaCode", "deptCode"] },
);

const receiptFeeSchema = s.object(
  "One fee entry for the receipt.",
  {
    waybillNo: s.nonEmptyString("The waybill number."),
    feeTypeCode: s.nonEmptyString("The fee type code."),
    feeAmt: s.nonEmptyString("The fee amount."),
    gatherZoneCode: s.nonEmptyString("The collecting department code."),
    paymentTypeCode: s.nonEmptyString("The payment type: 1 sender pays, 2 receiver pays, 3 third party."),
    paymentChangeTypeCode: s.nonEmptyString("The payment change type: 0 none, 1 sender-to-third, 2 receiver-to-third."),
    customerAcctCode: s.string("The payment account; required for monthly settlement, empty for cash."),
    ticketNo: s.nonEmptyString("The coupon number."),
    valutionAcctCode: s.nonEmptyString("The valuation card number."),
    ticketOffsetAmt: s.nonEmptyString("The coupon offset amount."),
    ticketType: s.nonEmptyString("The coupon type: 1 weight, 2 cash, 3 discount rate."),
    ticketKind: s.nonEmptyString(
      "The coupon kind: 1 paper, 2 regular electronic, 3 self-send/pickup, 4 three-in-one electronic, 5 other.",
    ),
    ticketPurpose: s.nonEmptyString("The coupon purpose: 1 customer maintenance, 2 public relations, 3 staff welfare."),
    isOnlineDeduct: s.nonEmptyString("Online deduction flag: 0 cash (default), 1 online paid, 2 online unpaid."),
    currencyCode: s.nonEmptyString("The currency code; required when feeAmt is set."),
  },
  {
    optional: [
      "gatherZoneCode",
      "paymentChangeTypeCode",
      "ticketNo",
      "valutionAcctCode",
      "ticketOffsetAmt",
      "ticketType",
      "ticketKind",
      "ticketPurpose",
      "isOnlineDeduct",
    ],
  },
);

const receiptServiceSchema = s.object(
  "One value-added service entry for the receipt.",
  {
    waybillNo: s.nonEmptyString("The waybill number."),
    serviceProdCode: s.nonEmptyString("The value-added service code."),
    attribute1: s.nonEmptyString("Service attribute 1."),
    attribute2: s.nonEmptyString("Service attribute 2."),
    attribute3: s.nonEmptyString("Service attribute 3."),
    attribute4: s.nonEmptyString("Service attribute 4."),
    attribute5: s.nonEmptyString("Service attribute 5."),
  },
  { optional: ["attribute1", "attribute2", "attribute3", "attribute4", "attribute5"] },
);

const receiptMarkSchema = s.requiredObject("One mark entry for the receipt.", {
  waybillNo: s.nonEmptyString("The waybill number."),
  labellingPattern: s.nonEmptyString(
    "The mark type, e.g. ONESELF_PICKUP_FLG (self-pickup) or CUSTOMER_ACCT_NEED_CONFIRM.",
  ),
});

const receiptAdditionSchema = s.requiredObject("One additional attribute entry for the receipt.", {
  waybillNo: s.nonEmptyString("The waybill number."),
  additionKey: s.nonEmptyString("The attribute key."),
  additionValues: s.nonEmptyString("The attribute value."),
});

export const sfExpressStationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "station_batch_inventory",
    description: "Batch-upload the 600 route (滞留件盘点) for waybills held at a partner station.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The station inventory batch.", {
      store_code: kbPartnerFields.store_code,
      partner_id: kbPartnerFields.partner_id,
      waybill_nos: s.stringArray("The waybill numbers to check in for inventory; at most 20 per call.", {
        minItems: 1,
        maxItems: 20,
      }),
    }),
    outputSchema: s.object("The inventory result.", {
      msg: s.string("The message returned by SF Express."),
      failList: s.array(
        "The waybills that failed, when at least one succeeded.",
        s.object(
          "One failed waybill.",
          {
            waybill_no: s.string("The waybill number."),
            reason: s.string("The failure reason."),
          },
          { optional: ["reason"] },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "station_handle_exception_return",
    description: "Report an exception return for a waybill at an external station (驿站异常件退件处理).",
    requiredScopes: [],
    inputSchema: s.object(
      "The exception return to report.",
      {
        store_code: kbPartnerFields.store_code,
        partner_id: kbPartnerFields.partner_id,
        waybill_no: kbPartnerFields.waybill_no,
        type: s.stringEnum("The direction: 1 = inbound (收件), 2 = outbound (派件).", ["1", "2"]),
        exception_time: dateTimeSchema("The exception time in yyyy-MM-dd HH:mm:ss format."),
        exception_reason: s.nonEmptyString("The exception reason, e.g. 包裹破损，客户拒收."),
      },
      { optional: ["exception_reason"] },
    ),
    outputSchema: stationAckOutputSchema("The reported waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_verify_waybill_number",
    description: "Check whether a waybill number is an SF Express waybill number, for the station channel.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill number to verify.", {
      partner_id: kbPartnerFields.partner_id,
      waybill_no: kbPartnerFields.waybill_no,
    }),
    outputSchema: msgOutputSchema,
  }),
  defineProviderAction(service, {
    name: "station_query_waybill_route",
    description: "Query the route events of a waybill for the station channel.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The waybill whose route should be queried.", {
      partner_id: kbPartnerFields.partner_id,
      waybill_no: kbPartnerFields.waybill_no,
    }),
    outputSchema: s.object("The waybill route.", {
      waybill_no: s.string("The waybill number."),
      route: s.array(
        "The route events.",
        s.object(
          "One route event.",
          {
            date: s.string("The scan date."),
            time: s.string("The scan time."),
            state: s.string("The event description."),
            position: s.string("The city where the event happened."),
            oprCode: s.string("The operator employee number."),
            opCode: s.string("The operation code."),
          },
          { optional: ["date", "time", "state", "position", "oprCode", "opCode"] },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "station_notify_recipient",
    description: "Send a pickup notification SMS to the recipient of a waybill held at a station.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The notification to send.", {
      partner_id: kbPartnerFields.partner_id,
      waybill_no: kbPartnerFields.waybill_no,
      agent_code: kbPartnerFields.agent_code,
    }),
    outputSchema: msgOutputSchema,
  }),
  defineProviderAction(service, {
    name: "station_send_waybill_sms",
    description: "Send a fixed-template notification SMS for a waybill to its recipient or sender.",
    requiredScopes: [],
    inputSchema: s.object(
      "The SMS to send.",
      {
        partner_id: kbPartnerFields.partner_id,
        waybill_no: kbPartnerFields.waybill_no,
        agent_code: kbPartnerFields.agent_code,
        send_to: s.nonEmptyString("The SMS recipient side, e.g. 1 (see the official example)."),
        mobile_phone: s.nonEmptyString("The mobile number to text."),
        extend_json: s.record(
          "Extra template variables merged into the SMS, e.g. storeAddress/storePhone/pickupCode.",
          true,
        ),
      },
      { optional: ["extend_json"] },
    ),
    outputSchema: msgOutputSchema,
  }),
  defineProviderAction(service, {
    name: "station_store_batch_inventory",
    description: "Batch-upload the 600 route (滞留件盘点) for waybills held at a convenience store.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The store inventory batch.", {
      agent_code: kbPartnerFields.agent_code,
      partner_id: kbPartnerFields.partner_id,
      area_code: kbPartnerFields.area_code,
      waybill_nos: s.stringArray("The waybill numbers to check in for inventory; at most 20 per call.", {
        minItems: 1,
        maxItems: 20,
      }),
    }),
    outputSchema: s.object("The inventory result.", {
      msg: s.string("The message returned by SF Express."),
      failList: s.array(
        "The waybills that failed, when at least one succeeded.",
        s.object(
          "One failed waybill.",
          {
            waybill_no: s.string("The waybill number."),
            reason: s.string("The failure reason."),
          },
          { optional: ["reason"] },
        ),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "station_query_centralization",
    description: "Query whether a waybill is a centralized (集收/集派) shipment through the station general query API.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The centralization query.", {
      partner_id: kbPartnerFields.partner_id,
      waybill_no: kbPartnerFields.waybill_no,
      type: s.integer("The query type: 1 = 集收件查询, 2 = 集派件查询.", { minimum: 1, maximum: 2 }),
    }),
    outputSchema: s.object("The centralization result.", {
      isCentralism: s.boolean("Whether the shipment is a centralized one."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_update_outsource_info",
    description:
      "Submit or update the regional outsourcing information (区域外包信息变更) for outsourced station areas.",
    requiredScopes: [],
    inputSchema: s.object(
      "The outsourcing record to submit.",
      {
        partner_id: kbPartnerFields.partner_id,
        dept_code: s.nonEmptyString("The department code (网点代码)."),
        out_aoi_area_code: s.nonEmptyString("The outsourced AOI area codes, separated by ';'."),
        bidding_create_tm: s.string("The tender creation date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
        bidding_win_tm: s.string("The tender win date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
        employer_emp_no: s.nonEmptyString("The employer employee number (雇主工号)."),
        employer_emp_name: s.nonEmptyString("The employer name (雇主姓名)."),
        employer_phone: s.nonEmptyString("The employer phone."),
        supplier_code: s.nonEmptyString("The outsourcing supplier code (外包供应商编码)."),
        service_state: s.stringEnum("The service state: 1 in service, 2 out of service.", ["1", "2"]),
        service_sign_state: s.integer("The contract signing state: 1 signed, 2 signing, 3 cancelled.", {
          minimum: 1,
          maximum: 3,
        }),
        service_sign_tm: s.string("The first contract effective date in yyyy-MM-dd format.", {
          pattern: stationDatePattern,
        }),
        contract_begin_date: s.string("The contract start date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
        contract_end_date: s.string("The contract end date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
        employee_no_detail: s.nonEmptyString("The employee numbers, separated by ';'."),
        this_month_leave_employee: s.string("Employees who left this month, separated by ';' (may be empty)."),
        last_month_leave_employee: s.string("Employees who left last month, separated by ';' (may be empty)."),
        single_pickup_award: s.number("The per-piece pickup outsourcing incentive."),
        single_deliver_award: s.number("The per-piece delivery outsourcing incentive."),
        contract_renew: s.integer("Whether the contract is renewed: 0 new, 1 renewed.", { minimum: 0, maximum: 1 }),
        cancer_serve_reason: s.nonEmptyString("The exit reason; required when service_sign_state is 3 (cancelled)."),
        mark_code: s.nonEmptyString("The tender mark code (标的编码)."),
        os_mode: s.integer("The outsourcing mode: 1 self-rented, 2 co-delivery, 3 exclusive, 4 regional outsourcing.", {
          minimum: 1,
          maximum: 4,
        }),
        exit_type: s.integer("The exit type: 1 voluntary, 2 passive; required when service_sign_state is 3.", {
          minimum: 1,
          maximum: 2,
        }),
        exit_reason_type: s.nonEmptyString(
          "The exit reason category, under 200 characters; required when service_sign_state is 3.",
          { maxLength: 200 },
        ),
        exit_date: s.string("The exit date in yyyy-MM-dd format; required when service_sign_state is 3.", {
          pattern: stationDatePattern,
        }),
        exit_employee_destination: s.nonEmptyString(
          "Where exiting employees went, under 200 characters; required when service_sign_state is 3.",
          { maxLength: 200 },
        ),
        pre_exit_status: s.integer("The pre-exit state: 1 pre-exit, 2 cancel pre-exit.", { minimum: 1, maximum: 2 }),
        pre_exit_time: dateTimeSchema("The pre-exit time in yyyy-MM-dd HH:mm:ss format."),
      },
      {
        optional: [
          "bidding_create_tm",
          "bidding_win_tm",
          "employer_phone",
          "single_pickup_award",
          "single_deliver_award",
          "cancer_serve_reason",
          "exit_type",
          "exit_reason_type",
          "exit_date",
          "exit_employee_destination",
          "pre_exit_status",
          "pre_exit_time",
        ],
      },
    ),
    outputSchema: s.object("The submission acknowledgement.", {
      deptCode: s.string("The submitted department code."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_upsert_robot_channel",
    description:
      "Create or update a robot/smart-cabinet channel station (渠道新增/修改). Omit virtual_addr when creating; pass it when updating.",
    requiredScopes: [],
    inputSchema: s.object(
      "The robot or smart-cabinet station to upsert.",
      {
        partner_id: s.nonEmptyString("The partner id (合作伙伴ID) for the channel, e.g. YJ12345."),
        virtual_addr: s.nonEmptyString("The SF-assigned station id; required when updating, omit when creating."),
        name: s.nonEmptyString("The robot or cabinet name."),
        manufactor: s.nonEmptyString("The manufacturer."),
        store_code: s.nonEmptyString("The hardware id (机器人编码), at most 32 characters."),
        status: s.integer("The status: 0 in use, 1 not in use.", { minimum: 0, maximum: 1 }),
        service_begin_date: s.string("The operation start date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
        device_forbidden_date: s.string("The device disable date in yyyy-MM-dd format.", {
          pattern: stationDatePattern,
        }),
        linkman: s.nonEmptyString("The contact person."),
        phone: s.nonEmptyString("The contact phone."),
        max_grid_count: s.integer("The maximum locker grid count."),
        service_content_type: s.integer("The service type: 1 drop-off, 2 pickup, 3 both.", { minimum: 1, maximum: 3 }),
        ...storeAddressFields,
        store_type: s.integer("The device type: 30 robot, 31 smart cabinet.", { minimum: 30, maximum: 31 }),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["virtual_addr", "max_grid_count", "extend_json"] },
    ),
    outputSchema: s.object("The upsert result.", {
      virtualAddr: s.string("The SF-assigned station id."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_upsert_cage_cabinet",
    description: "Create or update a cage cabinet (笼车柜); the sn field is the upsert key.",
    requiredScopes: [],
    inputSchema: s.object(
      "The cage cabinet to upsert.",
      {
        partner_id: s.nonEmptyString("The partner id (合作伙伴ID), e.g. FCKJU7H5."),
        sn: s.nonEmptyString("The cabinet terminal SN; the record is updated when it already exists."),
        cabinet_code: s.nonEmptyString("The cabinet code (柜机编码)."),
        lng: s.nonEmptyString("The longitude."),
        lat: s.nonEmptyString("The latitude."),
        grid_num: s.integer("The grid cell count.", { minimum: 1 }),
        ...storeAddressFields,
        status: s.integer("The cabinet status: 1 in use, 2 under maintenance, 3 retired.", { minimum: 1, maximum: 3 }),
        community_name: s.nonEmptyString("The community name."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["community_name", "extend_json"] },
    ),
    outputSchema: s.object("The upsert acknowledgement.", {
      sn: s.string("The upserted cabinet terminal SN."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_store_handle_exception_return",
    description: "Report an exception return for a waybill at a store (门店异常件退件处理).",
    requiredScopes: [],
    inputSchema: s.object(
      "The exception return to report.",
      {
        header: headerInputSchema,
        agent_code: kbPartnerFields.agent_code,
        partner_id: kbPartnerFields.partner_id,
        area_code: kbPartnerFields.area_code,
        city_id: kbPartnerFields.city_id,
        waybill_no: kbPartnerFields.waybill_no,
        type: s.stringEnum("The direction: 1 = inbound (收件), 2 = outbound (派件).", ["1", "2"]),
        exception_time: dateTimeSchema("The exception time in yyyy-MM-dd HH:mm:ss format."),
        exception_reason: s.nonEmptyString("The exception reason."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["city_id", "exception_reason", "extend_json"] },
    ),
    outputSchema: stationAckOutputSchema("The reported waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_check_delivery_operation",
    description: "Check whether an operator on a channel may handle a waybill at a store (渠道可派件交接管控).",
    requiredScopes: [],
    inputSchema: s.object(
      "The delivery operation to check.",
      {
        sgs_net_code: s.nonEmptyString("The district code sent in the request header (sgs_netcode)."),
        access_code: s.nonEmptyString(
          "The system access code (系统接入编码) sent in the request header, allocated by SF Express.",
        ),
        store_code: s.nonEmptyString("The convenience store code (便利店编码)."),
        dept_code: s.nonEmptyString("The city code (城市编码)."),
        opr_time: dateTimeSchema("The operation time in yyyy-MM-dd HH:mm:ss format."),
        opr_id: s.nonEmptyString("The operator employee number (操作用户工号)."),
        channel: s.nonEmptyString("The channel code, e.g. rider."),
        system_code: s.nonEmptyString("The system code."),
        waybill_no: kbPartnerFields.waybill_no,
        ehead: s.nonEmptyString("The request header info JSON string (accuracy/lat/lng/time/type)."),
        store_type: s.nonEmptyString(
          "The store type: 1 SF store, 2 individual store, 3 sub-department, 4 chain, 5 SF station, 6 customer touchpoint, 7 嘿客店, 8 business station, 9 汪勇项目.",
        ),
      },
      { optional: ["sgs_net_code", "access_code", "ehead", "store_type"] },
    ),
    outputSchema: s.object("The operation control verdict.", {
      operationControl: s.string("1 = controlled (管控), 0 = not controlled."),
      reasonCode: s.string("The control reason code."),
      reason: s.string("The control reason description."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_customer_send_in_store",
    description:
      "Register a customer drop-off at a store (顾客到店寄件). When receiver_payment is 0 (寄付), weight, pack_fee, insurance_money and insurance_fee are required.",
    requiredScopes: [],
    inputSchema: s.object(
      "The drop-off to register.",
      {
        header: headerInputSchema,
        agent_code: kbPartnerFields.agent_code,
        partner_id: kbPartnerFields.partner_id,
        area_code: kbPartnerFields.area_code,
        city_id: kbPartnerFields.city_id,
        waybill_no: kbPartnerFields.waybill_no,
        receiver_payment: s.stringEnum("The freight payment side: 0 = sender pays (寄付), 1 = receiver pays (到付).", [
          "0",
          "1",
        ]),
        receive_waybill_time: dateTimeSchema("The store receive time in yyyy-MM-dd HH:mm:ss format."),
        weight: s.nonEmptyString("The shipment weight in KG; required when receiver_payment is 0."),
        pack_fee: s.nonEmptyString("The freight charge in RMB; required when receiver_payment is 0."),
        insurance_money: s.nonEmptyString("The insured value in RMB, 0.00 when uninsured; required when 寄付."),
        insurance_fee: s.nonEmptyString("The insurance fee in RMB, 0.00 when uninsured; required when 寄付."),
        ext1: s.nonEmptyString("The real-name extension flag: 1 verified, 0 not verified."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["weight", "pack_fee", "insurance_money", "insurance_fee", "ext1", "extend_json"] },
    ),
    outputSchema: stationAckOutputSchema("The registered waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_courier_pickup_in_store",
    description: "Register that an SF courier picked up the consigned parcels from a store (顺丰小哥到店收件).",
    requiredScopes: [],
    inputSchema: s.object(
      "The pickup to register.",
      {
        header: headerInputSchema,
        agent_code: kbPartnerFields.agent_code,
        partner_id: kbPartnerFields.partner_id,
        area_code: kbPartnerFields.area_code,
        city_id: kbPartnerFields.city_id,
        waybill_no: kbPartnerFields.waybill_no,
        receiver_payment: s.stringEnum("The freight payment side: 0 = sender pays, 1 = receiver pays.", ["0", "1"]),
        sf_takeaway_time: dateTimeSchema("The time SF took the parcels from the store in yyyy-MM-dd HH:mm:ss format."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["city_id", "extend_json"] },
    ),
    outputSchema: stationAckOutputSchema("The picked-up waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_store_receive_delivery",
    description: "Register that a store received parcels handed over by an SF courier (门店接收小哥派件).",
    requiredScopes: [],
    inputSchema: s.object(
      "The handover to register.",
      {
        header: headerInputSchema,
        agent_code: kbPartnerFields.agent_code,
        partner_id: kbPartnerFields.partner_id,
        area_code: kbPartnerFields.area_code,
        city_id: kbPartnerFields.city_id,
        waybill_no: kbPartnerFields.waybill_no,
        receiver_payment: s.stringEnum("The freight payment side: 0 = sender pays, 1 = receiver pays.", ["0", "1"]),
        sf_handover_time: dateTimeSchema("The time the store received the parcels in yyyy-MM-dd HH:mm:ss format."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["city_id", "extend_json"] },
    ),
    outputSchema: stationAckOutputSchema("The received waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_customer_pickup_in_store",
    description:
      "Register that a customer picked up their parcel at a store (顾客到店取件). When receiver_payment is 1 (到付), weight, pack_fee, insurance_money, insurance_fee and successfully_payed_fee are required.",
    requiredScopes: [],
    inputSchema: s.object(
      "The pickup to register.",
      {
        header: headerInputSchema,
        agent_code: kbPartnerFields.agent_code,
        partner_id: kbPartnerFields.partner_id,
        area_code: kbPartnerFields.area_code,
        city_id: kbPartnerFields.city_id,
        waybill_no: kbPartnerFields.waybill_no,
        receiver_payment: s.stringEnum("The freight payment side: 0 = sender pays, 1 = receiver pays.", ["0", "1"]),
        deliver_waybill_time: dateTimeSchema(
          "The time the customer picked up the parcel in yyyy-MM-dd HH:mm:ss format.",
        ),
        weight: s.nonEmptyString("The shipment weight in KG; required when receiver_payment is 1."),
        pack_fee: s.nonEmptyString("The freight charge in RMB; required when receiver_payment is 1."),
        insurance_money: s.nonEmptyString("The insured value in RMB, 0.00 when uninsured; required when 到付."),
        insurance_fee: s.nonEmptyString("The insurance fee in RMB, 0.00 when uninsured; required when 到付."),
        successfully_payed_fee: s.nonEmptyString(
          "The paid amount in cents, or -1 when payment failed; required when receiver_payment is 1.",
        ),
        courier_code: s.nonEmptyString("The courier employee number forwarded to FVP."),
        virtual_store_flag: s.nonEmptyString("The 乐收直营 flag: 1直营, 0非直营."),
        skss_push80_flag: s.nonEmptyString("The SKSS flip-80 flag: 1 or 0 (乐收直营 stores only)."),
        extend_attach_31: s.nonEmptyString("The delivery proof method: 4 password sign, 5 id card."),
        extend_attach_32: s.nonEmptyString("The delivery proof content."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      {
        optional: [
          "city_id",
          "weight",
          "pack_fee",
          "insurance_money",
          "insurance_fee",
          "successfully_payed_fee",
          "courier_code",
          "virtual_store_flag",
          "skss_push80_flag",
          "extend_attach_31",
          "extend_attach_32",
          "extend_json",
        ],
      },
    ),
    outputSchema: stationAckOutputSchema("The picked-up waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_query_store_info",
    description:
      "Query a station's information. One of virtual_addr or store_code is required. The returned field names vary by api_version.",
    requiredScopes: [],
    inputSchema: s.object(
      "The station to query.",
      {
        header: headerInputSchema,
        system_id: s.nonEmptyString("The caller system id (外部调用方系统ID)."),
        api_version: s.nonEmptyString("The API version, e.g. 1.3; different versions return different fields."),
        virtual_addr: s.nonEmptyString("The SF station id (驿站ID)."),
        store_code: s.nonEmptyString("The station's own store code."),
        area_code: s.nonEmptyString("The area code."),
        scene_code: s.nonEmptyString("The scene code (场景编码)."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["virtual_addr", "store_code", "area_code", "scene_code", "extend_json"] },
    ),
    outputSchema: s.unknownObject(
      "The station record; the returned fields vary by api_version, e.g. name/storeName, phone, virtualAddr, storeType, address.",
    ),
  }),
  defineProviderAction(service, {
    name: "station_verify_fc_settlement",
    description:
      "Check whether a Hive Box (丰巢) cabinet drop-off fee settles monthly (丰巢订单结算校验, 订单类型 1 派件投柜). The rental and reservation order types carry different payloads and are not covered.",
    requiredScopes: [],
    inputSchema: s.object(
      "The settlement to verify.",
      {
        op_type: s.integer("The operation type: 1 投柜, 2 放弃投柜.", { minimum: 1, maximum: 2 }),
        order_id: s.nonEmptyString("The order number."),
        cabinet_code: s.nonEmptyString("The Hive Box cabinet code; required when op_type is 1."),
        emp_no: s.nonEmptyString("The courier employee number; required when op_type is 1."),
        phone: s.nonEmptyString("The contact phone; required when op_type is 1."),
        payment_type: s.integer("The payment type: 1 网点钱包（公司月结）; required when op_type is 1.", {
          minimum: 1,
        }),
        waybill_no: kbPartnerFields.waybill_no,
        grid_type: s.integer("The grid size: 1 大, 2 中, 3 小; required when op_type is 1.", {
          minimum: 1,
          maximum: 3,
        }),
        discount_type: s.nonEmptyString("The discount type, when any."),
        discount_fee: s.integer("The discount amount in cents (分), when any."),
        payed_fee: s.integer("The charged amount in cents (分); required when op_type is 1."),
        deliver_tm: dateTimeSchema("The drop-off time in yyyy-MM-dd HH:mm:ss format; required when op_type is 1."),
      },
      {
        optional: [
          "cabinet_code",
          "emp_no",
          "phone",
          "payment_type",
          "waybill_no",
          "grid_type",
          "discount_type",
          "discount_fee",
          "payed_fee",
          "deliver_tm",
        ],
      },
    ),
    outputSchema: s.object(
      "The settlement verdict.",
      {
        settleFlag: s.integer("The monthly-settlement flag: 0 not monthly-settled, 1 monthly-settled."),
        reason: s.string("The reason when settleFlag is 0."),
        failCode: s.string("The failure code when settleFlag is 0."),
        areaCode: s.string("The area code."),
        deptCode: s.string("The department code."),
        responseId: s.string("The unique response id."),
      },
      { optional: ["reason", "failCode"] },
    ),
  }),
  defineProviderAction(service, {
    name: "station_upsert_fc_outsource_store",
    description: "Create or update a Hive Box regional-outsource store (丰巢区域外包门店新增及更新).",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The store to upsert.",
        {
          header: headerInputSchema,
          store_code: s.nonEmptyString("The station's own store code (自有编码)."),
          virtual_addr: s.nonEmptyString("The SF station id; required when updating."),
          partner_id: s.nonEmptyString("The supplier id (供应商)."),
          site_status: s.integer("The store status: 1 pending, 2 operating, 3 retired, 4 suspended.", {
            minimum: 1,
            maximum: 4,
          }),
          site_name: s.nonEmptyString("The store name."),
          open_flag: s.integer("Whether the store is open to the public: 1 yes, 0 no.", { minimum: 0, maximum: 1 }),
          start_open_time: s.nonEmptyString("The operation start time."),
          linkman: s.nonEmptyString("The contact person."),
          phone: s.nonEmptyString("The contact phone."),
          emergency_phone: s.nonEmptyString("The emergency contact phone."),
          ...storeAddressFields,
          lng: s.number("The longitude."),
          lat: s.number("The latitude."),
          place_type: s.nonEmptyString(
            "The place type: 1 mixed commercial/residential, 2 government, 3 mall, 4 hospital, 5 school, 6 office building, 7 residential.",
          ),
          service_content_type: s.integer(
            "The service type: 1 drop-off, 2 pickup, 3 both. One of service_content_type or service_content_type_ex is required.",
            { minimum: 1, maximum: 3 },
          ),
          service_content_type_ex: s.integer(
            "The extended service type: 2 home delivery, 3 home pickup, 5 both. One of service_content_type or service_content_type_ex is required.",
          ),
          site_type: s.integer("The outsourcing type: 1 区域外包-驿收发, 2 区域外包-丰巢.", { minimum: 1, maximum: 2 }),
          contractor: s.nonEmptyString("The regional contractor."),
          contractor_phone: s.nonEmptyString("The contractor phone."),
          service_time: s.nonEmptyString("The service hours, e.g. 07:59--19:00."),
          extend_json: s.record("Extra business attributes sent as a JSON string.", true),
        },
        {
          optional: [
            "virtual_addr",
            "open_flag",
            "start_open_time",
            "emergency_phone",
            "townname",
            "place_type",
            "service_content_type",
            "service_content_type_ex",
            "extend_json",
          ],
        },
      ),
      ["service_content_type", "service_content_type_ex"],
    ),
    outputSchema: storeInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "station_upsert_ysf_outsource_store",
    description: "Create or update a 驿收发 regional-outsource store (驿收发区域外包门店新增及更新).",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The store to upsert.",
        {
          header: headerInputSchema,
          store_code: s.nonEmptyString("The station's own store code (自有编码)."),
          virtual_addr: s.nonEmptyString("The SF station id; required when updating."),
          partner_id: s.nonEmptyString("The supplier id (供应商)."),
          site_status: s.integer("The store status: 1 pending, 2 operating, 3 retired, 4 suspended.", {
            minimum: 1,
            maximum: 4,
          }),
          site_name: s.nonEmptyString("The store name."),
          open_flag: s.integer("Whether the store is open to the public: 1 yes, 0 no.", { minimum: 0, maximum: 1 }),
          start_open_time: s.nonEmptyString("The operation start time."),
          linkman: s.nonEmptyString("The contact person."),
          phone: s.nonEmptyString("The contact phone."),
          emergency_phone: s.nonEmptyString("The emergency contact phone."),
          ...storeAddressFields,
          lng: s.number("The longitude."),
          lat: s.number("The latitude."),
          place_type: s.nonEmptyString(
            "The place type: 1 mixed commercial/residential, 2 government, 3 mall, 4 hospital, 5 school, 6 office building, 7 residential.",
          ),
          service_content_type: s.integer(
            "The service type: 1 drop-off, 2 pickup, 3 both. One of service_content_type or service_content_type_ex is required.",
            { minimum: 1, maximum: 3 },
          ),
          service_content_type_ex: s.integer(
            "The extended service type: 2 home delivery, 3 home pickup, 5 both. One of service_content_type or service_content_type_ex is required.",
          ),
          site_type: s.integer("The outsourcing type: 1 区域外包-驿收发, 2 区域外包-丰巢.", { minimum: 1, maximum: 2 }),
          contractor: s.nonEmptyString("The regional contractor."),
          contractor_phone: s.nonEmptyString("The contractor phone."),
          aoi_code: s.nonEmptyString("The AOI code."),
          aoi_type: s.nonEmptyString("The AOI type."),
          service_area: s.nonEmptyString("The AOI area code."),
          cn_code: s.nonEmptyString("The business division code (经营本部代码)."),
          deptcode: s.nonEmptyString("The department code (网点代码)."),
          area_code: s.nonEmptyString("The area code (地区编码)."),
          service_time: s.nonEmptyString("The service hours, e.g. 07:59--19:00."),
          extend_json: s.record("Extra business attributes sent as a JSON string.", true),
        },
        {
          optional: [
            "virtual_addr",
            "open_flag",
            "start_open_time",
            "emergency_phone",
            "townname",
            "place_type",
            "service_content_type",
            "service_content_type_ex",
            "extend_json",
          ],
        },
      ),
      ["service_content_type", "service_content_type_ex"],
    ),
    outputSchema: storeInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "station_save_village_store",
    description: "Create or update a township agent station (乡镇代理基本信息新增).",
    requiredScopes: [],
    inputSchema: s.object(
      "The township station to save.",
      {
        header: headerInputSchema,
        store_code: s.nonEmptyString("The station's own store code (自有编码)."),
        virtual_addr: s.nonEmptyString("The agent point id (代理点ID); omit when creating."),
        name: s.nonEmptyString("The agent point name."),
        partner_id: s.nonEmptyString("The supplier id (供应商)."),
        store_type: s.integer("The station type: 86 镇点, 87 村点.", { minimum: 86, maximum: 87 }),
        ...storeAddressFields,
        agent_name: s.nonEmptyString("The agent name (代理人姓名)."),
        agent_no: s.nonEmptyString("The agent employee number (代理人工号)."),
        agent_phone: s.nonEmptyString("The agent phone."),
        agent_id_card: s.nonEmptyString("The agent id card number."),
        linkman_name: s.nonEmptyString("The contact person name."),
        linkman_phone: s.nonEmptyString("The contact person phone."),
        service_time: s.nonEmptyString("The business hours."),
        lng: s.number("The longitude."),
        lat: s.number("The latitude."),
        remark: s.nonEmptyString("The remark."),
        open_flag: s.integer("Whether e-commerce returns are enabled: 1 yes, 0 no.", { minimum: 0, maximum: 1 }),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
        star_business_type: s.nonEmptyString(
          "The e-commerce return types: 1 抖音, 2 得物, 3 唯品会; comma-separated for multiple, empty for none.",
        ),
        short_name: s.nonEmptyString("The township agent short name (乡镇代理简称)."),
      },
      {
        optional: [
          "virtual_addr",
          "agent_id_card",
          "service_time",
          "lng",
          "lat",
          "remark",
          "extend_json",
          "star_business_type",
        ],
      },
    ),
    outputSchema: s.object("The save result.", {
      virtualAddr: s.string("The agent point id (代理点ID)."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_upload_village_store_images",
    description: "Upload the exterior and interior images for a township agent station (乡镇代理图片上传).",
    requiredScopes: [],
    inputSchema: s.object(
      "The images to upload.",
      {
        header: headerInputSchema,
        virtual_addr: s.nonEmptyString("The agent point id (代理点ID)."),
        outer_image_file_names: s.stringArray("The exterior image file names (外部形象名称).", { minItems: 1 }),
        inner_image_file_names: s.stringArray("The interior image file names (内部文件名称).", { minItems: 1 }),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["extend_json"] },
    ),
    outputSchema: s.object("The upload acknowledgement.", {
      virtualAddr: s.string("The agent point id."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_upsert_store_info",
    description:
      "Create or update a city station's base information (驿站基本信息新增/更新). When outsource_flag is 1, outsource_info is saved and required for 驿收发/丰巢 stores.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The station info to save.",
        {
          header: optionalHeaderInputSchema,
          store_code: s.nonEmptyString("The station's own store code (自有编码)."),
          virtual_addr: s.nonEmptyString(
            "The station id; auto-generated from the phone when creating, required when updating.",
          ),
          name: s.nonEmptyString("The station name, formatted as 标志性建筑物+店."),
          partner_id: s.nonEmptyString("The supplier id (供应商)."),
          store_type: s.integer(
            "The station type: 1 顺丰店, 2 个体店, 3 分点部, 4 连锁店, 5 顺丰站, 6 客户接触点, 7 嘿客店, 8 营业站, 9 汪勇项目, 10 乐收直营, 11 丰伙轮, 12 小哥直营点, 13 员工自租店, 14 独营外包店, 15 共配外包-驿收发驿站, 16 共配外包-丰巢服务站, 17 服务商模式-驿收发驿站.",
          ),
          ...storeAddressFields,
          lng: s.number("The longitude."),
          lat: s.number("The latitude."),
          linkman: s.nonEmptyString("The contact person."),
          email: s.nonEmptyString("The email address."),
          phone: s.nonEmptyString("The mobile phone."),
          telephone: s.nonEmptyString("The landline phone."),
          service_content_type: s.nonEmptyString(
            "The service type: 1 drop-off, 2 pickup, 3 both. One of service_content_type or service_content_type_ex is required.",
          ),
          service_content_type_ex: s.integer("The extended service type: 2 home delivery, 3 home pickup, 5 both."),
          business_type: s.integer(
            "The business type: 1 便利店, 2 物业, 3 学校, 4 旅游手信店, 5 旅行社, 6 旅游景点, 7 酒店, 8 其他, 9 商超, 10 口岸, 11 机场, 12 火车站, 13 高铁站, 14 汽车站, 15 CBD楼宇, 16 专业市场.",
          ),
          service_time: s.nonEmptyString("The service hours, e.g. 07:59–19:00."),
          service_time_fes: s.nonEmptyString("The holiday service hours, e.g. 08:–18:00."),
          service_time_sat: s.nonEmptyString("The Saturday service hours."),
          service_time_sun: s.nonEmptyString("The Sunday service hours."),
          asura_sms_flag: s.nonEmptyString("Whether to trigger the pickup SMS: 1 yes, 2 no."),
          sync_cx: s.integer("Whether to sync to CX: 0 no, 1 yes.", { minimum: 0, maximum: 1 }),
          settle_type: s.integer("The settlement type: 1 daily, 2 monthly.", { minimum: 1, maximum: 2 }),
          store_account: s.nonEmptyString("The monthly settlement account; required when settle_type is 2."),
          factory_id: s.nonEmptyString("The supplier code (供应商编码)."),
          fengtu: s.nonEmptyString("Whether the coordinate is a 丰图 coordinate: 1 yes, 0 no."),
          extend_json: s.record("Extra business attributes sent as a JSON string.", true),
          outsource_flag: s.integer(
            "Whether the store is regional-outsource: 0 no (default), 1 yes; immutable after creation. Required for 驿收发/丰巢 stores.",
            { minimum: 0, maximum: 1 },
          ),
          outsource_info: s.object(
            "The regional-outsource details; saved only when outsource_flag is 1.",
            {
              employer_emp_no: s.nonEmptyString("The store owner employee number (店主工号)."),
              employer_emp_name: s.nonEmptyString("The store owner name (店主姓名)."),
              out_aoi_area_code: s.nonEmptyString("The outsourced AOI area code."),
              open_time: s.string("The opening date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
              rent_area: s.number("The store area in square meters; editable for store_type 17 after approval."),
              rent_by_month: s.number("The monthly rent in CNY."),
              rent_start_time: s.string("The rent start date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
              rent_end_time: s.string("The rent end date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
              decoration_flag: s.integer("Whether decoration is needed: 0 no, 1 yes.", { minimum: 0, maximum: 1 }),
              open_flag: s.integer("Whether the store is open: 1 yes, 0 no.", { minimum: 0, maximum: 1 }),
              store_status: s.integer("The current status: 1 locating, 2 decorating; required when open_flag is 0.", {
                minimum: 1,
                maximum: 2,
              }),
              filing_code: s.nonEmptyString("The store filing code; editable for store_type 17 after approval."),
            },
            {
              optional: ["out_aoi_area_code", "store_status", "filing_code"],
            },
          ),
          full_name: s.nonEmptyString("The station's full official name, formatted as 市区简称+对外简称."),
          land_mark: s.nonEmptyString(
            "The landmark building, 2-6 Chinese/alphanumeric characters; required for regional-outsource stores.",
          ),
          star_business_type: s.nonEmptyString(
            "The e-commerce return types: 1 抖音, 2 得物, 3 唯品会; comma-separated for multiple, empty for none.",
          ),
        },
        {
          optional: [
            "header",
            "virtual_addr",
            "email",
            "phone",
            "telephone",
            "service_content_type",
            "service_content_type_ex",
            "service_time_fes",
            "service_time_sat",
            "service_time_sun",
            "sync_cx",
            "store_account",
            "extend_json",
            "outsource_flag",
            "outsource_info",
            "land_mark",
            "star_business_type",
          ],
        },
      ),
      ["service_content_type", "service_content_type_ex"],
    ),
    outputSchema: storeInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "station_save_xgj_store",
    description: "Create or update a 星管家 station's base information (星管家基本信息新增).",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The 星管家 station to save.",
        {
          header: headerInputSchema,
          virtual_addr: s.nonEmptyString(
            "The station id; generated from the phone when creating, required when updating.",
          ),
          service_content_type: s.nonEmptyString(
            "The service type: 1 寄件服务, 2 自取服务, 3 寄取件服务. One of service_content_type or service_content_type_ex is required.",
          ),
          store_code: s.nonEmptyString("The station's own store code (自有编码)."),
          name: s.nonEmptyString("The station name (驿站名称)."),
          partner_id: s.nonEmptyString("The supplier id (供应商)."),
          ...storeAddressFields,
          lng: s.number("The longitude."),
          lat: s.number("The latitude."),
          phone: s.nonEmptyString("The mobile phone (手机号码)."),
          service_content_type_ex: s.integer("The extended service type: 2 上门派件, 3 上门取件, 5 both."),
          business_type: s.integer("The 星管家 type: 100 业主, 101 租户, 102 物业人员, 103 其他."),
          service_time: s.nonEmptyString("The service hours, e.g. 07:59--19:00."),
          service_time_fes: s.nonEmptyString("The holiday service hours, e.g. 08:--18:00."),
          service_time_sat: s.nonEmptyString("The Saturday service hours."),
          service_time_sun: s.nonEmptyString("The Sunday service hours."),
          cn_code: s.nonEmptyString("The business division code (经营本部代码)."),
          area_code: s.nonEmptyString("The area code (地区编码); immutable once submitted."),
          deptcode: s.nonEmptyString("The department code (网点编码)."),
          factory_id: s.nonEmptyString("The supplier code (供应商编码)."),
          identity_card: s.nonEmptyString("The id card number, matching the station id."),
          sf_family: s.nonEmptyString("Whether an SF relative: 1 yes, 0 no."),
          employee_no: s.nonEmptyString("The employee number (工号)."),
          fengtu: s.nonEmptyString("Whether the coordinate is a 丰图 coordinate: 1 yes, 0 no."),
          extend_json: s.record("Extra business attributes sent as a JSON string.", true),
        },
        {
          optional: [
            "virtual_addr",
            "lng",
            "lat",
            "service_content_type",
            "service_content_type_ex",
            "service_time",
            "service_time_fes",
            "service_time_sat",
            "service_time_sun",
            "sf_family",
            "employee_no",
            "extend_json",
          ],
        },
      ),
      ["service_content_type", "service_content_type_ex"],
    ),
    outputSchema: s.object("The save acknowledgement.", {
      storeCode: s.string("The station's own store code."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_upload_xgj_images",
    description:
      "Upload identity, face and property images for a 星管家 station (星管家相册新增); identity_file_names must contain exactly 2 images.",
    requiredScopes: [],
    inputSchema: s.object(
      "The images to upload.",
      {
        header: headerInputSchema,
        virtual_addr: s.nonEmptyString("The station id (驿站ID)."),
        identity_file_names: s.stringArray("The id-card image file names; exactly 2 required.", {
          minItems: 2,
          maxItems: 2,
        }),
        face_file_names: s.stringArray("The face image file names."),
        house_file_names: s.stringArray("The property image file names."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["face_file_names", "house_file_names", "extend_json"] },
    ),
    outputSchema: s.object("The upload acknowledgement.", {
      virtualAddr: s.string("The station id."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_get_oss_token",
    description:
      "Get an OSS token for direct image upload (获取OSSToken信息). The oss_client_name and path_id values come from your SF Express contact.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The token request.", {
      header: headerInputSchema,
      oss_client_name: s.nonEmptyString("The backend OSS name (对应后端OSS名称); get it from your SF contact."),
      path_id: s.nonEmptyString("The file path id (对应文件路径pathid); get it from your SF contact."),
    }),
    outputSchema: s.unknownObject(
      "The OSS upload credentials issued for the requested path, under the field names the SF OSS token contract defines.",
    ),
  }),
  defineProviderAction(service, {
    name: "station_query_grid_schedule",
    description: "Query the grid/bin assignment for a courier's shift at a station (星管家排班信息查询).",
    requiredScopes: [],
    inputSchema: s.requiredObject("The schedule query.", {
      header: headerInputSchema,
      courier_code: s.nonEmptyString("The courier employee number (收派员工号)."),
      aoi_list: s.stringArray("The AOI codes to query.", { minItems: 1 }),
      batch_code: s.nonEmptyString("The shift code (班次编码), e.g. 02D."),
    }),
    outputSchema: s.object("The grid assignment.", {
      bin_code: s.string("The assigned grid bin (格口号)."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_upload_picture",
    description: "Upload one base64 image for a station (图片上传); the image must be at most 200 KB.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The image to upload.", {
      header: headerInputSchema,
      oss_client_name: s.nonEmptyString("The backend OSS name; get it from your SF contact."),
      path_id: s.nonEmptyString("The file path id; get it from your SF contact."),
      file_type_name: s.nonEmptyString("The image type, e.g. png, jpg, bmp."),
      base64_content: s.nonEmptyString("The base64-encoded image content, at most 200 KB."),
    }),
    outputSchema: s.object("The upload acknowledgement.", {
      pathId: s.string("The file path id."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_submit_fc_resource",
    description: "Submit or update a Hive Box service station's information (丰巢服务站信息接收或更新).",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The station resource to submit.",
        {
          header: headerInputSchema,
          store_code: s.nonEmptyString("The station's own store code (自有编码)."),
          virtual_addr: s.nonEmptyString("The SF station id; required when updating."),
          partner_id: s.nonEmptyString("The supplier id (供应商)."),
          site_status: s.integer("The store status: 1 pending, 2 operating, 3 retired, 4 suspended.", {
            minimum: 1,
            maximum: 4,
          }),
          site_name: s.nonEmptyString("The store name."),
          open_flag: s.integer("Whether the store is open to the public: 1 yes, 0 no.", { minimum: 0, maximum: 1 }),
          start_open_time: s.nonEmptyString("The operation start time."),
          linkman: s.nonEmptyString("The contact person."),
          phone: s.nonEmptyString("The contact phone."),
          emergency_phone: s.nonEmptyString("The emergency contact phone."),
          ...storeAddressFields,
          lng: s.number("The longitude."),
          lat: s.number("The latitude."),
          place_type: s.nonEmptyString(
            "The place type: 1 商住混合区, 2 政府机构, 3 商场, 4 医院, 5 学校, 6 写字楼, 7 住宅.",
          ),
          service_content_type: s.integer("The service type: 1 可自寄, 2 可自取, 3 both.", { minimum: 1, maximum: 3 }),
          service_content_type_ex: s.integer("The extended service type: 2 上门派件, 3 上门取件, 5 both."),
          site_type: s.integer(
            "The station type: 1 物业, 2 个体超市, 3 企业前台, 4 连锁门店, 5 乡镇代收点, 6 无人驿站, 7 直营点, 8 快递网点, 9 第三方, 10 校园点, 11 其他.",
          ),
          service_time: s.nonEmptyString("The service hours, e.g. 07:59–19:00."),
          extend_json: s.record("Extra business attributes sent as a JSON string.", true),
        },
        {
          optional: [
            "virtual_addr",
            "open_flag",
            "start_open_time",
            "emergency_phone",
            "townname",
            "place_type",
            "service_content_type",
            "service_content_type_ex",
            "extend_json",
          ],
        },
      ),
      ["service_content_type", "service_content_type_ex"],
    ),
    outputSchema: storeInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "station_update_xgj_waybill_fee",
    description: "Update a 星管家 waybill's dispatch and review-fee information (星管家运单及好评费更新).",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybill fee record to update.",
      {
        header: headerInputSchema,
        waybill_no: kbPartnerFields.waybill_no,
        bill_type: s.integer("The direction: 1 收件, 2 派件.", { minimum: 1, maximum: 2 }),
        bill_date: s.nonEmptyString("The pickup/delivery date."),
        star_virtual_addr: s.nonEmptyString("The 星管家 station code (星管家编码)."),
        star_emp_code: s.nonEmptyString("The 星管家 employee number (星管家工号)."),
        star_send_type: s.integer("The 星管家 delivery type: 1 上门, 2 投店, 3 投柜, 4 投外部渠道.", {
          minimum: 1,
          maximum: 4,
        }),
        is_settle: s.integer("Whether the 星管家 system settles: 0 no, 1 yes.", { minimum: 0, maximum: 1 }),
        good_fee: s.number("The review fee in CNY (好评费)."),
        push_time: s.nonEmptyString("The push time."),
        remark: s.nonEmptyString("The remark."),
      },
      { optional: ["star_send_type", "good_fee", "remark"] },
    ),
    outputSchema: stationAckOutputSchema("The updated waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_update_xgj_insurance_fee",
    description: "Update a 星管家 station's monthly insurance fee (星管家保险费更新).",
    requiredScopes: [],
    inputSchema: s.object(
      "The insurance fee record to update.",
      {
        header: headerInputSchema,
        star_virtual_addr: s.nonEmptyString("The 星管家 station code (星管家编码)."),
        identity_card: s.nonEmptyString("The id card number matching the station code."),
        safe_month: s.string("The billing month in yyyy-mm format.", { pattern: "^\\d{4}-\\d{2}$" }),
        safe_fee: s.number("The insurance fee in CNY."),
      },
      { optional: ["safe_fee"] },
    ),
    outputSchema: s.object("The update acknowledgement.", {
      starVirtualAddr: s.string("The 星管家 station code."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_submit_receipt_info",
    description: "Submit a waybill's receipt information with its fee, service, mark and addition lists (回单信息).",
    requiredScopes: [],
    inputSchema: s.object(
      "The receipt to submit.",
      {
        header: headerInputSchema,
        waybill_no: kbPartnerFields.waybill_no,
        agent_code: kbPartnerFields.agent_code,
        partner_id: kbPartnerFields.partner_id,
        area_code: kbPartnerFields.area_code,
        city_id: kbPartnerFields.city_id,
        client_code: s.nonEmptyString("The client code (客户端编号)."),
        sys_code: s.nonEmptyString("The system code (系统编码)."),
        dest_zone_code: s.nonEmptyString("The destination code, precise to the department (目的地代码)."),
        real_weight_qty: s.nonEmptyString("The actual weight; required for receipts without details."),
        deliver_emp_code: s.nonEmptyString("The delivery courier (派件员)."),
        subscriber_name: s.nonEmptyString("The signatory name (签收人)."),
        signin_tm: s.string("The signing date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
        ext_attr_json: s.nonEmptyString("The remark, as a JSON string."),
        delivered_type: s.nonEmptyString(
          "The delivery type: 1 正常, 2 作废件, 3 转寄, 4 退回, 5 扣件, 6 遗失, 7 补单, 8 满月交单.",
        ),
        inputer_emp_code: s.nonEmptyString("The entry operator employee number (录单人工号)."),
        cargo_type_code: s.nonEmptyString("The cargo content code; required for receipts without details."),
        limit_type_code: s.nonEmptyString("The time-limit type code; required for receipts without details."),
        express_type_code: s.nonEmptyString("The business type code; required for receipts without details."),
        create_tm: s.string("The creation date in yyyy-MM-dd format.", { pattern: stationDatePattern }),
        waybill_fee_dto_list: s.array("The fee entries.", receiptFeeSchema, { minItems: 1 }),
        waybill_service_dto_list: s.array("The value-added service entries.", receiptServiceSchema),
        waybill_mark_dto_list: s.array("The mark entries.", receiptMarkSchema),
        waybill_addition_dto_list: s.array("The additional attribute entries.", receiptAdditionSchema),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      {
        optional: [
          "real_weight_qty",
          "ext_attr_json",
          "inputer_emp_code",
          "cargo_type_code",
          "limit_type_code",
          "express_type_code",
          "waybill_service_dto_list",
          "waybill_mark_dto_list",
          "waybill_addition_dto_list",
          "extend_json",
        ],
      },
    ),
    outputSchema: stationAckOutputSchema("The receipted waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_query_waybill_info",
    description:
      "Query a waybill's contact, payer and fee details (通用运单查询). Phone and address fields in the response are encrypted by SF Express.",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybill to query.",
      {
        header: headerInputSchema,
        waybill_no: kbPartnerFields.waybill_no,
        agent_code: kbPartnerFields.agent_code,
        partner_id: kbPartnerFields.partner_id,
        area_code: kbPartnerFields.area_code,
        city_id: kbPartnerFields.city_id,
        lang_code: s.nonEmptyString(
          "The language: 1 简体中文 (default, currently the only supported), 2 繁体中文, 3 English.",
        ),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["lang_code", "extend_json"] },
    ),
    outputSchema: s.object(
      "The waybill details.",
      {
        receiver_address: s.string("The recipient address (encrypted)."),
        sender: s.string("The sender name."),
        sender_phone: s.string("The sender phone (encrypted)."),
        sender_mobile: s.string("The sender mobile (encrypted)."),
        receiver: s.string("The recipient name."),
        receiver_phone: s.string("The recipient phone (encrypted)."),
        receiver_mobile: s.string("The recipient mobile (encrypted)."),
        payer: s.string("The payer: sender, receiver, or third."),
        pack_fee: s.string("The freight fee."),
        insurance_fee: s.string("The insurance fee."),
        cod_bill_flg: s.string("Whether cash-on-delivery applies."),
        cod_fee: s.string("The cash-on-delivery amount."),
        deliverEmpCode: s.string("The delivery courier employee number."),
      },
      {
        optional: [
          "receiver_address",
          "sender",
          "sender_phone",
          "sender_mobile",
          "receiver",
          "receiver_phone",
          "receiver_mobile",
          "payer",
          "pack_fee",
          "insurance_fee",
          "cod_bill_flg",
          "cod_fee",
          "deliverEmpCode",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "station_upload_fc_images",
    description: "Upload storefront and interior images for a Hive Box service station (丰巢服务站相册新增).",
    requiredScopes: [],
    inputSchema: s.object(
      "The images to upload.",
      {
        header: headerInputSchema,
        virtual_addr: s.nonEmptyString("The station id (驿站ID)."),
        site_door_file_names: s.stringArray("The storefront image file names (站点门店照片).", { minItems: 1 }),
        site_inside_file_names: s.stringArray("The interior image file names (站点室内照片)."),
        site_file_names: s.stringArray("The site image file names (站点照片)."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["site_inside_file_names", "site_file_names", "extend_json"] },
    ),
    outputSchema: s.object("The upload acknowledgement.", {
      virtualAddr: s.string("The station id."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_upload_store_album",
    description:
      "Upload album images for a station (驿站相册新增), such as exterior, license, poster and signage photos.",
    requiredScopes: [],
    inputSchema: s.object(
      "The album images to upload.",
      {
        header: headerInputSchema,
        virtual_addr: s.nonEmptyString("The station id (驿站ID)."),
        background_file_names: s.stringArray("The exterior image file names (驿站外观文件名称)."),
        license_file_names: s.stringArray("The business license image file names (营业执照文件名称)."),
        door_head: s.stringArray(
          "The door-head image file names (门头); 易收发 regional-outsource city stations only.",
        ),
        light_box: s.stringArray("The light-box image file names (灯箱)."),
        image_wall: s.stringArray("The image-wall file names (形象墙)."),
        girdle: s.stringArray("The girdle glass-sticker file names (腰封玻璃贴)."),
        cooperation_license: s.stringArray("The cooperation-plate image file names (授权合作牌)."),
        business_poster: s.stringArray("The business-poster image file names (业务介绍海报)."),
        pickup_poster: s.stringArray("The self-pickup poster file names (自助取件海报)."),
        pickup_desk: s.stringArray("The pickup-desk card file names (寄取件台卡)."),
        wall_system: s.stringArray("The wall-system image file names (上墙制度)."),
        hanging_flags: s.stringArray("The hanging-flag image file names (吊旗8面)."),
        reception_desk: s.stringArray("The reception-desk image file names (接待台)."),
        shelf_stickers: s.stringArray("The shelf-sticker image file names (货架贴)."),
        indication: s.stringArray("The indication image file names (指示类)."),
        tips: s.stringArray("The tips image file names (提示类)."),
        carton_desk: s.stringArray("The carton-recycling-desk image file names (纸箱回收台)."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      {
        optional: [
          "background_file_names",
          "license_file_names",
          "door_head",
          "light_box",
          "image_wall",
          "girdle",
          "cooperation_license",
          "business_poster",
          "pickup_poster",
          "pickup_desk",
          "wall_system",
          "hanging_flags",
          "reception_desk",
          "shelf_stickers",
          "indication",
          "tips",
          "carton_desk",
          "extend_json",
        ],
      },
    ),
    outputSchema: s.object("The upload acknowledgement.", {
      virtualAddr: s.string("The station id."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_add_brand_inspection_images",
    description:
      "Submit brand-inspection images for a station task (品牌巡检相册新增); resubmitting the same task_id updates its images.",
    requiredScopes: [],
    inputSchema: s.object(
      "The inspection images to submit.",
      {
        task_id: s.nonEmptyString("The brand inspection task id; resubmitting the same id updates its images."),
        virtual_addr: s.nonEmptyString("The station id (驿站ID)."),
        partner_id: s.nonEmptyString(
          "The partner id for this channel (注意区别丰桥公共参数的 partnerID), e.g. YSF14SD1.",
        ),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
        background_file_names: s.stringArray("The station exterior image file names, at most 10.", {
          minItems: 1,
          maxItems: 10,
        }),
        license_file_names: s.stringArray("The business license image file names, at most 10.", {
          minItems: 1,
          maxItems: 10,
        }),
        door_head: s.stringArray("The door-head image file names; at most 1 each for these optional types.", {
          maxItems: 1,
        }),
        light_box: s.stringArray("The light-box image file names.", { maxItems: 1 }),
        image_wall: s.stringArray("The image-wall file names.", { maxItems: 1 }),
        girdle: s.stringArray("The girdle glass-sticker file names.", { maxItems: 1 }),
        cooperation_license: s.stringArray("The cooperation-plate file names.", { maxItems: 1 }),
        business_poster: s.stringArray("The business-poster file names.", { maxItems: 1 }),
        pickup_poster: s.stringArray("The self-pickup poster file names.", { maxItems: 1 }),
        pickup_desk: s.stringArray("The pickup-desk card file names.", { maxItems: 1 }),
        wall_system: s.stringArray("The wall-system file names.", { maxItems: 1 }),
        hanging_flags: s.stringArray("The hanging-flag file names.", { maxItems: 1 }),
        reception_desk: s.stringArray("The reception-desk file names.", { maxItems: 1 }),
        shelf_stickers: s.stringArray("The shelf-sticker file names.", { maxItems: 1 }),
        indication: s.stringArray("The indication file names.", { maxItems: 1 }),
        tips: s.stringArray("The tips file names.", { maxItems: 1 }),
        carton_desk: s.stringArray("The carton-recycling-desk file names.", { maxItems: 1 }),
      },
      {
        optional: [
          "extend_json",
          "door_head",
          "light_box",
          "image_wall",
          "girdle",
          "cooperation_license",
          "business_poster",
          "pickup_poster",
          "pickup_desk",
          "wall_system",
          "hanging_flags",
          "reception_desk",
          "shelf_stickers",
          "indication",
          "tips",
          "carton_desk",
        ],
      },
    ),
    outputSchema: s.object("The submission acknowledgement.", {
      taskId: s.string("The brand inspection task id."),
    }),
  }),
  defineProviderAction(service, {
    name: "station_pre_handover_pack",
    description:
      "Pre-check-in a delivery waybill at an external station (外部驿站派件预入库) before the physical handover.",
    requiredScopes: [],
    inputSchema: kbPackInputSchema("The pre-check-in request."),
    outputSchema: stationAckOutputSchema("The pre-checked-in waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_handover_pack",
    description: "Check in a delivery waybill at an external station (外部驿站派件入库, route 657).",
    requiredScopes: [],
    inputSchema: kbPackInputSchema("The check-in request."),
    outputSchema: stationAckOutputSchema("The checked-in waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_customer_receive_pack",
    description:
      "Check out a waybill at an external station when the customer picks it up (外部驿站派件出库, route 658).",
    requiredScopes: [],
    inputSchema: kbPackInputSchema("The check-out request."),
    outputSchema: stationAckOutputSchema("The checked-out waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_save_store",
    description:
      "Create or update an external station (新增/修改外部驿站). Omit virtual_addr to create; pass it to update an existing station.",
    requiredScopes: [],
    inputSchema: s.object(
      "The station to save.",
      {
        virtual_addr: s.nonEmptyString("The station id (便利店编码); omit to create, required to update."),
        name: s.nonEmptyString("The station name."),
        partner_id: kbPartnerFields.partner_id,
        store_code: kbPartnerFields.store_code,
        store_type: s.stringEnum("The station type: 81 = 人工驿站 (staffed), 82 = 快递柜 (locker).", ["81", "82"]),
        linkman: s.nonEmptyString("The station owner name."),
        phone: s.nonEmptyString("The owner mobile number."),
        telephone: s.nonEmptyString("The station office phone number."),
        service_time: s.nonEmptyString("The business hours, for example 08:00--20:00."),
        lng: s.number("The station longitude."),
        lat: s.number("The station latitude."),
        province_name: s.nonEmptyString("The province name, e.g. 广东省."),
        city_name: s.nonEmptyString("The city name, e.g. 深圳市."),
        county_name: s.nonEmptyString("The district or county name, e.g. 南山区."),
        town_name: s.nonEmptyString("The town or subdistrict name."),
        address: s.nonEmptyString("The detailed street address."),
        business_scope: s.stringEnum(
          "The business scope: 1 = 快递 (express only), 2 = 快递+商业 (express and retail).",
          ["1", "2"],
        ),
        square: s.number("The station area in square meters, up to 2 decimal places."),
        area_type: s.stringEnum("The area type: 4 学校, 5 机关单位, 6 商圈, 7 CBD, 8 其他.", ["4", "5", "6", "7", "8"]),
        administrative_area_type: s.stringEnum("The administrative area type: 1 城区, 2 乡镇, 3 农村.", [
          "1",
          "2",
          "3",
        ]),
        is_delete: s.boolean(
          "Whether the station is disabled (停用, 1) or enabled (启用, 0); required by the upstream contract.",
        ),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      {
        optional: ["virtual_addr", "town_name", "square", "area_type", "administrative_area_type", "extend_json"],
      },
    ),
    outputSchema: stationAckOutputSchema("The saved station's own store code.", "storeCode"),
  }),
  defineProviderAction(service, {
    name: "station_add_store_images",
    description:
      "Attach business-license, filing, or album image file names to an external station (外部驿站上传营业执照、末端备案、相册).",
    requiredScopes: [],
    inputSchema: s.object(
      "The image file names to attach.",
      {
        store_code: kbPartnerFields.store_code,
        background_file_names: s.stringArray("The station album file names."),
        license_file_names: s.stringArray("The business license file names."),
        filing_file_names: s.stringArray("The terminal filing file names."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["background_file_names", "license_file_names", "filing_file_names", "extend_json"] },
    ),
    outputSchema: stationAckOutputSchema("The station's own store code.", "storeCode"),
  }),
  defineProviderAction(service, {
    name: "station_send_sms",
    description: "Send a pickup-code SMS for a waybill from an external station (外部驿站发送短信).",
    requiredScopes: [],
    inputSchema: s.object(
      "The SMS to send.",
      {
        partner_id: kbPartnerFields.partner_id,
        store_code: kbPartnerFields.store_code,
        pick_up_code: s.nonEmptyString("The pickup code (取件码)."),
        waybill_no: kbPartnerFields.waybill_no,
        sms_template: s.integer("The SMS template id, from 1 to 6.", { minimum: 1, maximum: 6 }),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["extend_json"] },
    ),
    outputSchema: s.object(
      "The SMS result.",
      {
        waybillNo: s.string("The waybill number the SMS was sent for."),
        smsId: s.string("The SMS id assigned by SF Express."),
        msg: s.string("The message returned by SF Express."),
      },
      { optional: ["smsId", "msg"] },
    ),
  }),
  defineProviderAction(service, {
    name: "station_check_waybill",
    description:
      "Check whether a waybill is valid for external-station operations (外部驿站运单校验); an SF waybill without a recipient phone cannot receive station SMS.",
    requiredScopes: [],
    inputSchema: s.object(
      "The waybill to check.",
      {
        partner_id: kbPartnerFields.partner_id,
        waybill_no: kbPartnerFields.waybill_no,
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["extend_json"] },
    ),
    outputSchema: s.object(
      "The check result.",
      {
        waybillNo: s.string("The checked waybill number."),
        msg: s.string("The message returned by SF Express."),
        phone: s.string("The recipient phone digits SF returns for the waybill."),
      },
      { optional: ["msg", "phone"] },
    ),
  }),
  defineProviderAction(service, {
    name: "station_temp_store",
    description:
      "Report a temporary station hold for a waybill (驿站暂存): bill_type 1 = 收端暂存 (route 410), 2 = 派端暂存 (route 210).",
    requiredScopes: [],
    inputSchema: s.object(
      "The temporary hold to report.",
      {
        bill_type: s.stringEnum("The hold side: 1 = 收端 (receiving), 2 = 派端 (delivery).", ["1", "2"]),
        agent_code: kbPartnerFields.agent_code,
        waybill_no: kbPartnerFields.waybill_no,
        partner_id: kbPartnerFields.partner_id,
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["extend_json"] },
    ),
    outputSchema: stationAckOutputSchema("The held waybill number."),
  }),
  defineProviderAction(service, {
    name: "station_verify_delivery_permission",
    description:
      "Check whether a channel and courier may deliver a waybill (派件管控). The channel code is allocated by SF (联系868850).",
    requiredScopes: [],
    inputSchema: s.object(
      "The delivery permission check.",
      {
        sgs_username: s.nonEmptyString("The courier's employee id (小哥工号)."),
        sgs_netcode: s.nonEmptyString("The department code (网点编码), e.g. 755Q."),
        sgs_distcode: s.nonEmptyString("The city code used for traffic splitting (城市编码), e.g. 755."),
        waybill_no: kbPartnerFields.waybill_no,
        channel: s.nonEmptyString("The channel code allocated by SF."),
        opr_id: s.nonEmptyString("The operator name."),
        dept_code: s.nonEmptyString("The department or city code."),
        operation_scenario: s.stringEnum("The scenario code: DELIVERY = 派件 (default), STOREHANDOVER = 便利店交接.", [
          "DELIVERY",
          "STOREHANDOVER",
        ]),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["opr_id", "dept_code", "operation_scenario", "extend_json"] },
    ),
    outputSchema: s.unknownObject("The delivery permission verdict returned by SF Express (passed through as-is)."),
  }),
  defineProviderAction(service, {
    name: "station_validate_delivery_password",
    description: "Validate a customer's pickup password for a waybill at a partner station (验证取件密码).",
    requiredScopes: [],
    inputSchema: s.object(
      "The pickup password to validate.",
      {
        partner_id: kbPartnerFields.partner_id,
        waybill_no: kbPartnerFields.waybill_no,
        agent_code: kbPartnerFields.agent_code,
        pwd: s.nonEmptyString("The pickup password (取件密码)."),
        extend_json: s.record("Extra business attributes sent as a JSON string.", true),
      },
      { optional: ["extend_json"] },
    ),
    outputSchema: s.object(
      "The validation result.",
      {
        waybillNo: s.string("The validated waybill number."),
        msg: s.string("The result message, e.g. 取件密码验证通过."),
      },
      { optional: ["msg"] },
    ),
  }),
];
