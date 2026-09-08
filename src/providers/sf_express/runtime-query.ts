import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  nullableString,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalIntegerLike,
  optionalNumber,
  optionalNumberLike,
  optionalString,
  optionalStringArray,
  positiveInteger,
  requiredBoolean,
  requiredRecord,
  requiredString,
  requiredStringArray,
  stringArray,
} from "../../core/cast.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  providerResponseError,
  requiredInputNumber,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express service-query endpoints. */
export const sfExpressQueryHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async search_routes(input, context) {
    const trackingNumbers = requiredStringArray(input.tracking_numbers, "tracking_numbers", providerInputError);
    const checkPhoneNos = optionalStringArray(input.check_phone_nos);
    const payload = await requestSfExpress(
      "EXP_RECE_SEARCH_ROUTES",
      compactObject({
        trackingType: input.tracking_type === "client_order" ? 2 : 1,
        trackingNumber: trackingNumbers,
        checkPhoneNo: checkPhoneNos?.join(",") || undefined,
        language: optionalString(input.language),
      }),
      context,
      "execute",
    );
    return normalizeRouteResults(payload);
  },
  async query_delivery_time_price(input, context) {
    const businessType = optionalString(input.business_type);
    const monthlyCard = optionalString(input.monthly_card);
    if (businessType !== undefined && monthlyCard === undefined) {
      throw providerInputError("monthly_card is required when business_type is set.");
    }
    const payload = await requestSfExpress(
      "EXP_RECE_QUERY_DELIVERTM",
      compactObject({
        businessType,
        monthlyCard,
        weight: optionalNumber(input.weight),
        volume: optionalNumber(input.volume),
        consignedTime: optionalString(input.consigned_time),
        searchPrice: readSearchPrice(input.search_price),
        srcAddress: readAddress(input.src_address, "src_address", true),
        destAddress: readAddress(input.dest_address, "dest_address", false),
      }),
      context,
      "execute",
    );
    return normalizeDeliveryOptions(payload);
  },
  async estimate_delivery_time(input, context) {
    const payload = await requestSfExpress(
      "EXP_RECE_SEARCH_PROMITM",
      {
        searchNo: requiredInputString(input.waybill_no, "waybill_no"),
        checkType: input.check_type === "monthly_card" ? 2 : 1,
        checkNos: requiredStringArray(input.check_nos, "check_nos", providerInputError),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express promised delivery time response");
    return {
      searchNo: requiredString(record.searchNo, "searchNo", providerResponseError),
      promiseTm: requiredString(record.promiseTm, "promiseTm", providerResponseError),
    };
  },
  async validate_waybill_no(input, context) {
    const waybillNo = requiredInputString(input.waybill_no, "waybill_no");
    const payload = await requestSfExpress("EXP_RECE_VALIDATE_WAYBILLNO", { waybillNo }, context, "execute");
    return {
      waybillNo,
      valid: requiredBoolean(payload, "SF Express waybill validation response", providerResponseError),
    };
  },
  async filter_order(input, context) {
    const orders = objectArray(input.orders, "orders", providerInputError).map((order, index) =>
      compactObject({
        filterType: order.filter_type === "manual" ? 2 : 1,
        orderId: optionalString(order.order_id),
        monthlyCard: optionalString(order.monthly_card),
        contactInfos: [
          readFilterAddress(order.sender, `orders[${index}].sender`, 1),
          readFilterAddress(order.recipient, `orders[${index}].recipient`, 2),
        ],
      }),
    );
    const payload = await requestSfExpress("EXP_RECE_FILTER_ORDER_BSP", orders, context, "execute");
    const record = requiredResponseRecord(payload, "SF Express filter response");
    return {
      results: objectArray(record.resDtos, "resDtos", providerResponseError).map((result, index) => ({
        orderId: optionalString(result.orderId),
        filterResult: integer(result.filterResult, `resDtos[${index}].filterResult`, providerResponseError),
        originCode: optionalString(result.originCode),
        destCode: optionalString(result.destCode),
        remark: optionalString(result.remark),
      })),
    };
  },
  async query_service_points(input, context) {
    const address = optionalString(input.address);
    const longitude = optionalNumber(input.longitude);
    const latitude = optionalNumber(input.latitude);
    if (address === undefined && (longitude === undefined || latitude === undefined)) {
      throw providerInputError("Provide address or both longitude and latitude.");
    }
    const payload = await requestSfExpress(
      "EXP_RECE_QUERY_GIS_DEPARTMENT",
      compactObject({
        address,
        x: longitude === undefined ? undefined : String(longitude),
        y: latitude === undefined ? undefined : String(latitude),
        deptType: optionalStringArray(input.dept_types)?.join("|") || undefined,
        servType: optionalStringArray(input.service_types)?.join("|") || undefined,
        count: optionalInteger(input.count),
        distance: optionalInteger(input.distance),
        city: optionalString(input.city),
      }),
      context,
      "execute",
    );
    // This endpoint's inner msgData is itself a JSON string.
    const content =
      typeof payload === "string"
        ? parseProviderJsonBodyText(payload, {
            emptyBody: null,
            invalidJsonMessage: "SF Express service points response is invalid JSON",
          })
        : payload;
    const record = requiredResponseRecord(content, "SF Express service points response");
    return {
      status: integer(record.status, "status", providerResponseError),
      count: integer(record.count, "count", providerResponseError),
      src: requiredString(record.src, "src", providerResponseError),
      msg: optionalString(record.msg),
      result: objectArray(record.result, "result", providerResponseError).map((point, index) => ({
        id: requiredString(point.id, `result[${index}].id`, providerResponseError),
        name: requiredString(point.name, `result[${index}].name`, providerResponseError),
        address: requiredString(point.address, `result[${index}].address`, providerResponseError),
        distance: optionalNumber(point.distance),
        longitude: optionalNumber(point.longitude),
        latitude: optionalNumber(point.latitude),
        servertype: optionalString(point.servertype),
      })),
    };
  },
  async recommend_product(input, context) {
    const weight = requiredInputNumber(input.weight, "weight");
    const payload = await requestSfExpress(
      "EXP_RECE_PSDS_PRODUCT_RECOMMEND",
      compactObject({
        traceId: optionalString(input.trace_id),
        waybillNo: optionalString(input.waybill_no),
        srcProvince: requiredInputString(input.src_province, "src_province"),
        srcCity: requiredInputString(input.src_city, "src_city"),
        srcCounty: optionalString(input.src_county),
        destProvince: requiredInputString(input.dest_province, "dest_province"),
        destCity: requiredInputString(input.dest_city, "dest_city"),
        destCounty: optionalString(input.dest_county),
        srcAddress: requiredInputString(input.src_address, "src_address"),
        destAddress: requiredInputString(input.dest_address, "dest_address"),
        sendTime: requiredInputString(input.send_time, "send_time"),
        orderTime: optionalString(input.order_time),
        weight,
        length: optionalNumber(input.length),
        width: optionalNumber(input.width),
        height: optionalNumber(input.height),
        commodityNameList: optionalStringArray(input.commodity_names),
        paymentTerms: requiredInputString(input.payment_terms, "payment_terms"),
        monthlyCard: optionalString(input.monthly_card),
        totalNum: optionalInteger(input.total_num),
        phoneNumber: optionalString(input.phone_number),
        importDeclarationMethod: optionalString(input.import_declaration_method),
        exportDeclarationMethod: optionalString(input.export_declaration_method),
        declaredValue: optionalNumber(input.declared_value),
        declaredCurrency: optionalString(input.declared_currency),
      }),
      context,
      "execute",
    );
    return normalizeProductRecommendations(payload);
  },
  async recommend_vas(input, context) {
    const weight = requiredInputNumber(input.weight, "weight");
    const payload = await requestSfExpress(
      "EXP_RECE_PSDS_RECOMMEND_VAS",
      compactObject({
        expressType: requiredInputString(input.express_type, "express_type"),
        prodPrice: optionalNumber(input.prod_price),
        srcProvince: requiredInputString(input.src_province, "src_province"),
        srcCity: requiredInputString(input.src_city, "src_city"),
        srcCounty: optionalString(input.src_county),
        destProvince: requiredInputString(input.dest_province, "dest_province"),
        destCity: requiredInputString(input.dest_city, "dest_city"),
        destCounty: optionalString(input.dest_county),
        sendTime: requiredInputString(input.send_time, "send_time"),
        orderTime: optionalString(input.order_time),
        weight,
        weightUnit: optionalInteger(input.weight_unit),
        length: optionalNumber(input.length),
        width: optionalNumber(input.width),
        height: optionalNumber(input.height),
        lengthUnit: optionalInteger(input.length_unit),
        payMethod: requiredInputString(input.pay_method, "pay_method"),
        monthlyCard: optionalString(input.monthly_card),
        packageNumber: positiveInteger(input.package_number, "package_number", providerInputError),
        commodityNameList: optionalStringArray(input.commodity_names),
        srcAddress: optionalString(input.src_address),
        destAddress: optionalString(input.dest_address),
        destPostalCode: optionalString(input.dest_postal_code),
        applyLink: optionalString(input.apply_link),
        overseasCountryCode: optionalString(input.overseas_country_code),
        singleTicketReq: readSingleTicket(input.single_ticket),
        singleProductReq: readSingleProducts(input.single_products),
        specialService: optionalString(input.special_service),
        clientCode: optionalString(input.client_code),
        orderType: optionalString(input.order_type),
        labelFresh: readLabelFresh(input.label_fresh),
        payCountry: requiredInputString(input.pay_country, "pay_country"),
        arrivalTime: requiredInputString(input.arrival_time, "arrival_time"),
        srcPhoneNum: optionalString(input.src_phone_num),
      }),
      context,
      "execute",
    );
    return normalizeVasRecommendations(payload);
  },
  async check_pickup_time(input, context) {
    const cityCode = optionalString(input.city_code);
    const province = optionalString(input.province);
    const city = optionalString(input.city);
    const county = optionalString(input.county);
    if (cityCode === undefined && (province === undefined || city === undefined || county === undefined)) {
      throw providerInputError("Provide city_code, or all of province, city and county.");
    }
    const payload = await requestSfExpress(
      "EXP_EXCE_CHECK_PICKUP_TIME",
      compactObject({
        address: requiredInputString(input.address, "address"),
        addressType: input.address_type === "recipient" ? 2 : 1,
        sendTime: requiredInputString(input.send_time, "send_time"),
        cityCode,
        province,
        city,
        county,
        sysCode: optionalString(input.sys_code),
        version: input.include_time_window === true ? "V1.1" : undefined,
      }),
      context,
      "execute",
    );
    // V1.0 answers a bare boolean; V1.1 answers the window object.
    if (typeof payload === "boolean") {
      return { status: payload };
    }
    const record = requiredResponseRecord(payload, "SF Express pickup time response");
    return {
      status: requiredBoolean(record.status, "status", providerResponseError),
      startTm: optionalString(record.startTm),
      endTm: optionalString(record.endTm),
      system: optionalString(record.system),
      exceptionReason: optionalString(record.exceptionReason),
    };
  },
};

function readSearchPrice(value: unknown): string | undefined {
  const flag = optionalBoolean(value);
  return flag === undefined ? undefined : flag ? "1" : "0";
}

/**
 * The origin table lets a detailed address stand in for province/city, because it
 * is documented to carry them; the destination table has no such allowance.
 */
function readAddress(value: unknown, fieldName: string, detailedAddressSuffices: boolean): Record<string, unknown> {
  const address = requiredRecord(value, fieldName, providerInputError);
  const code = optionalString(address.code);
  const province = optionalString(address.province);
  const city = optionalString(address.city);
  const detail = optionalString(address.address);
  const located = code !== undefined || (province !== undefined && city !== undefined);
  if (!located && !(detailedAddressSuffices && detail !== undefined)) {
    throw providerInputError(
      detailedAddressSuffices
        ? `${fieldName} requires code, both province and city, or a detailed address.`
        : `${fieldName} requires either code or both province and city.`,
    );
  }
  return compactObject({
    code,
    province,
    city,
    district: optionalString(address.district),
    address: detail,
  });
}

function normalizeRouteResults(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express route response");
  return {
    results: objectArray(record.routeResps, "routeResps", providerResponseError).map((result, index) => ({
      mailNo: requiredString(result.mailNo, `routeResps[${index}].mailNo`, providerResponseError),
      routes: objectArray(result.routes ?? [], `routeResps[${index}].routes`, providerResponseError).map(
        (route, routeIndex) => ({
          acceptTime: requiredString(
            route.acceptTime,
            `routeResps[${index}].routes[${routeIndex}].acceptTime`,
            providerResponseError,
          ),
          acceptAddress: optionalString(route.acceptAddress),
          remark: requiredString(
            route.remark,
            `routeResps[${index}].routes[${routeIndex}].remark`,
            providerResponseError,
          ),
          opCode: requiredString(
            route.opCode,
            `routeResps[${index}].routes[${routeIndex}].opCode`,
            providerResponseError,
          ),
          firstStatusCode: optionalString(route.firstStatusCode),
          firstStatusName: optionalString(route.firstStatusName),
          secondaryStatusCode: optionalString(route.secondaryStatusCode),
          secondaryStatusName: optionalString(route.secondaryStatusName),
        }),
      ),
      reasonCode: readReasonList(result.reasonCode, `routeResps[${index}].reasonCode`),
      reasonRemark: readReasonList(result.reasonRemark, `routeResps[${index}].reasonRemark`),
    })),
  };
}

/** SF returns the screening reason lists with numeric-looking members; the contract declares strings. */
function readReasonList(value: unknown, fieldName: string): string[] | undefined {
  return Array.isArray(value) ? stringArray(value, fieldName, providerResponseError) : undefined;
}

function normalizeDeliveryOptions(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express delivery standards response");
  return {
    options: objectArray(record.deliverTmDto, "deliverTmDto", providerResponseError).map((option, index) => ({
      businessType: requiredString(option.businessType, `deliverTmDto[${index}].businessType`, providerResponseError),
      businessTypeDesc: requiredString(
        option.businessTypeDesc,
        `deliverTmDto[${index}].businessTypeDesc`,
        providerResponseError,
      ),
      deliverTime: requiredString(option.deliverTime, `deliverTmDto[${index}].deliverTime`, providerResponseError),
      fee: optionalNumber(option.fee) ?? null,
      searchPrice: optionalString(option.searchPrice),
      closeTime: nullableString(option.closeTime) ?? null,
    })),
  };
}

function readFilterAddress(value: unknown, fieldName: string, contactType: number): Record<string, unknown> {
  const address = requiredRecord(value, fieldName, providerInputError);
  return compactObject({
    contactType,
    tel: optionalString(address.tel),
    country: optionalString(address.country),
    province: optionalString(address.province),
    city: optionalString(address.city),
    county: optionalString(address.county),
    address: optionalString(address.address),
    postCode: optionalString(address.post_code),
  });
}

function readSingleTicket(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ticket = requiredRecord(value, "single_ticket", providerInputError);
  return {
    realTotalWeight: integer(ticket.real_total_weight, "single_ticket.real_total_weight", providerInputError),
    piecesNumber: integer(ticket.pieces_number, "single_ticket.pieces_number", providerInputError),
  };
}

function readSingleProducts(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "single_products", providerInputError).map((product, index) => ({
    singleProductNo: requiredStringArray(
      product.single_product_no,
      `single_products[${index}].single_product_no`,
      providerInputError,
    ),
    singleLength: integer(product.single_length, `single_products[${index}].single_length`, providerInputError),
    singleWidth: integer(product.single_width, `single_products[${index}].single_width`, providerInputError),
    singleHeight: integer(product.single_height, `single_products[${index}].single_height`, providerInputError),
    singleWeight: integer(product.single_weight, `single_products[${index}].single_weight`, providerInputError),
    quantity: integer(product.quantity, `single_products[${index}].quantity`, providerInputError),
  }));
}

