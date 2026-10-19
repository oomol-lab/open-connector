function splitLinkParts(value: string, delimiter: string) {
  const parts: string[] = [];
  let start = 0;
  let inTarget = false;
  let inQuotes = false;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inQuotes && character === "\\") {
      escaped = true;
      continue;
    }
    if (!inTarget && character === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (character === "<") inTarget = true;
      else if (character === ">") inTarget = false;
      else if (!inTarget && character === delimiter) {
        parts.push(value.slice(start, index));
        start = index + 1;
      }
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function parameterValue(value: string) {
  if (!value.startsWith('"')) return value;
  let result = "";
  for (let index = 1; index < value.length; index++) {
    const character = value[index];
    if (character === '"') return index === value.length - 1 ? result : undefined;
    if (character === "\\") {
      index++;
      if (index === value.length) return undefined;
    }
    result += value[index];
  }
  return undefined;
}

export function readSmartHrNextPage(headers: Headers, requestUrl: URL): number | null {
  for (const entry of splitLinkParts(headers.get("link") ?? "", ",")) {
    const link = entry.trim();
    const targetEnd = link.indexOf(">");
    if (!link.startsWith("<") || targetEnd < 1) continue;
    const parameters = new Map<string, string | undefined>();
    const suffix = link.slice(targetEnd + 1).trim();
    if (suffix && !suffix.startsWith(";")) continue;
    for (const part of splitLinkParts(suffix, ";")) {
      const separator = part.indexOf("=");
      const name = (separator < 0 ? part : part.slice(0, separator)).trim().toLowerCase();
      if (!name || parameters.has(name)) continue;
      parameters.set(name, separator < 0 ? undefined : parameterValue(part.slice(separator + 1).trim()));
    }
    if (parameters.has("anchor")) continue;
    const relations = parameters.get("rel")?.toLowerCase().split(" ");
    if (!relations?.includes("next")) continue;
    try {
      const url = new URL(link.slice(1, targetEnd), requestUrl);
      const page = url.searchParams.get("page");
      if (!page || [...page].some((character) => !"0123456789".includes(character))) continue;
      const value = Number(page);
      if (Number.isSafeInteger(value) && value > 0) return value;
    } catch {}
  }
  return null;
}
