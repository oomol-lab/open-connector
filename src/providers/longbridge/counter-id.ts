/**
 * Convert a Longbridge user-facing symbol to the REST API counter_id format.
 *
 * Keep this intentionally lightweight: dotted index symbols use `IX`, and
 * everything else falls back to stock `ST/<MARKET>/<CODE>` counter IDs.
 */
export function symbolToCounterId(symbol: string): string {
  const parts = splitSymbol(symbol.trim());
  if (!parts) {
    return symbol.trim();
  }
  if (parts.code.startsWith(".")) {
    return `IX/${parts.market}/${parts.code}`;
  }
  return `ST/${parts.market}/${parts.code}`;
}

/**
 * Convert a user-facing index symbol to a Longbridge index counter_id.
 */
export function indexSymbolToCounterId(symbol: string): string {
  const parts = splitSymbol(symbol.trim());
  if (!parts) {
    return symbol.trim();
  }
  return `IX/${parts.market}/${parts.code}`;
}

interface SymbolParts {
  code: string;
  market: string;
}

function splitSymbol(symbol: string): SymbolParts | undefined {
  const separator = symbol.lastIndexOf(".");
  if (separator < 0) {
    return undefined;
  }
  return {
    code: normalizeCounterCode(symbol.slice(0, separator), symbol.slice(separator + 1)),
    market: symbol.slice(separator + 1).toUpperCase(),
  };
}

function normalizeCounterCode(code: string, market: string): string {
  return market.toUpperCase() === "HK" && /^[0-9]+$/.test(code) ? code.replace(/^0+(?=[0-9])/, "") : code;
}