function readLabelFresh(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw providerInputError("label_fresh must be an array");
  }
  return value.map((item, index) => integer(item, `label_fresh[${index}]`, providerInputError));
}

function normalizeProductRecommendations(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express product recommendation response");
  return {
    products: objectArray(record.productList, "productList", providerResponseError).map((product) =>
      compactObject({
        productCode: optionalString(product.productCode),
        productName: optionalString(product.productName),
        productDisplayCode: optionalString(product.productDisplayCode),
        productDisplayName: optionalString(product.productDisplayName),
        waybillLabelCode: optionalString(product.waybillLabelCode),
        waybillLabelName: optionalString(product.waybillLabelName),
        expressType: optionalString(product.expressType),
        businessType: optionalString(product.businessType),
        productType: optionalString(product.productType),
        recommendProductType: optionalIntegerLike(
          product.recommendProductType,
          "recommendProductType",
          providerResponseError,
        ),
        sortNo: optionalInteger(product.sortNo),
        reachTime: optionalString(product.reachTime),
        standardTime: optionalString(product.standardTime),
        cutOffTime: optionalString(product.cutOffTime),
        weight: optionalNumberLike(product.weight),
        chargedWeight: optionalNumberLike(product.chargedWeight),
        totalFee: optionalNumberLike(product.totalFee),
        freight: optionalNumberLike(product.freight),
        stdFreight: optionalNumberLike(product.stdFreight),
        initialFreight: optionalNumberLike(product.initialFreight),
        totalServiceFee: optionalNumberLike(product.totalServiceFee),
        selfMailingFee: optionalNumberLike(product.selfMailingFee),
        selfTakeFee: optionalNumberLike(product.selfTakeFee),
        otherFee: optionalNumberLike(product.otherFee),
        currency: optionalString(product.currency),
        suburbFlg: optionalBoolean(product.suburbFlg),
        reverseLogistics: optionalString(product.reverseLogistics),
        deliverySfbox: optionalString(product.deliverySfbox),
        overtimeRefund: optionalString(product.overtimeRefund),
        specialCommodityMsg: optionalString(product.specialCommodityMsg),
        serviceFeeList: Array.isArray(product.serviceFeeList)
          ? objectArray(product.serviceFeeList, "serviceFeeList", providerResponseError).map((fee) =>
              compactObject({
                serviceCode: optionalString(fee.serviceCode),
                serviceName: optionalString(fee.serviceName),
                serviceFee: optionalNumberLike(fee.serviceFee),
              }),
            )
          : undefined,
      }),
    ),
    controlStrategies: objectArray(
      record.fastigiumControlStrategyList ?? [],
      "fastigiumControlStrategyList",
      providerResponseError,
    ).map((strategy) => ({
      productCode: optionalString(strategy.productCode),
      controlStrategy: optionalString(strategy.controlStrategy),
      notificationMsg: optionalString(strategy.notificationMsg),
    })),
  };
}

