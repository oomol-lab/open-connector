import { ProviderRequestError } from "../provider-runtime.ts";

export function normalizeShopDomain(value: string | undefined): string {
  if (!value) {
    throw new ProviderRequestError(400, "shopDomain is required");
  }

  const trimmed = value.trim();
  let host = trimmed;
  if (trimmed.includes("://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new ProviderRequestError(400, "shopDomain must be a myshopify.com domain or URL");
    }
    host = url.hostname;
    if (host === "admin.shopify.com" && url.pathname.split("/")[1] === "store") {
      host = `${url.pathname.split("/")[2] ?? ""}.myshopify.com`;
    }
  } else {
    host = trimmed.split("/")[0] ?? "";
  }

  const normalized = host.toLowerCase();
  if (!isMyshopifyDomain(normalized)) {
    throw new ProviderRequestError(400, "shopDomain must be a myshopify.com domain or URL");
  }
  return normalized;
}

function isMyshopifyDomain(host: string) {
  if (!host.endsWith(".myshopify.com") || host.length <= ".myshopify.com".length) {
    return false;
  }
  return isDnsLabel(host.slice(0, -".myshopify.com".length));
}

function isDnsLabel(value: string) {
  if (!value || value.startsWith("-") || value.endsWith("-") || value.length > 63) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isDigit && !isLowercaseLetter && char !== "-") {
      return false;
    }
  }
  return true;
}
