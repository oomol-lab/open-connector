import type { JsonValue } from "./types.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
const encoder = new TextEncoder();

function canonicalText(value: JsonValue): string {
  if (value == null || typeof value == "boolean" || typeof value == "string" || typeof value == "number")
    return JSON.stringify(value);

  if (Array.isArray(value)) return `[${value.map(canonicalText).join(",")}]`;

  const object = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(object)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${canonicalText(object[key]!)}`)
    .join(",")}}`;
}

export function canonicalJsonBytes(value: JsonValue): Uint8Array {
  return encoder.encode(canonicalText(value));
}

export async function digestBytes(bytes: Uint8Array): Promise<string> {
  return `sha256:${sha256Hex(bytes)}`;
}
