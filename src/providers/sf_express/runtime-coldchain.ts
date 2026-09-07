import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  objectArray,
  optionalNumber,
  optionalNumberLike,
  optionalRecord,
  optionalScalarString,
  optionalString,
  optionalStringArray,
  requiredBoolean,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express cold-chain transport endpoints. */
export const sfExpressColdchainHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async coldchain_check_transport_flow(input, context) {
    const payload = await requestSfExpress(
      "SCS_RECE_CHECK_TRANSPORT_FLOW",
      {
        productCode: requiredInputString(input.product_code, "product_code"),
        senderProvinceName: requiredInputString(input.sender_province_name, "sender_province_name"),
        senderCityName: requiredInputString(input.sender_city_name, "sender_city_name"),
        senderCountyName: requiredInputString(input.sender_county_name, "sender_county_name"),
        senderCityAreaNumber: requiredInputString(input.sender_city_area_number, "sender_city_area_number"),
        senderAddress: requiredInputString(input.sender_address, "sender_address"),
        receiverProvinceName: requiredInputString(input.receiver_province_name, "receiver_province_name"),
        receiverCityName: requiredInputString(input.receiver_city_name, "receiver_city_name"),
        receiverCountyName: requiredInputString(input.receiver_county_name, "receiver_county_name"),
        receiverCityAreaNumber: requiredInputString(input.receiver_city_area_number, "receiver_city_area_number"),
        receiverAddress: requiredInputString(input.receiver_address, "receiver_address"),
      },
      context,
      "execute",
    );
    return normalizeTransportFlow(payload);
  },
  async coldchain_estimate_transport_fee(input, context) {
    const payload = await requestSfExpress(
      "SCS_RECE_CALC_TRANSPORT_FEE",
      compactObject({
        erpOrder: requiredInputString(input.erp_order, "erp_order"),
        productCode: requiredInputString(input.product_code, "product_code"),
        orderTime: requiredInputString(input.order_time, "order_time"),
        shipperProvinceName: requiredInputString(input.shipper_province_name, "shipper_province_name"),
        shipperCityName: requiredInputString(input.shipper_city_name, "shipper_city_name"),
        shipperDistrictName: requiredInputString(input.shipper_district_name, "shipper_district_name"),
        shipperLocationName: requiredInputString(input.shipper_location_name, "shipper_location_name"),
        consigneeProvinceName: requiredInputString(input.consignee_province_name, "consignee_province_name"),
        consigneeCityName: requiredInputString(input.consignee_city_name, "consignee_city_name"),
        consigneeDistrictName: requiredInputString(input.consignee_district_name, "consignee_district_name"),
        consigneeLocationName: requiredInputString(input.consignee_location_name, "consignee_location_name"),
        orderItems: readOrderItems(input.order_items),
        orderServices: readOrderServices(input.order_services),
      }),
      context,
      "execute",
    );
    return normalizeTransportFees(payload);
  },
  async coldchain_estimate_delivery_time(input, context) {
    const payload = await requestSfExpress(
      "SCS_RECE_ESTIMATE_DELIVER_TM",
      {
        consignTime: requiredInputString(input.consign_time, "consign_time"),
        receiverCityAreaNumber: requiredInputString(input.receiver_city_area_number, "receiver_city_area_number"),
        senderCityAreaNumber: requiredInputString(input.sender_city_area_number, "sender_city_area_number"),
        productCode: requiredInputString(input.product_code, "product_code"),
        selfSendFlg: requiredBoolean(input.self_send, "self_send", providerInputError) ? 1 : 0,
        oneselfPickupFlg: requiredBoolean(input.oneself_pickup, "oneself_pickup", providerInputError) ? 1 : 0,
      },
      context,
      "execute",
    );
    return normalizeDeliveryEstimates(payload);
  },
  async coldchain_create_order(input, context) {
    const paymentTypeCode = requiredInputString(input.payment_type_code, "payment_type_code");
    const monthlyAccount = optionalString(input.monthly_account);
    if (paymentTypeCode === "PR_ACCOUNT" && monthlyAccount === undefined) {
      throw providerInputError("monthly_account is required when payment_type_code is PR_ACCOUNT (寄付月结).");
    }
    const payload = await requestSfExpress(
      "SCS_RECE_CREATE_ORDER",
      compactObject({
        erpOrder: requiredInputString(input.erp_order, "erp_order"),
        productCode: requiredInputString(input.product_code, "product_code"),
        paymentTypeCode,
        monthlyAccount,
        orderTime: requiredInputString(input.order_time, "order_time"),
        temperatureLevelCode: requiredInputString(input.temperature_level_code, "temperature_level_code"),
        transportType: "LAND",
        remark: optionalString(input.remark),
        shipperName: optionalString(input.shipper_name),
        shipperContactName: requiredInputString(input.shipper_contact_name, "shipper_contact_name"),
        shipperContactTel: requiredInputString(input.shipper_contact_tel, "shipper_contact_tel"),
        shipperProvinceName: requiredInputString(input.shipper_province_name, "shipper_province_name"),
        shipperCityName: requiredInputString(input.shipper_city_name, "shipper_city_name"),
        shipperDistrictName: requiredInputString(input.shipper_district_name, "shipper_district_name"),
        shipperLocationName: requiredInputString(input.shipper_location_name, "shipper_location_name"),
        requirePickupTimeFm: optionalString(input.require_pickup_time_fm),
        requirePickupTimeTo: optionalString(input.require_pickup_time_to),
        consigneeName: optionalString(input.consignee_name),
        focusCode: optionalString(input.focus_code),
        consigneeContactName: requiredInputString(input.consignee_contact_name, "consignee_contact_name"),
        consigneeContactTel: requiredInputString(input.consignee_contact_tel, "consignee_contact_tel"),
        consigneeProvinceName: requiredInputString(input.consignee_province_name, "consignee_province_name"),
        consigneeCityName: requiredInputString(input.consignee_city_name, "consignee_city_name"),
        consigneeDistrictName: requiredInputString(input.consignee_district_name, "consignee_district_name"),
        consigneeLocationName: requiredInputString(input.consignee_location_name, "consignee_location_name"),
        requireDeliveryTimeFm: optionalString(input.require_delivery_time_fm),
        requireDeliveryTimeTo: optionalString(input.require_delivery_time_to),
        totalWeight: readNumberAsString(input.total_weight),
        totalVolume: readNumberAsString(input.total_volume),
        carType: optionalString(input.car_type),
        freightFee: optionalNumber(input.freight_fee),
        sourceCode: optionalString(input.source_code),
        orderItems: readOrderItems(input.order_items, true),
        orderServices: readOrderServices(input.order_services),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express cold-chain create order response");
    return {
      sfOrderNo: requiredString(record.sfOrderNo, "sfOrderNo", providerResponseError),
      erpOrder: requiredString(record.erpOrder, "erpOrder", providerResponseError),
    };
  },
  async coldchain_cancel_order(input, context) {
    await requestSfExpress(
      "SCS_RECE_CANCEL_ORDER",
      compactObject({
        erpOrder: requiredInputString(input.erp_order, "erp_order"),
        sfOrderNo: optionalString(input.sf_order_no),
        sourceCode: optionalString(input.source_code),
      }),
      context,
      "execute",
    );
    // The upstream returns an empty data payload on success.
    return {};
  },
  async coldchain_query_waybill_no(input, context) {
    const payload = await requestSfExpress(
      "SCS_RECE_QUERY_WAYBILL_NO",
      compactObject({
        erpOrder: requiredInputString(input.erp_order, "erp_order"),
        sfOrderNo: optionalString(input.sf_order_no),
        sourceCode: optionalString(input.source_code),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express cold-chain waybill response");
    return {
      erpOrder: optionalString(record.erpOrder),
      sfOrderNo: optionalString(record.sfOrderNo),
      waybillNo: optionalString(record.waybillNo),
      receiptWaybillNo: optionalString(record.receiptWaybillNo),
      childWaybillNos: optionalStringArray(record.childWaybillNos) ?? [],
    };
  },
  async coldchain_query_route(input, context) {
    const waybillNo = optionalString(input.waybill_no);
    const sfOrderNo = optionalString(input.sf_order_no);
    const erpOrder = optionalString(input.erp_order);
    if (waybillNo === undefined && sfOrderNo === undefined && erpOrder === undefined) {
      throw providerInputError("one of waybill_no, sf_order_no, or erp_order is required.");
    }
    const payload = await requestSfExpress(
      "SCS_RECE_QUERY_ROUTE",
      compactObject({
        waybillNo,
        sfOrderNo,
        erpOrder,
        sourceCode: requiredInputString(input.source_code, "source_code"),
      }),
      context,
      "execute",
    );
    return {
      routes: objectArray(payload, "data", providerResponseError).map((route, index) => ({
        routeId: optionalString(route.routeId),
        barScanTm: requiredString(route.barScanTm, `data[${index}].barScanTm`, providerResponseError),
        outsideName: requiredString(route.outsideName, `data[${index}].outsideName`, providerResponseError),
        distName: requiredString(route.distName, `data[${index}].distName`, providerResponseError),
        opCode: requiredString(route.opCode, `data[${index}].opCode`, providerResponseError),
        owsRemark: optionalString(route.owsRemark),
        waybillNo: requiredString(route.waybillNo, `data[${index}].waybillNo`, providerResponseError),
        sfOrderNo: requiredString(route.sfOrderNo, `data[${index}].sfOrderNo`, providerResponseError),
        erpOrder: requiredString(route.erpOrder, `data[${index}].erpOrder`, providerResponseError),
      })),
    };
  },
  async coldchain_query_order_info(input, context) {
    const payload = await requestSfExpress(
      "SCS_RECE_QUERY_ORDER_INFO",
      compactObject({
        erpOrder: requiredInputString(input.erp_order, "erp_order"),
        sourceCode: optionalString(input.source_code),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express cold-chain order info response");
    return {
      order: requiredResponseRecord(record.order, "order"),
      childWaybillList: objectArray(record.childWaybillList ?? [], "childWaybillList", providerResponseError),
      orderGoodsList: objectArray(record.orderGoodsList ?? [], "orderGoodsList", providerResponseError),
      orderServiceList: objectArray(record.orderServiceList ?? [], "orderServiceList", providerResponseError),
      orderReturn: optionalRecord(record.orderReturn) ?? null,
    };
  },
};

function readNumberAsString(value: unknown): string | undefined {
  const parsed = optionalNumberLike(value);
  return parsed === undefined ? undefined : String(parsed);
}

function readOrderItems(value: unknown, forOrder = false): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    if (forOrder) {
      throw providerInputError("order_items is required.");
    }
    return undefined;
  }
  return objectArray(value, "order_items", providerInputError).map((item, index) => {
    const label = `order_items[${index}]`;
    const quantity = optionalNumberLike(item.quantity);
    const grossWeight = optionalNumberLike(item.gross_weight);
    const volume = optionalNumberLike(item.volume);
    if (grossWeight === undefined || volume === undefined || (forOrder && quantity === undefined)) {
      throw providerInputError(
        forOrder
          ? `${label} requires quantity, gross_weight, and volume.`
          : `${label} requires gross_weight and volume.`,
      );
    }
    return compactObject({
      skuCode: forOrder ? requiredInputString(item.sku_code, `${label}.sku_code`) : optionalString(item.sku_code),
      skuName: forOrder ? requiredInputString(item.sku_name, `${label}.sku_name`) : optionalString(item.sku_name),
      quantity,
      grossWeight,
      volume,
      length: optionalNumberLike(item.length),
      width: optionalNumberLike(item.width),
      height: optionalNumberLike(item.height),
      netHeight: optionalNumberLike(item.net_height),
      importedFlag: optionalNumberLike(item.imported_flag),
      carrierName: optionalString(item.carrier_name),
      sku: optionalString(item.sku),
      skuUnit: optionalString(item.sku_unit),
      price: optionalNumberLike(item.price),
    });
  });
}

function readOrderServices(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "order_services", providerInputError).map((item, index) =>
    compactObject({
      serviceCode: requiredInputString(item.service_code, `order_services[${index}].service_code`),
      serviceValue: optionalString(item.service_value),
      userDef1: optionalString(item.user_def1),
      userDef2: optionalString(item.user_def2),
      userDef3: optionalString(item.user_def3),
      userDef4: optionalString(item.user_def4),
      userDef5: optionalString(item.user_def5),
      userDef6: optionalString(item.user_def6),
      userDef7: optionalString(item.user_def7),
      userDef8: optionalString(item.user_def8),
    }),
  );
}

function normalizeFlowSideInfo(value: unknown, fieldName: string): Record<string, unknown> {
  const info = requiredResponseRecord(value, fieldName);
  const netpoint = requiredResponseRecord(info.netpoint, `${fieldName}.netpoint`);
  return {
    serviceType: optionalScalarString(info.serviceType),
    netpoint: {
      mdneUnitName: optionalScalarString(netpoint.mdneUnitName),
      mdneDetailedAddress: optionalScalarString(netpoint.mdneDetailedAddress),
      mdneContactPhone: optionalScalarString(netpoint.mdneContactPhone),
      mdneOuterBusinessStarttime: optionalScalarString(netpoint.mdneOuterBusinessStarttime),
      mdneOuterBusinessEndtime: optionalScalarString(netpoint.mdneOuterBusinessEndtime),
    },
  };
}

function normalizeTransportFlow(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express transport flow response");
  return {
    senderInfo: normalizeFlowSideInfo(record.senderInfo, "senderInfo"),
    receiverInfo: normalizeFlowSideInfo(record.receiverInfo, "receiverInfo"),
    temperatureLevel: objectArray(record.temperatureLevel ?? [], "temperatureLevel", providerResponseError).map(
      (level) => ({
        ebcdCode: optionalScalarString(level.ebcdCode),
        ebcdNameCn: optionalScalarString(level.ebcdNameCn),
        ebcdTemperatureType: optionalScalarString(level.ebcdTemperatureType),
        ebcdSquenceNo: optionalScalarString(level.ebcdSquenceNo),
        ebcdProductCode: optionalScalarString(level.ebcdProductCode),
      }),
    ),
  };
}

function normalizeTransportFees(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express transport fee response");
  const results: Record<string, unknown> = {};
  for (const [productCode, entry] of Object.entries(record)) {
    const result = requiredResponseRecord(entry, `transport fee for ${productCode}`);
    results[productCode] = {
      code: optionalString(result.code),
      message: optionalString(result.message),
      fees: objectArray(result.model ?? [], `${productCode}.model`, providerResponseError).map((fee) => ({
        feeName: optionalString(fee.feeName),
        serviceCode: optionalString(fee.serviceCode),
        totalAmount: optionalNumberLike(fee.totalAmount) ?? null,
      })),
    };
  }
  return { results };
}

function normalizeDeliveryEstimates(payload: unknown): Record<string, unknown> {
  return {
    results: objectArray(payload, "data", providerResponseError).map((item, index) => {
      const effectiveInfo = optionalRecord(item.effectiveInfo);
      return {
        productCode: requiredString(item.productCode, `data[${index}].productCode`, providerResponseError),
        code: optionalString(item.code),
        message: optionalString(item.message),
        effectiveInfo: effectiveInfo
          ? {
              arriveTime: optionalString(effectiveInfo.arriveTime),
              delayRemark: optionalString(effectiveInfo.delayRemark),
              planDescription: optionalString(effectiveInfo.planDescription),
              delayDay: optionalString(effectiveInfo.delayDay),
              effectiveDay: optionalString(effectiveInfo.effectiveDay),
            }
          : undefined,
      };
    }),
  };
}
