import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { AlipayCredential } from "./runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  ProviderRequestError,
  createProviderFetch,
  requiredInputString,
  runProviderRequest,
  toProviderExecutionError,
} from "../provider-runtime.ts";
import {
  alipayBusinessInput,
  parseAlipayResponse,
  readAlipayCredential,
  requestAlipay,
  signAlipayParameters,
} from "./runtime.ts";
const methods: Record<string, string> = {
  create_web_payment: "alipay.trade.page.pay",
  create_mobile_payment: "alipay.trade.wap.pay",
  query_payment: "alipay.trade.query",
  refund_payment: "alipay.trade.refund",
  query_refund: "alipay.trade.fastpay.refund.query",
};
const reserved: Record<string, string[]> = {
  create_web_payment: ["out_trade_no", "total_amount", "subject", "return_url", "notify_url", "extra_biz_content"],
  create_mobile_payment: ["out_trade_no", "total_amount", "subject", "return_url", "notify_url", "extra_biz_content"],
  query_payment: ["out_trade_no", "trade_no", "extra_biz_content"],
  refund_payment: ["out_trade_no", "trade_no", "out_request_no", "refund_amount", "refund_reason", "extra_biz_content"],
  query_refund: ["out_trade_no", "trade_no", "out_request_no", "extra_biz_content"],
};
interface AlipayContext {
  credential: AlipayCredential;
  signal?: AbortSignal;
  fetcher: typeof fetch;
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "alipay",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, "alipay");
    return { credential: readAlipayCredential(credential.values), fetcher, signal: context.signal };
  },
  handlers: Object.fromEntries(
    Object.entries(methods).map(([name, method]) => [
      name,
      async (data: Record<string, unknown>, context: AlipayContext) => {
        const business = alipayBusinessInput(data, reserved[name]!);
        const page = name === "create_web_payment" || name === "create_mobile_payment";
        if (page) business.product_code = name === "create_web_payment" ? "FAST_INSTANT_TRADE_PAY" : "QUICK_WAP_WAY";
        const common: Record<string, string> = {};
        for (const key of ["return_url", "notify_url"]) {
          const value = optionalString(data[key]);
          if (value) common[key] = value;
        }
        const parameters = signAlipayParameters(context.credential, method, business, common);
        if (page)
          return { payment_url: `${context.credential.gateway}?${parameters}`, out_trade_no: data.out_trade_no };
        return requestAlipay(context.credential, method, parameters, context.fetcher, context.signal);
      },
    ]),
  ),
});
export const credentialValidators: CredentialValidators = {
  async customCredential(input) {
    const credential = readAlipayCredential(input.values);
    const tokenSuffix = credential.appAuthToken ? `:${sha256Hex(credential.appAuthToken)}` : "";
    return {
      profile: {
        accountId: `${credential.environment}:${credential.appId}${tokenSuffix}`,
        displayName: `Alipay ${credential.appId} (${credential.environment})`,
      },
      grantedScopes: [],
      metadata: { environment: credential.environment, appId: credential.appId, validation: "local_key_format_only" },
    };
  },
};
// Successful responses need signature verification against their original bytes.
export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const stored = await requireCustomCredential(context, "alipay");
    const credential = readAlipayCredential(stored.values);
    if (
      input.endpoint !== "/gateway.do" ||
      input.method.toUpperCase() !== "POST" ||
      Object.keys(input.query ?? {}).length
    )
      throw new ProviderRequestError(400, "Alipay proxy supports POST /gateway.do without query parameters");
    const body = optionalRecord(input.body);
    if (!body) throw new ProviderRequestError(400, "Alipay proxy body must be a JSON object");
    const method = requiredInputString(body.method, "method");
    const business = optionalRecord(body.biz_content);
    if (!business) throw new ProviderRequestError(400, "biz_content must be a JSON object");
    const allowed = new Set(["method", "biz_content", "return_url", "notify_url", "auth_token"]);
    const common: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!allowed.has(key)) throw new ProviderRequestError(400, `Unsupported Alipay proxy common parameter: ${key}`);
      if (key !== "method" && key !== "biz_content") common[key] = requiredInputString(value, key);
    }
    return await runProviderRequest({ label: "Alipay", signal: context.signal }, async (signal) => {
      const response = await createProviderFetch({ skipDnsValidation: true })(credential.gateway, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: signAlipayParameters(credential, method, business, common).toString(),
        signal,
        redirect: "manual",
      });
      const bytes = await readBoundedResponseBytes(response, {
        maxBytes: 4 * 1024 * 1024,
        fieldName: "Alipay proxy response",
        createError: (message) => new ProviderRequestError(502, message),
      });
      const text = new TextDecoder().decode(bytes);
      parseAlipayResponse(text, method, credential, response.status);
      return {
        ok: true as const,
        response: {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          data: JSON.parse(text) as unknown,
        },
      };
    });
  } catch (error) {
    return { ok: false, error: toProviderExecutionError(error, "Alipay proxy failed").error! };
  }
};
