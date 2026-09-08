import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
  recordOrEmpty,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputNumber,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express Freight forwarding and cross-border bulky endpoints. */
export const sfExpressFreightForwardCrossborderHandlers: ProviderActionHandlerSubset<
  "sf_express",
  SfExpressActionHandler
> = {
  async freight_forward_upload_sign_image(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_UPLOAD_SIGN_IMAGE",
      compactObject({
        waybillNo,
        scanTime: requiredInputString(input.scan_time, "scan_time"),
        picUrls: requiredStringArray(input.pic_urls, "pic_urls", providerInputError),
        scanStation: optionalString(input.scan_station),
        scanOperator: optionalString(input.scan_operator),
        scanAreaCode: optionalString(input.scan_area_code),
        signBackPics: optionalStringArray(input.sign_back_pics),
        deliverGoodsPics: optionalStringArray(input.deliver_goods_pics),
        remark: optionalString(input.remark),
        autoAudit: optionalBoolean(input.auto_audit),
        ocrAutoAudit: optionalBoolean(input.ocr_auto_audit),
        delayRemark: optionalString(input.delay_remark),
        latitude: optionalNumber(input.latitude),
        longitude: optionalNumber(input.longitude),
        original: optionalInteger(input.original),
        city: optionalString(input.city),
        sispRouter: optionalString(input.sisp_router),
        sispRouterExtend: optionalRecord(input.sisp_router_extend),
      }),
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_upload_driver(input, context) {
    const forwardOrderId = integer(input.forward_order_id, "forward_order_id", providerInputError);
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_UPLOAD_VEHICLE",
      compactObject({
        forwardOrderId,
        waybillNo,
        driver: requiredInputString(input.driver, "driver"),
        driverMobile: requiredInputString(input.driver_mobile, "driver_mobile"),
        licensePlateNumber: requiredInputString(input.license_plate_number, "license_plate_number"),
        carrierCompany: optionalString(input.carrier_company),
        carrierPhone: optionalString(input.carrier_phone),
      }),
      context,
      "execute",
    );
    return { accepted: true, forwardOrderId, waybillNo };
  },
  async freight_forward_upload_track_batch(input, context) {
    const tracks = objectArray(input.tracks, "tracks", providerInputError).map((track, index) =>
      readTrackPoint(track, `tracks[${index}]`),
    );
    if (tracks.length === 0) {
      throw providerInputError("tracks must contain at least one track point.");
    }
    // The batch endpoint only accepts track points that all belong to one waybill number.
    if (new Set(tracks.map((track) => track.waybillNo)).size > 1) {
      throw providerInputError("tracks must all carry the same waybillNo; upload one batch per waybill number.");
    }
    await requestSfExpress("FOP_RECE_FORWARD_UPLOAD_TRACK_BATCH", tracks, context, "execute");
    return { accepted: true, count: tracks.length };
  },
  async freight_forward_upload_waybill_remark(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_UPLOAD_WAYBILL_REMARK",
      {
        waybillNo,
        operator: requiredInputString(input.operator, "operator"),
        remark: requiredInputString(input.remark, "remark"),
      },
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_upload_receipt(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_UPLOAD_RECEIPT",
      {
        waybillNo,
        returnWaybillNo: requiredInputString(input.return_waybill_no, "return_waybill_no"),
        company: requiredInputString(input.company, "company"),
      },
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_update_order_status(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    const status = integer(input.status, "status", providerInputError);
    const isCheck = optionalInteger(input.is_check);
    const abnormal = optionalString(input.abnormal);
    if (status === 45 && isCheck === undefined) {
      throw providerInputError("is_check is required when status is 45 (提货交接).");
    }
    if (isCheck === 1 && abnormal === undefined) {
      throw providerInputError("abnormal is required when is_check is 1 (运单信息有误).");
    }
    await requestSfExpress(
      "FOP_RECE_FORWARD_UPDATE_ORDER_STATUS",
      compactObject({
        forwardOrderId: integer(input.forward_order_id, "forward_order_id", providerInputError),
        waybillNo,
        status,
        remark: optionalString(input.remark),
        operateTime: optionalString(input.operate_time),
        operator: optionalString(input.operator),
        contact: optionalString(input.contact),
        contactPhone: optionalString(input.contact_phone),
        picUrls: optionalStringArray(input.pic_urls),
        number: optionalInteger(input.number),
        boxNo: optionalStringArray(input.box_nos),
        isCheck,
        abnormal,
        volumn: optionalNumber(input.volume),
        weight: optionalNumber(input.weight),
        latitude: optionalNumber(input.latitude),
        longitude: optionalNumber(input.longitude),
        city: optionalString(input.city),
        importantEventRemark: optionalString(input.important_event_remark),
        sispRouter: optionalString(input.sisp_router),
        sispRouterExtend: optionalString(input.sisp_router_extend),
      }),
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_upload_route(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_UPLOAD_ROUTER",
      compactObject({
        waybillNo,
        subWaybillNo: optionalString(input.sub_waybill_no),
        status: integer(input.status, "status", providerInputError),
        routerInfos: readRouterInfos(input.router_infos),
      }),
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_upload_track(input, context) {
    const track = compactObject({
      waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
      timestamp: integer(input.timestamp, "timestamp", providerInputError),
      licensePlateNumber: optionalString(input.license_plate_number),
      driver: optionalString(input.driver),
      driverPhone: optionalString(input.driver_phone),
      province: optionalString(input.province),
      city: optionalString(input.city),
      county: optionalString(input.county),
      address: optionalString(input.address),
      latitude: optionalNumber(input.latitude),
      longitude: optionalNumber(input.longitude),
      elevation: optionalNumber(input.elevation),
      latLongType: optionalInteger(input.lat_long_type),
      source: requiredInputString(input.source, "source"),
      remark: optionalString(input.remark),
      traceType: integer(input.trace_type, "trace_type", providerInputError),
      sispRouter: optionalString(input.sisp_router),
      sispRouterExtend: optionalRecord(input.sisp_router_extend),
    });
    await requestSfExpress("FOP_RECE_FORWARD_UPLOAD_TRACK", track, context, "execute");
    return { accepted: true, waybillNo: track.waybillNo };
  },
  async freight_forward_apply_add_fee(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_ADD_FEE_APPLY",
      compactObject({
        waybillNo,
        notSettableType: integer(input.fee_type, "fee_type", providerInputError),
        reportImage: requiredInputString(input.report_image, "report_image"),
        amount: requiredInputNumber(input.amount, "amount"),
        reportRemark: optionalString(input.report_remark),
      }),
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_place_return_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FORWARD_PLACE_ORDER",
      {
        waybillNos: requiredStringArray(input.waybill_nos, "waybill_nos", providerInputError),
        sendContact: requiredInputString(input.send_contact, "send_contact"),
        sendMobile: requiredInputString(input.send_mobile, "send_mobile"),
        sendProvince: requiredInputString(input.send_province, "send_province"),
        sendCity: requiredInputString(input.send_city, "send_city"),
        sendCounty: requiredInputString(input.send_county, "send_county"),
        sendAddress: requiredInputString(input.send_address, "send_address"),
      },
      context,
      "execute",
    );
    return { result: recordOrEmpty(payload) };
  },
  async freight_forward_report_exception(input, context) {
    const abnormalCode = requiredInputString(input.abnormal_code, "abnormal_code");
    if (["SIGN_03", "SIGN_05", "SIGN_15", "TRANSITING_15"].includes(abnormalCode) && input.delay_days === undefined) {
      throw providerInputError(`delay_days is required when abnormal_code is ${abnormalCode}.`);
    }
    const weight = optionalString(input.weight);
    const subItems = readSubItems(input.sub_items);
    const supplierCode = optionalString(input.supplier_code);
    if (
      ["HANDOVER_06", "TRANSITING_17"].includes(abnormalCode) &&
      (weight === undefined || !subItems?.length || supplierCode === undefined)
    ) {
      throw providerInputError(
        `weight, sub_items and supplier_code are required for the reweigh appeal code ${abnormalCode}.`,
      );
    }
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_APPLY_ORDER_AB",
      compactObject({
        waybillNo,
        abnormalType: integer(input.abnormal_type, "abnormal_type", providerInputError),
        abnormalCode,
        supplierCode,
        uploadTime: optionalString(input.upload_time),
        uploadOperator: optionalString(input.upload_operator),
        remark: optionalString(input.remark),
        weight,
        volume: optionalString(input.volume),
        delayDays: optionalInteger(input.delay_days),
        picUrl: optionalString(input.pic_url),
        subVolume: subItems,
      }),
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_start_pay(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_FORWARD_START_PAY",
      {
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        supplierCode: requiredInputString(input.supplier_code, "supplier_code"),
      },
      context,
      "execute",
      { clientCode: requiredInputString(input.client_code, "client_code") },
    );
    return { result: payload ?? null };
  },
  async freight_forward_apply_monthly_payment(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_MON_PAY",
      compactObject({
        waybillNo,
        supplierCode: requiredInputString(input.supplier_code, "supplier_code"),
        operator: requiredInputString(input.operator, "operator"),
        monCode: optionalString(input.mon_code),
        monCodeId: optionalString(input.mon_code_id),
      }),
      context,
      "execute",
      { clientCode: requiredInputString(input.client_code, "client_code") },
    );
    return { accepted: true, waybillNo };
  },
  async freight_forward_upload_return_route(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_FORWARD_UPLOAD_RETURN_ROUTER",
      {
        waybillNo,
        routerInfos: readRouterInfos(input.router_infos),
      },
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_crossborder_report_trace(input, context) {
    const referenceNo = requiredInputString(input.reference_no, "reference_no");
    await requestSfExpress(
      "FOP_RECE_I18N_TRACE_REPORT",
      {
        referenceNo,
        clientCode: requiredInputString(input.client_code, "client_code"),
        routes: readTraceRoutes(input.routes),
        baseRoutes: readBaseRoutes(input.base_routes),
      },
      context,
      "execute",
    );
    return { accepted: true, referenceNo };
  },
  async freight_crossborder_place_order(input, context) {
    const settlementType = requiredInputString(input.settlement_type, "settlement_type");
    const monthlyCard = optionalString(input.monthly_card);
    if (settlementType === "2" && monthlyCard === undefined) {
      throw providerInputError("monthly_card is required when settlement_type is 2 (寄付月结).");
    }
    const receiverType = requiredInputString(input.receiver_type, "receiver_type");
    if (receiverType === "1" && optionalString(input.warehouse_code) === undefined) {
      throw providerInputError("warehouse_code is required when receiver_type is 1 (FBA仓库).");
    }
    const receiverAddress = readCrossborderContact(input.recipient, "recipient");
    if (receiverType === "2") {
      // A 非FBA地址 destination is a street address, so SF requires the full delivery block.
      for (const [field, key] of [
        ["address", "address"],
        ["contact", "contact"],
        ["mobile", "mobile"],
        ["post_code", "postCode"],
      ] as const) {
        if (receiverAddress[key] === undefined) {
          throw providerInputError(`recipient.${field} is required when receiver_type is 2 (非FBA地址).`);
        }
      }
    }
    const payload = await requestSfExpress(
      "FOP_RECE_IFOS_PLACE_ORDER",
      compactObject({
        customerReferenceNo: requiredInputString(input.customer_reference_no, "customer_reference_no"),
        username: requiredInputString(input.username, "username"),
        settlementTypeCode: settlementType,
        customerAccount: monthlyCard,
        receiverType,
        warehouseCode: optionalString(input.warehouse_code),
        receiverAddressDTO: receiverAddress,
        senderAddressDTO: readCrossborderContact(input.sender, "sender"),
        cargo: compactObject({
          cargoType: requiredInputString(input.cargo_type, "cargo_type"),
          cargoName: optionalString(input.cargo_name),
        }),
        totalDeclaredValue: requiredInputNumber(input.total_declared_value, "total_declared_value"),
        declaredValueCode: requiredInputString(input.declared_value_code, "declared_value_code"),
        productType: requiredInputString(input.product_type, "product_type"),
        customsType: requiredInputString(input.customs_type, "customs_type"),
        declaredValue: requiredInputString(input.declared_value, "declared_value"),
        pickupMode: integer(input.pickup_mode, "pickup_mode", providerInputError),
        packages: readCrossborderPackages(input.packages),
        billFbaList: readBillFbaList(input.bill_fba_list),
        vatRegisterNo: optionalString(input.vat_register_no),
        vatRegisterCompany: optionalString(input.vat_register_company),
        vatRegisterCompanyAddr: optionalString(input.vat_register_company_addr),
        EORI: optionalString(input.eori),
        taxContainType: optionalString(input.tax_contain_type),
        collectionTm: optionalString(input.collection_time),
        collectionRemark: optionalString(input.collection_remark),
        domesticCourierNumber: optionalString(input.domestic_courier_number),
        domesticCourierCode: optionalString(input.domestic_courier_code),
        remark: optionalString(input.remark),
        exclusiveEmpNo: optionalString(input.exclusive_emp_no),
        terminalCarrierCode: optionalString(input.terminal_carrier_code),
        departCode: optionalString(input.depart_code),
        shippingCode: optionalString(input.shipping_code),
        userAppKey: optionalString(input.user_app_key),
        sendTm: optionalString(input.send_time),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express cross-border order response");
    const subWaybillNos = optionalString(record.subWaybillNo)?.split(",").filter(Boolean);
    return compactObject({
      waybillNo: requiredString(record.waybillNo, "waybillNo", providerResponseError),
      subWaybillNos,
      warningMsg: optionalString(record.warningMsg) ?? null,
      compensationMsg: optionalString(record.compensationMsg),
    });
  },
  async freight_crossborder_query_postcode_address(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_IFOS_POST_CODE_FETCH_ADDRESS",
      {
        cityZipCode: requiredInputString(input.city_zip_code, "city_zip_code"),
        countryCode: requiredInputString(input.country_code, "country_code"),
      },
      context,
      "execute",
    );
    return {
      addresses: objectArray(payload, "addresses", providerResponseError).map((entry) => ({
        cityZipCode: optionalString(entry.cityZipCode),
        countryCode: optionalString(entry.countryCode),
        disable: optionalBoolean(entry.disable),
        distEnName: optionalString(entry.distEnName),
        isIsolated: optionalBoolean(entry.isIsolated),
        provinceName: optionalString(entry.provinceName),
      })),
    };
  },
  async freight_crossborder_get_print_batch(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_IFOS_ORDER_PRINT_INFO",
      { waybillNo: requiredInputString(input.waybill_no, "waybill_no"), sysCode: "FOP-IFOS-CORE" },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express print batch response");
    return { printBatchNo: requiredString(record.printBatchNo, "printBatchNo", providerResponseError) };
  },
  async freight_crossborder_query_print_result(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_IFOS_ORDER_PRINT_QUERY_RESULT",
      { printBatchNo: requiredInputString(input.print_batch_no, "print_batch_no"), sysCode: "FOP-IFOS-CORE" },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express print result response");
    return {
      files: objectArray(record.files ?? [], "files", providerResponseError).map((file) => ({
        seqNo: optionalInteger(file.seqNo),
        token: optionalString(file.token) ?? null,
        url: optionalString(file.url) ?? null,
        waybillNo: optionalString(file.waybillNo) ?? null,
      })),
      status: optionalString(record.status),
      errorReason: optionalString(record.errorReason) ?? null,
    };
  },
  async freight_crossborder_confirm_delivery_window(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_I18N_CONFIRM_DW_OPTION",
      {
        fbaShipmentId: requiredInputString(input.fba_shipment_id, "fba_shipment_id"),
        deliveryWindowOptionId: requiredInputString(input.delivery_window_option_id, "delivery_window_option_id"),
        referenceId: requiredInputString(input.reference_id, "reference_id"),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express delivery window confirmation response");
    return {
      sellerAllowCarrierUpdateDw: record.sellerAllowCarrierUpdateDW === true,
      successful: record.successful === true,
      errorCode: optionalString(record.errorCode) ?? null,
      errorMessage: optionalString(record.errorMessage) ?? null,
    };
  },
  async freight_crossborder_query_delivery_window_options(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_I18N_DW_OPTION_INFO",
      { fbaShipmentId: requiredInputString(input.fba_shipment_id, "fba_shipment_id") },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express delivery window options response");
    return {
      deliveryWindowOptions: objectArray(
        record.deliveryWindowOptions ?? [],
        "deliveryWindowOptions",
        providerResponseError,
      ).map((option) => ({
        startDate: optionalString(option.startDate),
        endDate: optionalString(option.endDate),
        deliveryWindowOptionId: optionalString(option.deliveryWindowOptionId),
        availabilityStatus: optionalString(option.availabilityStatus),
        availabilityStatusValidUntilTime: optionalString(option.availabilityStatusValidUntilTime),
        gracePeriodEndDate: optionalString(option.gracePeriodEndDate),
      })),
      referenceId: optionalString(record.referenceId),
      fbaNo: optionalString(record.fbaNo),
      sellerAllowCarrierUpdateDw: optionalInteger(record.sellerAllowCarrierUpdateDw),
    };
  },
  async freight_crossborder_get_delivery_window(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_I18N_DW_CHOICE_INFO",
      { fbaShipmentId: requiredInputString(input.fba_shipment_id, "fba_shipment_id") },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express current delivery window response");
    return {
      startDate: optionalString(record.startDate),
      endDate: optionalString(record.endDate),
      fbaNo: optionalString(record.fbaNo),
      sellerAllowCarrierUpdateDw: optionalInteger(record.sellerAllowCarrierUpdateDw),
      gracePeriodEndDate: optionalString(record.gracePeriodEndDate),
    };
  },
  async freight_crossborder_get_pod_info(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_GET_POD_INFO",
      { waybillNo: requiredInputString(input.waybill_no, "waybill_no"), clientCode: "API_ON_SHELVES" },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express POD info response");
    return {
      waybillNo: optionalString(record.waybillNo),
      signed: record.signed === true,
      hasPod: record.hasPod === true,
      statusCode: optionalInteger(record.statusCode),
      statusDescription: optionalString(record.statusDescription),
      podUrls: optionalStringArray(record.podUrls) ?? [],
      message: optionalString(record.message),
    };
  },
  async freight_crossborder_upload_pod_files(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      "FOP_RECE_UPLOAD_POD_FILES",
      {
        waybillNo,
        filePaths: requiredStringArray(input.file_paths, "file_paths", providerInputError),
        clientCode: "API_ON_SHELVES",
      },
      context,
      "execute",
    );
    return { accepted: true, waybillNo };
  },
  async freight_crossborder_cancel_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_IFOS_CANCEL_ORDER",
      compactObject({
        waybillNos: requiredStringArray(input.waybill_nos, "waybill_nos", providerInputError),
        userName: requiredInputString(input.user_name, "user_name"),
        remark: optionalString(input.remark),
      }),
      context,
      "execute",
    );
    return {
      results: objectArray(payload, "results", providerResponseError).map((result) => ({
        waybillNo: optionalString(result.waybillNo),
        status: optionalString(result.status),
        subWaybillNo: optionalString(result.subWaybillNo),
        msg: optionalString(result.msg),
      })),
    };
  },
};

function readTrackPoint(track: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  return compactObject({
    waybillNo: requiredInputString(track.waybillNo, `${fieldName}.waybillNo`),
    timestamp: integer(track.timestamp, `${fieldName}.timestamp`, providerInputError),
    licensePlateNumber: optionalString(track.licensePlateNumber),
    driver: optionalString(track.driver),
    driverPhone: optionalString(track.driverPhone),
    province: optionalString(track.province),
    city: optionalString(track.city),
    county: optionalString(track.county),
    address: optionalString(track.address),
    latitude: optionalNumber(track.latitude),
    longitude: optionalNumber(track.longitude),
    elevation: optionalNumber(track.elevation),
    latLongType: optionalInteger(track.latLongType),
    source: requiredInputString(track.source, `${fieldName}.source`),
    remark: optionalString(track.remark),
    traceType: integer(track.traceType, `${fieldName}.traceType`, providerInputError),
    sispRouter: optionalString(track.sispRouter),
    sispRouterExtend: optionalRecord(track.sispRouterExtend),
  });
}

function readRouterInfos(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "router_infos", providerInputError).map((route, index) =>
    compactObject({
      uniqueId: requiredInputString(route.uniqueId, `router_infos[${index}].uniqueId`),
      status: integer(route.status, `router_infos[${index}].status`, providerInputError),
      operator: requiredInputString(route.operator, `router_infos[${index}].operator`),
      operateTime: requiredInputString(route.operateTime, `router_infos[${index}].operateTime`),
      context: requiredInputString(route.context, `router_infos[${index}].context`),
      cityName: requiredInputString(route.cityName, `router_infos[${index}].cityName`),
      provinceName: requiredInputString(route.provinceName, `router_infos[${index}].provinceName`),
      countyName: optionalString(route.countyName),
    }),
  );
}

function readSubItems(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "sub_items", providerInputError).map((item) =>
    compactObject({
      length: optionalString(item.length),
      width: optionalString(item.width),
      height: optionalString(item.height),
      quantity: optionalInteger(item.quantity),
    }),
  );
}

function readTraceRoutes(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "routes", providerInputError).map((route, index) =>
    compactObject({
      opTime: integer(route.opTime, `routes[${index}].opTime`, providerInputError),
      opDesc: requiredInputString(route.opDesc, `routes[${index}].opDesc`),
      mileStone: optionalString(route.mileStone),
    }),
  );
}

function readBaseRoutes(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "base_routes", providerInputError).map((route) =>
    compactObject({
      serviceType: optionalString(route.serviceType),
      transferNo: optionalString(route.transferNo),
      shipNo: optionalString(route.shipNo),
      flightNo: optionalString(route.flightNo),
      etd: optionalString(route.etd),
      eta: optionalString(route.eta),
      isaId: optionalString(route.isaId),
      carrierCode: optionalString(route.carrierCode),
      departPort: optionalString(route.departPort),
      arrivePort: optionalString(route.arrivePort),
    }),
  );
}

