import { optionalRecord } from "../../../core/cast.ts";

export function microsoftGraphErrorCodes(data: unknown): Set<string> {
  const codes = new Set<string>();
  let value = optionalRecord(data)?.error;
  for (let depth = 0; depth < 4; depth += 1) {
    const error = optionalRecord(value);
    if (!error) break;
    if (typeof error.code === "string") codes.add(error.code.toLowerCase());
    value = error.innerError ?? error.innererror;
  }
  return codes;
}
