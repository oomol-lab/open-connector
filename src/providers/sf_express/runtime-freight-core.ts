import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalIntegerLike,
  optionalNumber,
  optionalNumberLike,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { optionalFlagNumber, requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express Freight LTL ordering, business query, and work order endpoints. */
export const sfExpressFreightCoreHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async freight_create_ltl_order(input, context) {
    const waybillNo = optionalString(input.waybill_no);
    const additionServices = readAdditionServices(input.addition_services);
    const cargoTotalWeight = optionalNumber(input.cargo_total_weight);
    if (additionServices?.some((service) => service.name === "HIN") && cargoTotalWeight === undefined) {
      throw providerInputError(
        "cargo_total_weight is required when addition_services includes the HIN (安装服务) service.",
      );
    }
    // 包装服务 (PKFEE) and 安装服务 (HIN) carry their materiel / service-item detail JSON in value5.
    const serviceMissingValue5 = additionServices?.find(
      (service) => (service.name === "PKFEE" || service.name === "HIN") && service.value5 === undefined,
    );
    if (serviceMissingValue5 !== undefined) {
      throw providerInputError(
        `addition_services value5 is required for the ${String(serviceMissingValue5.name)} service and must be a JSON string, for example {"materielDetailList":[{"wlCode":"BZFA00000020","num":"2"}]} for PKFEE.`,
      );
    }
    const payload = await requestSfExpress(
      "FOP_RECE_LTL_CREATE_ORDER",
      compactObject({
        orderId: requiredInputString(input.order_id, "order_id"),
        // A provided reserved waybill means SF must not generate one.
        isGenBillNo: waybillNo === undefined ? 1 : 0,
        waybillNo,
        subWaybills: optionalStringArray(input.sub_waybills)?.join(",") || undefined,
        ...readFreightContact(input.sender, "sender", "send"),
        ...readFreightContact(input.recipient, "recipient", "delivery"),
        customId: optionalString(input.monthly_card),
        pickUpMode: optionalInteger(input.pickup_mode),
        isDoCall: input.is_do_call === false ? "0" : "1",
        expectedPickUpTime: optionalString(input.expected_pickup_time),
        payMethod: integer(input.pay_method, "pay_method", providerInputError),
        parcelQuantity: optionalInteger(input.parcel_qty),
        cargoLength: optionalNumber(input.cargo_length),
        cargoWidth: optionalNumber(input.cargo_width),
        cargoHeight: optionalNumber(input.cargo_height),
        volume: optionalNumber(input.volume),
        cargoTotalWeight,
        needReturnTrackingNo: optionalFlagNumber(input.need_return_tracking_no),
        specialDeliveryTypeCode: optionalString(input.special_delivery_type_code),
        specialDeliveryValue: optionalString(input.special_delivery_value),
        deliveryMode: optionalInteger(input.delivery_mode),
        hasElevator: optionalFlagNumber(input.has_elevator),
        deliveryResType: optionalInteger(input.delivery_res_type),
        cargoType: optionalString(input.cargo_type),
        cargoName: optionalString(input.cargo_name),
        declaredValue: optionalNumber(input.declared_value),
        currencyCode: optionalString(input.currency_code),
        productCode: optionalString(input.product_code),
        originalNumber: optionalString(input.original_number),
        orderSource: optionalString(input.order_source),
        remark: optionalString(input.remark),
        cargoList: readCargoList(input.cargo_list),
        packageList: readPackageList(input.package_list),
        additionServices,
        thirdSignBackInfo: readThirdSignBack(input.third_sign_back),
      }),
      context,
      "execute",
    );
    return normalizeLtlOrderResult(payload);
  },
  async freight_cancel_ltl_order(input, context) {
    const orderId = requiredInputString(input.order_id, "order_id");
    await requestSfExpress(
      "FOP_RECE_LTL_CANCEL_ORDER",
      compactObject({
        orderId,
        cancelType: input.reuse_order_id === true ? "1" : undefined,
      }),
      context,
      "execute",
    );
    return { orderId };
  },
  async freight_get_ltl_order_result(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_LTL_GET_ORDER_RESULT",
      { orderId: requiredInputString(input.order_id, "order_id") },
      context,
      "execute",
    );
    return normalizeLtlOrderResult(payload);
  },
  async freight_append_ltl_sub_waybill(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_LTL_APPEND_SUB_WAYBILL",
      {
        orderId: requiredInputString(input.order_id, "order_id"),
        count: integer(input.count, "count", providerInputError),
      },
      context,
      "execute",
    );
    return normalizeLtlOrderResult(payload);
  },
  async freight_check_address_reachable(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_ADDRESS_REACHABLE_CHECK",
      compactObject({
        addressType: input.direction === "delivery" ? 2 : 1,
        province: requiredInputString(input.province, "province"),
        city: requiredInputString(input.city, "city"),
        district: optionalString(input.district),
        address: optionalString(input.address),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express address coverage response");
    return {
      reachable: integer(record.reachable, "reachable", providerResponseError),
      resultMsg: optionalString(record.resultMsg),
    };
  },
  async freight_query_standard_price(input, context) {
    const weight = optionalNumber(input.weight);
    const size = optionalNumber(input.size);
    const declareValue = optionalNumber(input.declare_value);
    if (weight === undefined && size === undefined && declareValue === undefined) {
      throw providerInputError("At least one of weight, size, or declare_value is required to price a shipment.");
    }
    const payload = await requestSfExpress(
      "FOP_RECE_PRODUCTRULE_CHECK_PRICE",
      compactObject({
        ...readPriceAddress(input.sender, "sender", "sender", true),
        ...readPriceAddress(input.recipient, "recipient", "receiver", false),
        suburbFlg: optionalBoolean(input.suburb_flg),
        productCode: optionalString(input.product_code),
        currencyType: optionalString(input.currency_type),
        weight,
        size,
        declareValue,
        volume: optionalNumber(input.volume),
        consignedTm: optionalString(input.consigned_time),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express standard price response");
    return {
      totalPrice: optionalNumberLike(record.totalPrice),
      currencyType: optionalString(record.currencyType),
      rate: optionalNumberLike(record.rate),
    };
  },
  async freight_register_ltl_picture_push(input, context) {
    const orderId = requiredInputString(input.order_id, "order_id");
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    await requestSfExpress(
      // The doc page's own basic-info table writes FOP_RECE_LTL_REGISTER_PIC, but the
      // portal catalog and URL both carry FOP_RECE_LTL_REGISTER_ROUTER; the catalog
      // value wins because the doc table has proven copy-paste bugs elsewhere.
      "FOP_RECE_LTL_REGISTER_ROUTER",
      {
        orderId,
        waybillNo,
        imageTypes: requiredStringArray(input.image_types, "image_types", providerInputError),
      },
      context,
      "execute",
    );
    return { orderId, waybillNo };
  },
  async freight_query_crossborder_route(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_IFOS_WAYBILL_ROUTE_FIND_ORDER",
      compactObject({
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        orderTime: optionalString(input.order_time),
      }),
      context,
      "execute",
    );
    return normalizeCrossborderRoute(payload);
  },
  async freight_query_crossborder_transfer_routes(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_IFOS_WAYBILL_ROUTE_CHILDREN",
      compactObject({
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        orderTime: optionalString(input.order_time),
      }),
      context,
      "execute",
    );
    return {
      routes: objectArray(payload ?? [], "transferRoutes", providerResponseError).map((route, index) =>
        readRouteInfo(route, `transferRoutes[${index}]`),
      ),
    };
  },
  async freight_list_crossborder_transfer_nos(input, context) {
    const payload = await requestSfExpress(
      // The official serviceCode misspells ROTE; copied verbatim from the doc page.
      "FOP_RECE_IFOS_WAYBILL_ROTE_FIND_CHILDREN",
      compactObject({
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        orderTime: optionalString(input.order_time),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express transfer waybill list response");
    return compactObject({
      receiverCity: optionalString(record.receiverCity),
      senderCity: optionalString(record.senderCity),
      waybillAmount: optionalIntegerLike(record.waybillAmount, "waybillAmount", providerResponseError),
      waybillDelivering: optionalIntegerLike(record.waybillDelivering, "waybillDelivering", providerResponseError),
      waybillReceived: optionalIntegerLike(record.waybillReceived, "waybillReceived", providerResponseError),
      waybillTransporting: optionalIntegerLike(
        record.waybillTransporting,
        "waybillTransporting",
        providerResponseError,
      ),
      childrenList: objectArray(record.childrenList ?? [], "childrenList", providerResponseError).map(
        (child, index) => ({
          orderStatus: optionalIntegerLike(
            child.orderStatus,
            `childrenList[${index}].orderStatus`,
            providerResponseError,
          ),
          receiverCity: optionalString(child.receiverCity),
          senderCity: optionalString(child.senderCity),
          waybillNo: requiredString(child.waybillNo, `childrenList[${index}].waybillNo`, providerResponseError),
        }),
      ),
    });
  },
  async freight_report_work_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_QCS_WORK_ORDER_REPORT",
      compactObject({
        orderNo: requiredInputString(input.order_no, "order_no"),
        creator: requiredInputString(input.creator, "creator"),
        creatorPhone: optionalString(input.creator_phone),
        // Only the SF home-installation category exists today; the doc fixes this at 0.
        bussCategory: 0,
        orderCategoryOne: requiredInputString(input.category_one, "category_one"),
        orderCategoryTwo: requiredInputString(input.category_two, "category_two"),
        orderCategoryThree: optionalString(input.category_three),
        urgencyDegree: input.urgency === "urgent" ? 2 : 1,
        reportContent: requiredInputString(input.content, "content"),
        pics: optionalStringArray(input.pics)?.join(",") || undefined,
        afterHandleReplyTime: optionalInteger(input.handle_time_limit_minutes),
        reportSourceNo: requiredInputString(input.report_source_no, "report_source_no"),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express work order response");
    return {
      workOrderId: requiredString(record.workOrderId, "workOrderId", providerResponseError),
    };
  },
  async freight_reply_work_order(input, context) {
    const workOrderId = optionalString(input.work_order_id);
    const reportSourceNo = optionalString(input.report_source_no);
    if (workOrderId === undefined && reportSourceNo === undefined) {
      throw providerInputError("At least one of work_order_id or report_source_no is required.");
    }
    const replyId = requiredInputString(input.reply_id, "reply_id");
    await requestSfExpress(
      "FOP_RECE_QCS_WORK_ORDER_REPLY",
      compactObject({
        workOrderId,
        reportSourceNo,
        replyId,
        replyContent: requiredInputString(input.content, "content"),
        replyName: requiredInputString(input.reply_name, "reply_name"),
        replyPhone: optionalString(input.reply_phone),
        pics: optionalStringArray(input.pics)?.join(",") || undefined,
        isDone: input.is_done === true ? 1 : 0,
        isSolve: optionalFlagNumber(input.is_solve),
      }),
      context,
      "execute",
    );
    return { replyId };
  },
};

/** Map a sender/recipient input object to the flat prefixed msgData fields (sendXxx / deliveryXxx). */
function readFreightContact(value: unknown, fieldName: string, prefix: "send" | "delivery"): Record<string, unknown> {
  const contact = requiredRecord(value, fieldName, providerInputError);
  const mobile = optionalString(contact.mobile);
  const tel = optionalString(contact.tel);
  if (mobile === undefined && tel === undefined) {
    throw providerInputError(`${fieldName} requires either mobile or tel.`);
  }
  return compactObject({
    [`${prefix}Company`]: optionalString(contact.company),
    [`${prefix}Contact`]: requiredInputString(contact.contact, `${fieldName}.contact`),
    [`${prefix}Mobile`]: mobile,
    [`${prefix}Tel`]: tel,
    [`${prefix}Province`]: requiredInputString(contact.province, `${fieldName}.province`),
    [`${prefix}City`]: requiredInputString(contact.city, `${fieldName}.city`),
    [`${prefix}County`]: requiredInputString(contact.county, `${fieldName}.county`),
    [`${prefix}Address`]: requiredInputString(contact.address, `${fieldName}.address`),
    // Only the recipient side has an email field upstream.
    [`${prefix}Email`]: prefix === "delivery" ? optionalString(contact.email) : undefined,
  });
}

/** Map a pricing address to the flat senderXxx/receiverXxx msgData fields. */
function readPriceAddress(
  value: unknown,
  fieldName: string,
  prefix: "sender" | "receiver",
  addressRequired: boolean,
): Record<string, unknown> {
  const address = requiredRecord(value, fieldName, providerInputError);
  return compactObject({
    [`${prefix}Province`]: requiredInputString(address.province, `${fieldName}.province`),
    [`${prefix}City`]: requiredInputString(address.city, `${fieldName}.city`),
    [`${prefix}District`]: optionalString(address.district),
    [`${prefix}Address`]: addressRequired
      ? requiredInputString(address.address, `${fieldName}.address`)
      : optionalString(address.address),
  });
}

function readCargoList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "cargo_list", providerInputError).map((item) =>
    compactObject({
      name: optionalString(item.name),
      unit: optionalString(item.unit),
      category: optionalString(item.category),
      spec: optionalString(item.spec),
      count: optionalInteger(item.count),
      length: optionalNumber(item.length),
      height: optionalNumber(item.height),
      width: optionalNumber(item.width),
      volume: optionalNumber(item.volume),
      weight: optionalNumber(item.weight),
      goodsCode: optionalString(item.goodsCode),
      stateBarCode: optionalString(item.stateBarCode),
      boxNo: optionalString(item.boxNo),
      snCode: optionalString(item.snCode),
    }),
  );
}

function readPackageList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "package_list", providerInputError).map((item) =>
    compactObject({
      waybillNo: optionalString(item.waybillNo),
      boxNo: optionalString(item.boxNo),
      length: optionalNumber(item.length),
      height: optionalNumber(item.height),
      width: optionalNumber(item.width),
      weight: optionalNumber(item.weight),
      unitWeight: optionalString(item.unitWeight),
      volume: optionalNumber(item.volume),
      unitVolume: optionalString(item.unitVolume),
    }),
  );
}

function readAdditionServices(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "addition_services", providerInputError).map((item, index) =>
    compactObject({
      name: requiredInputString(item.name, `addition_services[${index}].name`),
      value: optionalString(item.value),
      value1: optionalString(item.value1),
      value2: optionalString(item.value2),
      value3: optionalString(item.value3),
      value4: optionalString(item.value4),
      value5: optionalString(item.value5),
    }),
  );
}

function readThirdSignBack(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const info = requiredRecord(value, "third_sign_back", providerInputError);
  return {
    signBackProvince: requiredInputString(info.province, "third_sign_back.province"),
    signBackCity: requiredInputString(info.city, "third_sign_back.city"),
    signBackCounty: requiredInputString(info.county, "third_sign_back.county"),
    signBackAddress: requiredInputString(info.address, "third_sign_back.address"),
    signBackContact: requiredInputString(info.contact, "third_sign_back.contact"),
    signBackMobile: requiredInputString(info.mobile, "third_sign_back.mobile"),
    signBackTel: optionalString(info.tel),
    signBackCompany: optionalString(info.company),
  };
}

/** Normalize the LTL order result shared by the create / query-result / append-sub-waybill endpoints. */
function normalizeLtlOrderResult(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express freight order response");
  return compactObject({
    orderId: requiredString(record.orderId, "orderId", providerResponseError),
    waybillNo: optionalString(record.waybillNo),
    subWaybillNos: optionalString(record.subWaybillNos)
      ?.split(",")
      .map((no) => no.trim())
      .filter((no) => no.length > 0),
    returnTrackingNo: optionalString(record.returnTrackingNo),
    destCode: optionalString(record.destCode),
    filterResult: optionalIntegerLike(record.filterResult, "filterResult", providerResponseError),
    // The doc table names this filterRemark while the response example sends remark.
    filterRemark: optionalString(record.filterRemark) ?? optionalString(record.remark),
    mappingMark: optionalString(record.mappingMark),
    paymentLink: optionalString(record.paymentLink),
    rlsInfo: optionalRecord(record.rlsInfo),
    signBackRlsInfo: optionalRecord(record.signBackRlsInfo),
  });
}

function readRouteInfo(route: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  return compactObject({
    info: requiredString(route.info, `${fieldName}.info`, providerResponseError),
    status: optionalIntegerLike(route.status, `${fieldName}.status`, providerResponseError),
    statusDesc: requiredString(route.statusDesc, `${fieldName}.statusDesc`, providerResponseError),
    time: optionalIntegerLike(route.time, `${fieldName}.time`, providerResponseError),
    opCode: optionalString(route.opCode),
  });
}

function normalizeCrossborderRoute(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express cross-border route response");
  return compactObject({
    waybillNo: requiredString(record.waybillNo, "waybillNo", providerResponseError),
    cargoVolume: optionalNumberLike(record.cargoVolume),
    cargoWeight: optionalNumberLike(record.cargoWeight),
    cargoAmount: optionalIntegerLike(record.cargoAmount, "cargoAmount", providerResponseError),
    expectDeliveryTime: optionalIntegerLike(record.expectDeliveryTime, "expectDeliveryTime", providerResponseError),
    // The waybill-query table types this String; the transfer-number list types it Integer.
    orderStatus: optionalString(record.orderStatus),
    payMethod: optionalString(record.payMethod),
    senderCity: optionalString(record.senderCity),
    receiverCity: optionalString(record.receiverCity),
    routeInfos: Array.isArray(record.routeInfos)
      ? record.routeInfos.map((route, index) =>
          readRouteInfo(requiredRecord(route, "routeInfos item", providerResponseError), `routeInfos[${index}]`),
        )
      : undefined,
    timeTag: optionalString(record.timeTag),
    waybillAmount: optionalIntegerLike(record.waybillAmount, "waybillAmount", providerResponseError),
    subWaybillNos: optionalStringArray(record.subWaybillNos),
    waybillReceived: optionalIntegerLike(record.waybillReceived, "waybillReceived", providerResponseError),
    waybillTransporting: optionalIntegerLike(record.waybillTransporting, "waybillTransporting", providerResponseError),
    waybillDelivering: optionalIntegerLike(record.waybillDelivering, "waybillDelivering", providerResponseError),
  });
}