function readCrossborderContact(value: unknown, fieldName: string): Record<string, unknown> {
  const contact = requiredRecord(value, fieldName, providerInputError);
  return compactObject({
    country: optionalString(contact.country),
    countryCode: optionalString(contact.country_code),
    address: optionalString(contact.address),
    city: optionalString(contact.city),
    company: optionalString(contact.company),
    contact: optionalString(contact.contact),
    mobile: optionalString(contact.mobile),
    postCode: optionalString(contact.post_code),
    province: optionalString(contact.province),
    provinceCode: optionalString(contact.province_code),
    cityCode: optionalString(contact.city_code),
    county: optionalString(contact.county),
    countyCode: optionalString(contact.county_code),
  });
}

function readCrossborderPackages(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "packages", providerInputError).map((pkg, index) =>
    compactObject({
      boxNo: requiredInputString(pkg.box_no, `packages[${index}].box_no`),
      packageHigh: requiredInputNumber(pkg.package_high, `packages[${index}].package_high`),
      packageLong: requiredInputNumber(pkg.package_long, `packages[${index}].package_long`),
      packageWeight: requiredInputNumber(pkg.package_weight, `packages[${index}].package_weight`),
      netWeight: requiredInputNumber(pkg.net_weight, `packages[${index}].net_weight`),
      packageWidth: requiredInputNumber(pkg.package_width, `packages[${index}].package_width`),
      SKU: optionalString(pkg.sku),
      englishName: optionalString(pkg.english_name),
      chineseName: optionalString(pkg.chinese_name),
      brand: optionalString(pkg.brand),
      model: optionalString(pkg.model),
      chineseMaterial: optionalString(pkg.chinese_material),
      englishMaterial: optionalString(pkg.english_material),
      purpose: optionalString(pkg.purpose),
      packing: optionalString(pkg.packing),
      customsCode: optionalString(pkg.customs_code),
      numberOfBoxes: optionalString(pkg.number_of_boxes),
      declaredValue: optionalString(pkg.declared_value),
      declaredTotalValue: optionalString(pkg.declared_total_value),
      salesLink: optionalString(pkg.sales_link),
      pic: optionalString(pkg.pic),
    }),
  );
}

function readBillFbaList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "bill_fba_list", providerInputError).map((entry) =>
    compactObject({
      fbaNo: optionalString(entry.fba_no),
      trackingNo: optionalString(entry.tracking_no),
    }),
  );
}
