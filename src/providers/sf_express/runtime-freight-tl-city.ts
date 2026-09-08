import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { SfExpressActionHandler } from "./runtime.ts";

import {
  compactObject,
  integer,
  nullableString,
  objectArray,
  optionalBoolean,
  optionalIntegerLike,
  optionalNumber,
  optionalScalarString,
  optionalString,
  requiredNumber,
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
import { optionalFlagNumber, readServiceValueList, requestSfExpress } from "./runtime.ts";

/** Handlers for the SF Express Freight truckload and city-delivery endpoints. */
export const sfExpressFreightTlCityHandlers: ProviderActionHandlerSubset<"sf_express", SfExpressActionHandler> = {
  async freight_create_tl_order(input, context) {
    const generateWaybillNo = optionalBoolean(input.generate_waybill_no);
    const waybillNo = optionalString(input.waybill_no);
    if (generateWaybillNo !== true && waybillNo === undefined) {
      throw providerInputError("waybill_no is required when generate_waybill_no is false.");
    }
    const payMethod = integer(input.pay_method, "pay_method", providerInputError);
    const monthlyCard = optionalString(input.monthly_card);
    if ((payMethod === 1 || payMethod === 2) && monthlyCard === undefined) {
      throw providerInputError("monthly_card is required when pay_method is 1 (寄付月结) or 2 (寄付转第三方).");
    }
    const sender = readTlContact(input.sender, "sender");
    const recipient = readTlContact(input.recipient, "recipient");
    const payload = await requestSfExpress(
      "FOP_RECE_TL_CREATE_ORDER",
      compactObject({
        orderId: requiredInputString(input.order_id, "order_id"),
        operaterType: 1,
        custId: monthlyCard,
        payMethod,
        isGenWaybillNo: generateWaybillNo === true ? 1 : 0,
        waybillNo,
        sendCompany: sender.company,
        sendContact: sender.contact,
        sendMobile: sender.mobile,
        sendProvince: sender.province,
        sendCity: sender.city,
        sendCounty: sender.county,
        sendAddress: sender.address,
        deliveryCompany: recipient.company,
        deliveryContact: recipient.contact,
        deliveryMobile: recipient.mobile,
        deliveryProvince: recipient.province,
        deliveryCity: recipient.city,
        deliveryCounty: recipient.county,
        deliveryAddress: recipient.address,
        reqDeliveryTime: optionalString(input.required_delivery_time),
        cargoType: optionalString(input.cargo_type),
        packageType: optionalString(input.package_type),
        cargoName: optionalString(input.cargo_name),
        totalCargoQuantity: optionalIntegerLike(input.total_cargo_quantity, "total_cargo_quantity", providerInputError),
        totalCargoWeight: optionalNumber(input.total_cargo_weight),
        totalCargoVolume: optionalNumber(input.total_cargo_volume),
        vehicleType: optionalString(input.vehicle_type),
        carType: optionalString(input.car_type),
        needTrackingReturn: optionalFlagNumber(input.need_tracking_return),
        receiveRemark: optionalString(input.receive_remark),
        deliveryRemark: optionalString(input.delivery_remark),
        empCode: optionalString(input.emp_code),
        price: optionalNumber(input.price),
        cargoes: readTlCargoes(input.cargoes),
        expectedStops: readTlExpectedStops(input.expected_stops),
        additionServices: readServiceValueList(input.addition_services, "addition_services"),
        extraInfos: readTlExtraInfos(input.extra_infos),
      }),
      context,
      "execute",
    );
    return normalizeTlOrderResult(payload);
  },
  async freight_cancel_tl_order(input, context) {
    const orderId = requiredInputString(input.order_id, "order_id");
    await requestSfExpress(
      "FOP_RECE_TL_CANCEL_ORDER",
      compactObject({
        orderId,
        waybillNo: optionalString(input.waybill_no),
        operator: optionalString(input.operator),
        cancelReason: optionalString(input.cancel_reason),
      }),
      context,
      "execute",
    );
    return { orderId, cancelled: true };
  },
  async freight_query_tl_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_TL_SEARCH_ORDER",
      compactObject({
        orderId: requiredInputString(input.order_id, "order_id"),
        waybillNo: optionalString(input.waybill_no),
      }),
      context,
      "execute",
    );
    return normalizeTlOrderResult(payload);
  },
  async freight_create_vehicle_track_url(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_GENERATE_VEHICLE_TRACK_URL",
      {
        waybillNo: requiredInputString(input.waybill_no, "waybill_no"),
        customerNo: requiredInputString(input.monthly_card, "monthly_card"),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express vehicle track URL response");
    return { url: requiredString(record.url, "url", providerResponseError) };
  },
  async freight_city_confirm_order(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_CONFIRM_ORDER",
      compactObject({
        clientCode: context.partnerId,
        vehicle: requiredInputString(input.vehicle, "vehicle"),
        carNum: integer(input.car_num, "car_num", providerInputError),
        sendStartTime: requiredInputString(input.send_start_time, "send_start_time"),
        addressList: readCityAddresses(input.address_list, "address_list", true),
        vasFeeList: readCityVasFees(input.vas_fee_list),
        phone: requiredInputString(input.phone, "phone"),
        nickname: requiredInputString(input.nickname, "nickname"),
        place: requiredInputString(input.place, "place"),
        destinationCity: requiredInputString(input.destination_city, "destination_city"),
        remark: optionalString(input.remark),
        customerOrderNo: optionalString(input.customer_order_no),
        monthCardNo: requiredInputString(input.monthly_card, "monthly_card"),
        goodsName: optionalString(input.goods_name),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express city-delivery order response");
    return { orderNo: requiredString(record.orderNo, "orderNo", providerResponseError) };
  },
  async freight_city_calc_fee(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_CALC_FEE",
      compactObject({
        clientCode: context.partnerId,
        vehicle: requiredInputString(input.vehicle, "vehicle"),
        carNum: integer(input.car_num, "car_num", providerInputError),
        sendStartTime: requiredInputString(input.send_start_time, "send_start_time"),
        orderAddressVOList: readCityAddresses(input.addresses, "addresses", false),
        orderVasFeeList: readCityVasFees(input.vas_fee_list),
        city: requiredInputString(input.city, "city"),
        orderSource: requiredInputString(input.order_source, "order_source"),
      }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express city-delivery fee response");
    return {
      baseFee: requiredNumber(record.baseFee, "baseFee", providerResponseError),
      totalFee: requiredNumber(record.totalFee, "totalFee", providerResponseError),
      totalVasFee: requiredNumber(record.totalVasFee, "totalVasFee", providerResponseError),
      mileage: requiredNumber(record.mileage, "mileage", providerResponseError),
      cutPayment: optionalNumber(record.cutPayment),
      orderVasFeeList: objectArray(record.orderVasFeeList ?? [], "orderVasFeeList", providerResponseError).map(
        (item, index) => ({
          vasCode: requiredString(item.vasCode, `orderVasFeeList[${index}].vasCode`, providerResponseError),
          vehicle: requiredString(item.vehicle, `orderVasFeeList[${index}].vehicle`, providerResponseError),
          num: optionalIntegerLike(item.num, `orderVasFeeList[${index}].num`, providerResponseError),
          fee: requiredNumber(item.fee, `orderVasFeeList[${index}].fee`, providerResponseError),
          name: requiredString(item.name, `orderVasFeeList[${index}].name`, providerResponseError),
        }),
      ),
    };
  },
  async freight_city_list_orders(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_ORDER_LIST",
      compactObject({
        clientCode: context.partnerId,
        phone: requiredInputString(input.phone, "phone"),
        createTimeStart: optionalString(input.create_time_start),
        createTimeEnd: optionalString(input.create_time_end),
        index: optionalIntegerLike(input.index, "index", providerInputError),
        size: optionalIntegerLike(input.size, "size", providerInputError),
      }),
      context,
      "execute",
    );
    return {
      orders: objectArray(payload, "orders", providerResponseError).map((order, index) => ({
        orderNo: requiredString(order.orderNo, `orders[${index}].orderNo`, providerResponseError),
        orderTime: requiredString(order.orderTime, `orders[${index}].orderTime`, providerResponseError),
        finishTime: optionalString(order.finishTime),
        contact: requiredString(order.contact, `orders[${index}].contact`, providerResponseError),
        tel: requiredString(order.tel, `orders[${index}].tel`, providerResponseError),
        orderStatus: integer(order.orderStatus, `orders[${index}].orderStatus`, providerResponseError),
        remark: optionalString(order.remark),
        customerOrderNo: optionalString(order.customerOrderNo),
        totalFee: optionalNumber(order.totalFee),
      })),
    };
  },
  async freight_city_get_order_detail(input, context) {
    const orderNo = optionalString(input.order_no);
    const customerOrderNo = optionalString(input.customer_order_no);
    if (orderNo === undefined && customerOrderNo === undefined) {
      throw providerInputError("order_no or customer_order_no is required.");
    }
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_ORDER_DETAIL",
      compactObject({ clientCode: context.partnerId, orderNo, customerOrderNo }),
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express city-delivery order detail response");
    const addresses = record.orderAddress ?? record.addressList;
    return {
      orderNo: requiredString(record.orderNo, "orderNo", providerResponseError),
      orderTime: requiredString(record.orderTime, "orderTime", providerResponseError),
      finishTime: optionalString(record.finishTime),
      monthSettlementCard: optionalString(record.monthSettlementCard),
      contact: optionalString(record.contact),
      tel: optionalString(record.tel),
      sendStartTime: optionalString(record.sendStartTime),
      orderStatus: integer(record.orderStatus, "orderStatus", providerResponseError),
      mileage: optionalNumber(record.mileage),
      mileageFee: optionalNumber(record.mileageFee),
      remark: optionalString(record.remark),
      customerOrderNo: optionalString(record.customerOrderNo),
      carNumber: optionalIntegerLike(record.carNumber, "carNumber", providerResponseError),
      totalFee: optionalNumber(record.totalFee),
      vasTotal: optionalNumber(record.vasTotal),
      vehicle: optionalString(record.vehicle),
      city: optionalString(record.city),
      payType: optionalIntegerLike(record.payType, "payType", providerResponseError),
      chauffeurName: optionalString(record.chauffeurName),
      chauffeurTel: optionalString(record.chauffeurTel),
      chauffeurCoordinate: optionalString(record.chauffeurCoordinate),
      cancelMessage: optionalString(record.cancelMessage),
      addressList: objectArray(addresses ?? [], "addressList", providerResponseError).map((address, index) => ({
        serialNo: integer(address.serialNo, `addressList[${index}].serialNo`, providerResponseError),
        address: requiredString(address.address, `addressList[${index}].address`, providerResponseError),
        floor: optionalIntegerLike(address.floor, `addressList[${index}].floor`, providerResponseError),
        lift: optionalIntegerLike(address.lift, `addressList[${index}].lift`, providerResponseError),
        contact: optionalString(address.contact),
        tel: optionalString(address.tel),
      })),
    };
  },
  async freight_city_cancel_order(input, context) {
    const orderNo = optionalString(input.order_no);
    const customerOrderNo = optionalString(input.customer_order_no);
    if (orderNo === undefined && customerOrderNo === undefined) {
      throw providerInputError("order_no or customer_order_no is required.");
    }
    await requestSfExpress(
      "FOP_RECE_UFTL_OF_CANCEL_ORDER",
      compactObject({
        clientCode: context.partnerId,
        orderNo,
        customerOrderNo,
        cancelMessage: requiredInputString(input.cancel_message, "cancel_message"),
      }),
      context,
      "execute",
    );
    return { orderNo: orderNo ?? null, customerOrderNo: customerOrderNo ?? null, cancelled: true };
  },
  async freight_city_list_available_vas(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_CITY_AVAILABLE_VAS_LIST",
      {
        clientCode: context.partnerId,
        place: requiredInputString(input.place, "place"),
        vehicle: requiredInputString(input.vehicle, "vehicle"),
      },
      context,
      "execute",
    );
    return {
      services: objectArray(payload, "services", providerResponseError).map((service, index) => ({
        vasCode: requiredString(service.vasCode, `services[${index}].vasCode`, providerResponseError),
        name: requiredString(service.name, `services[${index}].name`, providerResponseError),
        numUnit: nullableString(service.numUnit) ?? null,
        bailMinFee: optionalScalarString(service.bailMinFee),
        fee: optionalScalarString(service.fee),
        infoName: nullableString(service.infoName) ?? null,
      })),
    };
  },
  async freight_city_list_vehicles(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_CITY_VEHICLES",
      {
        clientCode: context.partnerId,
        city: requiredInputString(input.city, "city"),
        orderCategory: integer(input.order_category, "order_category", providerInputError),
      },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express city vehicles response");
    return {
      carModels: objectArray(record.carModels, "carModels", providerResponseError).map((model, index) => ({
        model: requiredString(model.model, `carModels[${index}].model`, providerResponseError),
        weight: optionalNumber(model.weight),
        length: optionalNumber(model.length),
        width: optionalNumber(model.width),
        height: optionalNumber(model.height),
        volume: optionalNumber(model.volume),
        flag: optionalIntegerLike(model.flag, `carModels[${index}].flag`, providerResponseError),
        specialModelList: Array.isArray(model.specialModelList)
          ? objectArray(model.specialModelList, `carModels[${index}].specialModelList`, providerResponseError).map(
              (special, specialIndex) => ({
                name: requiredString(
                  special.name,
                  `carModels[${index}].specialModelList[${specialIndex}].name`,
                  providerResponseError,
                ),
                code: requiredString(
                  special.code,
                  `carModels[${index}].specialModelList[${specialIndex}].code`,
                  providerResponseError,
                ),
              }),
            )
          : undefined,
        photo: optionalString(model.photo),
      })),
    };
  },
  async freight_city_list_cities(_input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_CITY_LIST",
      { clientCode: context.partnerId },
      context,
      "execute",
    );
    return { cities: requiredStringArray(payload, "cities", providerResponseError) };
  },
  async freight_city_list_appointment_times(input, context) {
    const payload = await requestSfExpress(
      "FOP_RECE_UFTL_OF_SEND_START_TIME_LIST",
      { clientCode: context.partnerId, city: requiredInputString(input.city, "city") },
      context,
      "execute",
    );
    const record = requiredResponseRecord(payload, "SF Express appointment times response");
    return {
      startTime: requiredString(record.startTime, "startTime", providerResponseError),
      endTime: requiredString(record.endTime, "endTime", providerResponseError),
    };
  },
};

