import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderFetch,
  ProviderRuntimeHandler,
} from "../provider-runtime.ts";

import {
  nullableInteger,
  nullableString,
  objectArray,
  optionalNumberLike,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  readProviderJson,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

export const kuaidi100ApiBaseUrl = "https://api.kuaidi100.com/stdio";

const kuaidi100ValidationMethod = "autoNumber";

type Kuaidi100Phase = "validate" | "execute";
type Kuaidi100ActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type Kuaidi100Query = Record<string, string | undefined>;

export const kuaidi100ActionHandlers: ProviderActionHandlers<"kuaidi100", Kuaidi100ActionHandler> = {
  async query_trace(input, context) {
    const payload = await requestKuaidi100(
      "queryTrace",
      {
        kuaidiNum: requiredInputString(input.kuaidi_num, "kuaidi_num"),
        phone: optionalString(input.phone),
      },
      context,
      "execute",
    );
    return normalizeQueryTrace(payload);
  },
  async auto_number(input, context) {
    const payload = await requestKuaidi100(
      "autoNumber",
      { kuaidiNum: requiredInputString(input.kuaidi_num, "kuaidi_num") },
      context,
      "execute",
    );
    return normalizeAutoNumber(payload);
  },
  async estimate_time(input, context) {
    const payload = await requestKuaidi100("estimateTime", readEstimateTimeQuery(input), context, "execute");
    return normalizeEstimateTime(payload);
  },
  async estimate_time_with_logistic(input, context) {
    const payload = await requestKuaidi100(
      "estimateTimeWithLogistic",
      { ...readEstimateTimeQuery(input), logistic: JSON.stringify(readLogisticEvents(input.logistic)) },
      context,
      "execute",
    );
    return normalizeEstimateTime(payload);
  },
  async estimate_price(input, context) {
    const payload = await requestKuaidi100(
      "estimatePrice",
      {
        kuaidicom: requiredInputString(input.kuaidi_com, "kuaidi_com"),
        sendAddr: requiredInputString(input.send_addr, "send_addr"),
        recAddr: requiredInputString(input.rec_addr, "rec_addr"),
        weight: readWeight(input.weight),
      },
      context,
      "execute",
    );
    return normalizeEstimatePrice(payload);
  },
};

export async function validateKuaidi100Credential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestKuaidi100(
    kuaidi100ValidationMethod,
    { kuaidiNum: "SF1234567890123" },
    { apiKey, fetcher, signal },
    "validate",
  );

  return {
    profile: { displayName: "Kuaidi100 API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: kuaidi100ApiBaseUrl,
      validationEndpoint: `/${kuaidi100ValidationMethod}`,
    },
  };
}

async function requestKuaidi100(
  apiMethod: string,
  query: Kuaidi100Query,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: Kuaidi100Phase,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: context.signal, label: "Kuaidi100" }, async (signal) => {
    const url = new URL(`${kuaidi100ApiBaseUrl}/${apiMethod}`);
    setSearchParams(url, { ...query, key: context.apiKey, responseFormat: "json" });
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    // Kuaidi100 answers business errors with HTTP 200 and a { code, message, result: false } envelope.
    return assertKuaidi100Success(await readProviderJson<unknown>(response, "Kuaidi100"), phase);
  });
}

function assertKuaidi100Success(payload: unknown, phase: Kuaidi100Phase): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "Kuaidi100 response");
  const code = optionalString(record.code);
  if (code === undefined && record.result !== false) {
    return record;
  }

  const message = optionalString(record.message) ?? "Kuaidi100 request failed";
  if (code === "401" || code === "403") {
    throw new ProviderRequestError(phase === "validate" ? 400 : Number(code), message);
  }
  if (code === "400" || code === "429") {
    throw new ProviderRequestError(Number(code), message);
  }
  throw providerResponseError(message);
}

function readEstimateTimeQuery(input: Record<string, unknown>): Kuaidi100Query {
  return {
    kuaidicom: requiredInputString(input.kuaidi_com, "kuaidi_com"),
    from: requiredInputString(input.from_loc, "from_loc"),
    to: requiredInputString(input.to_loc, "to_loc"),
    orderTime: optionalString(input.order_time),
    expType: optionalString(input.exp_type),
  };
}

function readWeight(value: unknown): string {
  const weight = optionalNumberLike(value);
  if (weight === undefined || weight <= 0) {
    throw providerInputError("weight must be a positive number.");
  }
  return String(weight);
}

function readLogisticEvents(value: unknown): Array<Record<string, string>> {
  return objectArray(value, "logistic", providerInputError).map((event, index) => ({
    time: requiredInputString(event.time, `logistic[${index}].time`),
    context: requiredInputString(event.context, `logistic[${index}].context`),
    status: requiredInputString(event.status, `logistic[${index}].status`),
  }));
}

function normalizeQueryTrace(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    kuaidiCom: requiredString(payload.kuaidiCom, "kuaidiCom", providerResponseError),
    kuaidiName: requiredString(payload.kuaidiName, "kuaidiName", providerResponseError),
    kuaidiNum: requiredString(payload.kuaidiNum, "kuaidiNum", providerResponseError),
    state: requiredString(payload.state, "state", providerResponseError),
    fromTo: requiredString(payload.fromTo, "fromTo", providerResponseError),
    data: objectArray(payload.data, "data", providerResponseError).map((event, index) => ({
      time: requiredString(event.time, `data[${index}].time`, providerResponseError),
      status: requiredString(event.status, `data[${index}].status`, providerResponseError),
      context: requiredString(event.context, `data[${index}].context`, providerResponseError),
    })),
    tips: optionalString(payload.tips),
  };
}

function normalizeAutoNumber(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    companies: objectArray(payload.data, "data", providerResponseError).map((company, index) => ({
      comCode: requiredString(company.comCode, `data[${index}].comCode`, providerResponseError),
      name: requiredString(company.name, `data[${index}].name`, providerResponseError),
      lengthPre: requiredString(company.lengthPre, `data[${index}].lengthPre`, providerResponseError),
    })),
    tips: optionalString(payload.tips),
  };
}

function normalizeEstimateTime(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    fromName: requiredString(payload.fromName, "fromName", providerResponseError),
    toName: requiredString(payload.toName, "toName", providerResponseError),
    orderTime: requiredString(payload.orderTime, "orderTime", providerResponseError),
    arrivalTime: requiredString(payload.arrivalTime, "arrivalTime", providerResponseError),
    deliveryExpendTime: requiredString(payload.deliveryExpendTime, "deliveryExpendTime", providerResponseError),
    remainTime: nullableInteger(payload.remainTime) ?? null,
    expType: nullableString(payload.expType) ?? null,
    tips: optionalString(payload.tips),
  };
}

function normalizeEstimatePrice(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    kuaidicom: requiredString(payload.kuaidicom, "kuaidicom", providerResponseError),
    kuaidiName: requiredString(payload.kuaidiName, "kuaidiName", providerResponseError),
    from: requiredString(payload.from, "from", providerResponseError),
    to: requiredString(payload.to, "to", providerResponseError),
    weight: requiredString(payload.weight, "weight", providerResponseError),
    combos: objectArray(payload.combos, "combos", providerResponseError).map((combo, index) => ({
      expType: requiredString(combo.expType, `combos[${index}].expType`, providerResponseError),
      price: requiredString(combo.price, `combos[${index}].price`, providerResponseError),
      productName: nullableString(combo.productName) ?? null,
    })),
    tips: optionalString(payload.tips),
  };
}
