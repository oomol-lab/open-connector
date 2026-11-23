import { providerInputError } from "../provider-runtime.ts";

// Only documented Mail regions may determine outbound hosts.
const dataCenters = new Map<string, string>([
  ["zoho.com", "https://mail.zoho.com"],
  ["zoho.eu", "https://mail.zoho.eu"],
  ["zoho.in", "https://mail.zoho.in"],
  ["zoho.com.au", "https://mail.zoho.com.au"],
  ["zoho.jp", "https://mail.zoho.jp"],
  ["zohocloud.ca", "https://mail.zohocloud.ca"],
  ["zoho.com.cn", "https://mail.zoho.com.cn"],
  ["zoho.ae", "https://mail.zoho.ae"],
  ["zoho.sa", "https://mail.zoho.sa"],
  ["zoho.uk", "https://mail.zoho.uk"],
  ["zoho.sg", "https://mail.zoho.sg"],
]);

export function resolveZohoDataCenter(value: unknown): string {
  if (value === undefined) return "zoho.com";
  if (typeof value === "string" && dataCenters.has(value)) return value;
  throw providerInputError(`dataCenter must be one of ${[...dataCenters.keys()].join(", ")}`);
}

export function zohoMailOrigin(value: unknown): string {
  return dataCenters.get(resolveZohoDataCenter(value))!;
}

export function zohoAccountsOrigin(value: unknown): string {
  return `https://accounts.${resolveZohoDataCenter(value)}`;
}

// Never trust the callback accounts-server as an outbound URL.
export function resolveZohoCallbackDataCenter(callbackQuery: string | undefined, configured: unknown): string {
  const location = new URLSearchParams(callbackQuery).get("location");
  if (location === null) return resolveZohoDataCenter(configured);
  const domains = new Map([
    ["us", "zoho.com"],
    ["eu", "zoho.eu"],
    ["in", "zoho.in"],
    ["au", "zoho.com.au"],
    ["jp", "zoho.jp"],
    ["ca", "zohocloud.ca"],
    ["cn", "zoho.com.cn"],
    ["ae", "zoho.ae"],
    ["sa", "zoho.sa"],
    ["uk", "zoho.uk"],
    ["sg", "zoho.sg"],
  ]);
  const domain = domains.get(location);
  if (!domain) throw providerInputError("Unsupported Zoho callback location");
  return domain;
}