function readTlContact(value: unknown, fieldName: string): Record<string, unknown> {
  const contact = requiredRecord(value, fieldName, providerInputError);
  return compactObject({
    contact: requiredInputString(contact.contact, `${fieldName}.contact`),
    mobile: requiredInputString(contact.mobile, `${fieldName}.mobile`),
    address: requiredInputString(contact.address, `${fieldName}.address`),
    company: optionalString(contact.company),
    province: optionalString(contact.province),
    city: optionalString(contact.city),
    county: optionalString(contact.county),
  });
}

function readTlCargoes(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "cargoes", providerInputError).map((cargo) =>
    compactObject({
      name: optionalString(cargo.name),
      count: optionalIntegerLike(cargo.count, "cargoes[].count", providerInputError),
      weight: optionalNumber(cargo.weight),
      length: optionalNumber(cargo.length),
      height: optionalNumber(cargo.height),
      width: optionalNumber(cargo.width),
      volume: optionalNumber(cargo.volume),
    }),
  );
}

function readTlExpectedStops(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "expected_stops", providerInputError).map((stop, index) =>
    compactObject({
      stopAddress: requiredInputString(stop.stop_address, `expected_stops[${index}].stop_address`),
      stopOperateType: integer(
        stop.stop_operate_type,
        `expected_stops[${index}].stop_operate_type`,
        providerInputError,
      ),
      stopProvince: optionalString(stop.stop_province),
      stopCity: optionalString(stop.stop_city),
      stopCounty: optionalString(stop.stop_county),
    }),
  );
}

