import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  looseArray,
  nullableString,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalNumberLike,
  optionalRecord,
  optionalString,
  recordOrEmpty,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputNumber,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { optionalFlagNumber, readServiceValueList, requestSfExpress } from "./runtime.ts";

const interceptActionCodes: Record<string, string> = {
  redirect: "1",
  return: "2",
  priority: "3",
  redeliver: "4",
  change_to_self_pickup: "5",
  change_to_door: "6",
  change_delivery_time: "7",
  change_recipient: "8",
  change_pay_method: "9",
  change_cod: "10",
  void: "12",
};

const interceptRoleCodes: Record<string, string> = {
  sender: "1",
  recipient: "2",
  third_party: "3",
};

const interceptPayModeCodes: Record<string, string> = {
  sender_cash: "1",
  recipient_cash: "2",
  sender_to_third_monthly: "3",
  sender_monthly: "4",
};

const selfPickPointCodes: Record<string, string> = {
  partner_point: "1",
  locker: "2",
  site: "3",
  transfer_center: "4",
};

/** Handlers for the SF Express general-shipping endpoints. */
export const sfExpressOrderHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async create_order(input, context) {
    const expressTypeId = optionalNumber(input.express_type_id);
    const scenePlanCode = optionalString(input.scene_plan_code);
    if (expressTypeId !== undefined && scenePlanCode !== undefined) {
      throw providerInputError("express_type_id and scene_plan_code are mutually exclusive.");
    }

    const temperatureRange = optionalNumber(input.temperature_range);
    if (expressTypeId === 12 && temperatureRange === undefined) {
      throw providerInputError("temperature_range is required when express_type_id is 12 (医药温控件).");
    }
    const parcelQty = optionalNumber(input.parcel_qty);
    const totalWeight = optionalNumber(input.total_weight);
    if (parcelQty !== undefined && parcelQty > 1 && totalWeight === undefined) {
      throw providerInputError("total_weight is required for multi-package (子母件) shipments.");
    }
    const waybillNoInfoList = readWaybillNoInfoList(input.waybill_no_info_list);

    const payload = await requestSfExpress(
      "EXP_RECE_CREATE_ORDER",
      compactObject({
        language: optionalString(input.language) ?? "zh-CN",
        orderId: requiredInputString(input.order_id, "order_id"),
        // expressTypeId is documented mandatory with a default of 1, and is the
        // two-way alternative to scenePlanCode.
        expressTypeId: expressTypeId ?? (scenePlanCode === undefined ? 1 : undefined),
        scenePlanCode,
        cargoDetails: readCargoDetails(input.cargo_details),
        cargoDesc: optionalString(input.cargo_desc),
        contactInfoList: [
          readOrderContact(input.sender, "sender", "CN"),
          readOrderContact(input.recipient, "recipient", "CN"),
        ],
        monthlyCard: optionalString(input.monthly_card),
        payMethod: optionalNumber(input.pay_method),
        parcelQty,
        totalWeight,
        totalLength: optionalNumber(input.total_length),
        totalWidth: optionalNumber(input.total_width),
        totalHeight: optionalNumber(input.total_height),
        totalVolume: optionalNumber(input.total_volume),
        totalNetWeight: optionalNumber(input.total_net_weight),
        sendStartTm: optionalString(input.send_start_time),
        isDocall: optionalFlagNumber(input.is_docall),
        isSignBack: optionalFlagNumber(input.is_sign_back),
        custReferenceNo: optionalString(input.cust_reference_no),
        orderSource: optionalString(input.order_source),
        remark: optionalString(input.remark),
        temperatureRange,
        serviceList: readServiceValueList(input.service_list, "service_list"),
        customsInfo: readCustomsInfo(input.customs_info),
        waybillNoInfoList,
        // Only a list that actually carries a waybill number means SF must not
        // allocate one; the same list also carries dimensions-only entries.
        isGenWaybillNo: hasWaybillNo(waybillNoInfoList) ? 0 : undefined,
        isReturnQRCode: optionalFlagNumber(input.is_return_qr_code),
        extraInfoList: readExtraInfoList(input.extra_info_list),
        specialDeliveryTypeCode: optionalString(input.special_delivery_type_code),
        specialDeliveryValue: optionalString(input.special_delivery_value),
      }),
      context,
      "execute",
    );
    return normalizeOrderResult(payload);
  },
  async pre_order(input, context) {
    const payload = await requestSfExpress(
      "EXP_RECE_PRE_ORDER",
      compactObject({
        orderId: requiredInputString(input.order_id, "order_id"),
        cargoName: optionalString(input.cargo_name),
        contactInfoList: [
          readPreOrderContact(input.sender, "sender"),
          readPreOrderContact(input.recipient, "recipient"),
        ],
        monthlyCard: optionalString(input.monthly_card),
        expressTypeId: requiredInputNumber(input.express_type_id, "express_type_id"),
      }),
      context,
      "execute",
    );
    return {
      windows: objectArray(payload, "msgData", providerResponseError).map((window, index) => ({
        serviceDate: requiredString(window.serviceDate, `msgData[${index}].serviceDate`, providerResponseError),
        startTime: requiredString(window.startTime, `msgData[${index}].startTime`, providerResponseError),
        endTime: requiredString(window.endTime, `msgData[${index}].endTime`, providerResponseError),
      })),
    };
  },
  async update_order(input, context) {
    const dealType = input.deal_type === "cancel" ? 2 : 1;
    const destContactInfo = readDestContactInfo(input.dest_contact_info);
    const waybillNoInfoList = readWaybillNoInfoList(input.waybill_no_info_list);
    if (dealType === 1 && !hasWaybillNo(waybillNoInfoList)) {
      throw providerInputError("waybill_no_info_list must carry at least one waybill_no when confirming an order.");
    }
    const payload = await requestSfExpress(
      "EXP_RECE_UPDATE_ORDER",
      compactObject({
        orderId: requiredInputString(input.order_id, "order_id"),
        dealType,
        waybillNoInfoList,
        customsBatchs: optionalString(input.customs_batchs),
        collectEmpCode: optionalString(input.collect_emp_code),
        sourceZoneCode: optionalString(input.source_zone_code),
        destZoneCode: optionalString(input.dest_zone_code),
        totalWeight: optionalNumber(input.total_weight),
        totalVolume: optionalNumber(input.total_volume),
        totalLength: optionalNumber(input.total_length),
        totalWidth: optionalNumber(input.total_width),
        totalHeight: optionalNumber(input.total_height),
        expressTypeId: optionalNumber(input.express_type_id),
        extraInfoList: readExtraInfoList(input.extra_info_list),
        serviceList: readServiceValueList(input.service_list, "service_list"),
        destContactInfo,
        // The doc gates contact changes on the new-confirm mode; 1 is "支持修改联系人".
        isConfirmNew: destContactInfo === undefined ? undefined : 1,
        isDocall: optionalFlagNumber(input.is_docall),
        specialDeliveryTypeCode: optionalString(input.special_delivery_type_code),
        specialDeliveryValue: optionalString(input.special_delivery_value),
        sendStartTm: optionalString(input.send_start_time),
        pickupAppointEndtime: optionalString(input.pickup_appoint_end_time),
        remark: optionalString(input.remark),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express order update response");
    return {
      orderId: requiredString(record.orderId, "orderId", providerResponseError),
      resStatus: integer(record.resStatus, "resStatus", providerResponseError),
      waybillNoInfoList: normalizeWaybillNoInfoList(record.waybillNoInfoList),
    };
  },
  async query_order_result(input, context) {
    const searchType = optionalString(input.search_type);
    const payload = await requestSfExpress(
      "EXP_RECE_SEARCH_ORDER_RESP",
      compactObject({
        orderId: requiredInputString(input.order_id, "order_id"),
        searchType: searchType === undefined ? undefined : searchType === "return" ? "2" : "1",
        mainWaybillNo: optionalString(input.main_waybill_no),
        language: optionalString(input.language),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express order result response");
    return compactObject({
      orderId: requiredString(record.orderId, "orderId", providerResponseError),
      origincode: optionalString(record.origincode),
      destcode: optionalString(record.destcode),
      filterResult: nullableString(record.filterResult) ?? null,
      remark: optionalString(record.remark),
      waybillNoInfoList: normalizeWaybillNoInfoList(record.waybillNoInfoList),
      routeLabelInfo: looseArray(record.routeLabelInfo),
      returnExtraInfoList: Array.isArray(record.returnExtraInfoList) ? record.returnExtraInfoList : undefined,
    });
  },
  async get_sub_waybill_nos(input, context) {
    const payload = await requestSfExpress(
      "EXP_RECE_GET_SUB_MAILNO",
      compactObject({
        orderId: requiredInputString(input.order_id, "order_id"),
        parcelQty: positiveInteger(input.parcel_qty, "parcel_qty", providerInputError),
        waybillNoInfoList: readWaybillNoInfoList(input.waybill_no_info_list),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express sub waybill response");
    return {
      orderId: requiredString(record.orderId, "orderId", providerResponseError),
      parcelQty: optionalNumber(record.parcelQty) ?? null,
      waybillNoInfoList: normalizeWaybillNoInfoList(record.waybillNoInfoList),
    };
  },
  async intercept_order(input, context) {
    const actionType = requiredInputString(input.action_type, "action_type");
    const serviceCode = interceptActionCodes[actionType];
    if (serviceCode === undefined) {
      throw providerInputError(`action_type ${actionType} is not supported.`);
    }
    const payMode = interceptPayModeCodes[requiredInputString(input.pay_mode, "pay_mode")];
    if (payMode === undefined) {
      throw providerInputError("pay_mode is not supported.");
    }
    const cancel = optionalBoolean(input.cancel) ?? false;
    const commandId = optionalString(input.command_id);
    if (cancel && commandId === undefined) {
      throw providerInputError("command_id is required when cancel is true.");
    }
    if (cancel && serviceCode !== "1" && serviceCode !== "2") {
      throw providerInputError("cancel only supports redirect (转寄) and return (退回) instructions.");
    }
    const monthlyCardNo = optionalString(input.monthly_card_no);
    if ((actionType === "change_cod" || payMode === "3" || payMode === "4") && monthlyCardNo === undefined) {
      throw providerInputError("monthly_card_no is required when paying by monthly card or changing the COD amount.");
    }
    if (!cancel && (serviceCode === "1" || serviceCode === "2") && input.new_dest_address === undefined) {
      throw providerInputError("new_dest_address is required for redirect (转寄) and return (退回).");
    }
    const selfPickPoint = optionalString(input.self_pick_point);

    const payload = await requestSfExpress(
      "EXP_RECE_WANTED_INTERCEPT",
      compactObject({
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        serviceCode,
        role: interceptRoleCodes[requiredInputString(input.role, "role")],
        payMode,
        monthlyCardNo,
        productType: optionalString(input.product_type),
        codAmount: optionalNumber(input.cod_amount),
        deliverDate: optionalString(input.deliver_date),
        deliverTimeMin: optionalString(input.deliver_time_min),
        deliverTimeMax: optionalString(input.deliver_time_max),
        selfPickPoint: selfPickPoint === undefined ? undefined : selfPickPointCodes[selfPickPoint],
        newDestAddress: input.new_dest_address === undefined ? undefined : readNewDestAddress(input.new_dest_address),
        cancel: cancel ? true : undefined,
        cusId: commandId,
      }),
      context,
      "execute",
    );
    return normalizeInterceptResult(payload);
  },
  async send_delivery_notice(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "EXP_RECE_DELIVERY_NOTICE",
      compactObject({
        waybillNo,
        dataType: input.data_type === "return" ? "72" : "71",
        language: optionalString(input.language),
      }),
      context,
      "execute",
    );
    return { waybillNo, notified: true };
  },
  async query_waybill_fee(input, context) {
    const payload = await requestSfExpress(
      "EXP_RECE_QUERY_SFWAYBILL",
      compactObject({
        trackingType: input.query_type === "waybill" ? "2" : "1",
        trackingNum: requiredInputString(input.tracking_num, "tracking_num"),
        bizTemplateCode: optionalString(input.biz_template_code),
      }),
      context,
      "execute",
    );
    return normalizeWaybillFee(payload);
  },
};

function readOrderContact(
  value: unknown,
  role: "sender" | "recipient",
  defaultCountry?: string,
): Record<string, unknown> {
  const contact = requiredRecord(value, role, providerInputError);
  const address = requiredInputString(contact.address, `${role}.address`);
  const tel = optionalString(contact.tel);
  const mobile = optionalString(contact.mobile);
  if (tel === undefined && mobile === undefined) {
    throw providerInputError(`${role} requires at least one of tel or mobile.`);
  }
  return compactObject({
    contactType: role === "sender" ? 1 : 2,
    company: optionalString(contact.company),
    contact: requiredInputString(contact.contact, `${role}.contact`),
    tel,
    mobile,
    country: optionalString(contact.country) ?? defaultCountry,
    province: optionalString(contact.province),
    city: optionalString(contact.city),
    county: optionalString(contact.county),
    address,
    postCode: optionalString(contact.post_code),
    email: optionalString(contact.email),
    taxNo: optionalString(contact.tax_no),
    contactRemark: optionalString(contact.contact_remark),
    certType: optionalString(contact.cert_type),
    certNo: optionalString(contact.cert_no),
  });
}

/**
 * The pre-order endpoint documents a smaller contact table than create_order:
 * no contact name, company, or country columns.
 */
function readPreOrderContact(value: unknown, role: "sender" | "recipient"): Record<string, unknown> {
  const contact = requiredRecord(value, role, providerInputError);
  const tel = optionalString(contact.tel);
  const mobile = optionalString(contact.mobile);
  if (tel === undefined && mobile === undefined) {
    throw providerInputError(`${role} requires at least one of tel or mobile.`);
  }
  return compactObject({
    contactType: role === "sender" ? 1 : 2,
    tel,
    mobile,
    province: optionalString(contact.province),
    city: optionalString(contact.city),
    county: optionalString(contact.county),
    address: requiredInputString(contact.address, `${role}.address`),
  });
}

function readCargoDetails(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "cargo_details", providerInputError).map((cargo, index) =>
    compactObject({
      name: requiredInputString(cargo.name, `cargo_details[${index}].name`),
      count: optionalNumber(cargo.count),
      unit: optionalString(cargo.unit),
      weight: optionalNumber(cargo.weight),
      amount: optionalNumber(cargo.amount),
      currency: optionalString(cargo.currency),
      sourceArea: optionalString(cargo.source_area),
      hsCode: optionalString(cargo.hs_code),
      goodsCode: optionalString(cargo.goods_code),
      brand: optionalString(cargo.brand),
      specifications: optionalString(cargo.specifications),
      manufacturer: optionalString(cargo.manufacturer),
      shipmentWeight: optionalNumber(cargo.shipment_weight),
      length: optionalNumber(cargo.length),
      width: optionalNumber(cargo.width),
      height: optionalNumber(cargo.height),
      volume: optionalNumber(cargo.volume),
      cargoDeclaredValue: optionalNumber(cargo.cargo_declared_value),
      declaredValueDeclaredCurrency: optionalString(cargo.declared_value_currency),
    }),
  );
}

function readExtraInfoList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "extra_info_list", providerInputError).map((extra, index) =>
    compactObject({
      attrName: requiredInputString(extra.attr_name, `extra_info_list[${index}].attr_name`),
      attrVal: optionalString(extra.attr_val),
    }),
  );
}

/** Whether the caller brought at least one of their own waybill numbers. */
function hasWaybillNo(list: Array<Record<string, unknown>> | undefined): boolean {
  return list?.some((item) => item.waybillNo !== undefined) ?? false;
}

function readWaybillNoInfoList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "waybill_no_info_list", providerInputError).map((item) =>
    compactObject({
      waybillType: requiredInputNumber(item.waybill_type, "waybill_no_info_list[].waybill_type"),
      waybillNo: optionalString(item.waybill_no),
      boxNo: optionalString(item.box_no),
      length: optionalNumber(item.length),
      width: optionalNumber(item.width),
      height: optionalNumber(item.height),
      weight: optionalNumber(item.weight),
    }),
  );
}

function readCustomsInfo(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const customs = requiredRecord(value, "customs_info", providerInputError);
  return compactObject({
    declaredValue: optionalNumber(customs.declared_value),
    declaredValueCurrency: optionalString(customs.declared_value_currency),
    customsBatchs: optionalString(customs.customs_batchs),
    taxPayMethod: optionalNumber(customs.tax_pay_method),
    taxSettleAccounts: optionalString(customs.tax_settle_accounts),
    paymentTool: optionalString(customs.payment_tool),
    paymentNumber: optionalString(customs.payment_number),
    orderName: optionalString(customs.order_name),
    tax: optionalString(customs.tax),
  });
}

function readDestContactInfo(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const contact = requiredRecord(value, "dest_contact_info", providerInputError);
  return compactObject({
    company: optionalString(contact.company),
    contact: requiredInputString(contact.contact, "dest_contact_info.contact"),
    tel: optionalString(contact.tel),
    mobile: optionalString(contact.mobile),
    country: requiredInputString(contact.country, "dest_contact_info.country"),
    province: requiredInputString(contact.province, "dest_contact_info.province"),
    city: requiredInputString(contact.city, "dest_contact_info.city"),
    county: requiredInputString(contact.county, "dest_contact_info.county"),
    address: requiredInputString(contact.address, "dest_contact_info.address"),
  });
}

function readNewDestAddress(value: unknown): Record<string, unknown> {
  const address = requiredRecord(value, "new_dest_address", providerInputError);
  return compactObject({
    province: requiredInputString(address.province, "new_dest_address.province"),
    city: requiredInputString(address.city, "new_dest_address.city"),
    county: requiredInputString(address.county, "new_dest_address.county"),
    address: requiredInputString(address.address, "new_dest_address.address"),
    contact: optionalString(address.contact),
    phone: optionalString(address.phone),
    country: optionalString(address.country),
    countryCode: optionalString(address.country_code),
    company: optionalString(address.company),
    areaCode: optionalString(address.area_code),
    locationCode: optionalString(address.location_code),
  });
}

function normalizeWaybillNoInfoList(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value ?? [], "waybillNoInfoList", providerResponseError).map((item, index) =>
    compactObject({
      waybillType: optionalNumberLike(item.waybillType),
      waybillNo: requiredString(item.waybillNo, `waybillNoInfoList[${index}].waybillNo`, providerResponseError),
      boxNo: optionalString(item.boxNo),
    }),
  );
}

function normalizeOrderResult(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express order response");
  return compactObject({
    orderId: requiredString(record.orderId, "orderId", providerResponseError),
    originCode: optionalString(record.originCode),
    destCode: optionalString(record.destCode),
    filterResult: optionalNumberLike(record.filterResult) ?? null,
    remark: optionalString(record.remark),
    url: nullableString(record.url) ?? null,
    paymentLink: nullableString(record.paymentLink) ?? null,
    waybillNoInfoList: normalizeWaybillNoInfoList(record.waybillNoInfoList),
    routeLabelInfo: looseArray(record.routeLabelInfo),
    scenePlanCode: optionalString(record.scenePlanCode),
  });
}

function normalizeInterceptResult(payload: unknown): Record<string, unknown> {
  // A successful interception answers with msgData: null; only the fee variants carry a body.
  const record = recordOrEmpty(payload);
  const feeInfo = optionalRecord(record.freightAdditionInfoResp);
  return compactObject({
    cusId: optionalString(record.cusId),
    amount: optionalNumberLike(record.amount) ?? null,
    freightAdditionInfoResp: feeInfo
      ? compactObject({
          interceptionDeptCode: optionalString(feeInfo.interceptionDeptCode),
          transferFlg: optionalString(feeInfo.transferFlg),
        })
      : undefined,
  });
}

function normalizeWaybillFee(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express waybill fee response");
  const info = requiredResponseRecord(record.waybillInfo, "SF Express waybill fee waybillInfo");
  return {
    waybillInfo: compactObject({
      waybillNo: optionalString(info.waybillNo),
      orderId: optionalString(info.orderId),
      waybillChilds: optionalString(info.waybillChilds),
      customerAcctCode: optionalString(info.customerAcctCode),
      meterageWeightQty: optionalNumberLike(info.meterageWeightQty) ?? null,
      realWeightQty: optionalNumberLike(info.realWeightQty) ?? null,
      cargoTypeCode: optionalString(info.cargoTypeCode),
      cargoTypeName: optionalString(info.cargoTypeName),
      limitTypeCode: optionalString(info.limitTypeCode),
      limitName: optionalString(info.limitName),
      expressTypeCode: optionalString(info.expressTypeCode),
      expressTypeName: optionalString(info.expressTypeName),
      productCode: optionalString(info.productCode),
      productName: optionalString(info.productName),
      consValue: optionalNumberLike(info.consValue) ?? null,
      consValueCurrencyCode: optionalString(info.consValueCurrencyCode),
      jProvince: optionalString(info.jProvince),
      jCity: optionalString(info.jCity),
      dProvince: optionalString(info.dProvince),
      dCity: optionalString(info.dCity),
    }),
    waybillFeeList: objectArray(record.waybillFeeList ?? [], "waybillFeeList", providerResponseError).map(
      (fee, index) =>
        compactObject({
          type: requiredString(fee.type, `waybillFeeList[${index}].type`, providerResponseError),
          name: requiredString(fee.name, `waybillFeeList[${index}].name`, providerResponseError),
          value: optionalNumberLike(fee.value) ?? null,
          paymentTypeCode: optionalString(fee.paymentTypeCode),
          settlementTypeCode: optionalString(fee.settlementTypeCode),
          serviceProdCode: optionalString(fee.serviceProdCode),
          insuredValue: optionalString(fee.insuredValue),
          customerAcctCode: optionalString(fee.customerAcctCode),
        }),
    ),
  };
}