function normalizeVasRecommendations(payload: unknown): Record<string, unknown> {
  // The doc's response table defines the per-service fields but never names the
  // wrapper: accept a bare array, or a record carrying the list as its single
  // array-valued property. More than one candidate means the shape changed, and
  // guessing which array is the service list would answer with silently wrong data.
  let items: unknown[];
  if (Array.isArray(payload)) {
    items = payload;
  } else {
    const arrays = Object.values(requiredResponseRecord(payload, "SF Express VAS response")).filter((value) =>
      Array.isArray(value),
    );
    if (arrays.length !== 1) {
      throw providerResponseError(
        arrays.length === 0
          ? "SF Express VAS response is missing the service list"
          : "SF Express VAS response carries more than one candidate service list",
      );
    }
    items = arrays[0] as unknown[];
  }
  return {
    services: items.map((item, index) => {
      const service = requiredRecord(item, `services[${index}]`, providerResponseError);
      return compactObject({
        recommendedType: optionalIntegerLike(service.recommendedType, "recommendedType", providerResponseError),
        vasCode: optionalString(service.vasCode),
        vasName: optionalString(service.vasName),
        floorPrice: optionalNumberLike(service.floorPrice),
        currency: optionalString(service.currency),
        chargedWeight: optionalNumberLike(service.chargedWeight),
        arrivalTime: optionalString(service.arrivalTime),
        cutOffTime: optionalString(service.cutOffTime),
        mutexVas: optionalString(service.mutexVas),
        timelinessTips: optionalString(service.timelinessTips),
        freightBinding: optionalIntegerLike(service.freightBinding, "freightBinding", providerResponseError),
        requiredInformation: optionalString(service.requiredInformation),
        feeCode: optionalIntegerLike(service.feeCode, "feeCode", providerResponseError),
        minInsuredPrice: optionalNumberLike(service.minInsuredPrice),
        maxInsuredPrice: optionalNumberLike(service.maxInsuredPrice),
        useCoupon: optionalIntegerLike(service.useCoupon, "useCoupon", providerResponseError),
        stressRecommend: optionalIntegerLike(service.stressRecommend, "stressRecommend", providerResponseError),
        extendAttForKY: optionalString(service.extendAttForKY),
        conditionJsonInfo: optionalString(service.conditionJsonInfo),
        extJson: optionalString(service.extJson),
        priorityCode: optionalString(service.priorityCode),
        recommendIndex: optionalIntegerLike(service.recommendIndex, "recommendIndex", providerResponseError),
        order: optionalIntegerLike(service.order, "order", providerResponseError),
        vasOrder: optionalNumberLike(service.vasOrder),
      });
    }),
  };
}
