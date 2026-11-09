import { objectArray, optionalString, requiredBoolean, requiredRawString } from "../../../core/cast.ts";
import { providerResponseError } from "../../provider-runtime.ts";

interface FeishuResponsePage {
  items: Record<string, unknown>[];
  hasMore: boolean;
  pageToken: string | undefined;
}

/** Validate a paged wire response without converting missing evidence to an empty final page. */
export function readFeishuResponsePage(
  data: Record<string, unknown>,
  itemField = "items",
  tokenFields: readonly string[] = ["page_token"],
): FeishuResponsePage {
  const hasMore = requiredBoolean(data.has_more, "Feishu response has_more", providerResponseError);
  // An explicitly exhausted listing may omit its empty array. A present
  // malformed value or an unfinished page still requires valid row evidence.
  const items =
    !hasMore && !Object.hasOwn(data, itemField)
      ? []
      : objectArray(data[itemField], `Feishu response ${itemField}`, providerResponseError);
  let pageToken: string | undefined;
  for (const field of tokenFields) {
    const value = data[field];
    // Terminal responses may omit the cursor or send null/an empty string.
    if (value === undefined || value === null || value === "") continue;
    pageToken = requiredRawString(value, `Feishu response ${field}`, providerResponseError);
    if (!pageToken.trim()) throw providerResponseError(`Feishu response has an empty ${field}`);
    break;
  }
  if (hasMore && !pageToken) {
    throw providerResponseError("Feishu response has_more requires a page token");
  }
  return { items, hasMore, pageToken };
}

export function requireFeishuResponseString(value: unknown, field: string): string {
  const text = optionalString(value)?.trim();
  if (text) return text;
  throw providerResponseError(`Feishu response is missing ${field}`);
}

export function requireFeishuResponseId(value: unknown, field: string): string {
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) return String(value);
    throw providerResponseError(`Feishu response has an invalid ${field}`);
  }
  return requireFeishuResponseString(value, field);
}