function readTlExtraInfos(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "extra_infos", providerInputError).map((info) =>
    compactObject({
      attrName: optionalString(info.attr_name),
      attrVal: optionalString(info.attr_val),
    }),
  );
}

/** The two city-delivery actions spell the address array differently, so the error text follows the caller's field. */
/**
 * The order's addressList carries a detailed address line the fee quote's
 * OrderAddressVO does not define, so only the order path emits it.
 */
function readCityAddresses(
  value: unknown,
  fieldName: string,
  withAddressDetail: boolean,
): Array<Record<string, unknown>> {
  return objectArray(value, fieldName, providerInputError).map((address, index) =>
    compactObject({
      coordinate: requiredInputString(address.coordinate, `${fieldName}[${index}].coordinate`),
      contact: requiredInputString(address.contact, `${fieldName}[${index}].contact`),
      tel: requiredInputString(address.tel, `${fieldName}[${index}].tel`),
      address: requiredInputString(address.address, `${fieldName}[${index}].address`),
      addressDetail: withAddressDetail
        ? requiredInputString(address.address_detail, `${fieldName}[${index}].address_detail`)
        : undefined,
      floor: optionalIntegerLike(address.floor, `${fieldName}[${index}].floor`, providerInputError) ?? 0,
      lift: optionalFlagNumber(address.lift) ?? 0,
      replyStatus: optionalBoolean(address.reply_status) === true ? 7 : 0,
    }),
  );
}

function readCityVasFees(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, "vas_fee_list", providerInputError).map((service, index) =>
    compactObject({
      vasCode: requiredInputString(service.vas_code, `vas_fee_list[${index}].vas_code`),
      num: optionalIntegerLike(service.num, `vas_fee_list[${index}].num`, providerInputError),
    }),
  );
}

function normalizeTlOrderResult(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "SF Express truckload order response");
  return {
    orderId: requiredString(record.orderId, "orderId", providerResponseError),
    waybillNo: nullableString(record.waybillNo) ?? null,
    signBackWaybillNo: nullableString(record.signBackWaybillNo) ?? null,
  };
}
