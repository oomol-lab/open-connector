import { ProviderRequestError } from "../../provider-runtime.ts";
import { requireFeishuResponseString } from "./response.ts";

/** Complete reads must reject missing or repeated continuation tokens. */
export class FeishuPagination {
  private readonly seenTokens = new Set<string>();

  private readonly label: string;
  constructor(label: string, initialToken?: string) {
    this.label = label;
    if (initialToken) this.seenTokens.add(initialToken);
  }

  next(hasMore: unknown, value: unknown): string | undefined {
    if (hasMore !== true) return undefined;
    const token = requireFeishuResponseString(value, `${this.label} pagination token`);
    if (this.seenTokens.has(token)) {
      throw new ProviderRequestError(502, `Feishu ${this.label} pagination did not advance`);
    }
    this.seenTokens.add(token);
    return token;
  }
}
