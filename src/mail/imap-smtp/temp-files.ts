export function sanitizeTempFileName(name: string): string {
  const allowed = new Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-");
  const sanitized = name
    .trim()
    .split("")
    .map((char) => (allowed.has(char) ? char : "-"))
    .join("");
  const collapsed = collapseRepeatedDash(sanitized);
  const trimmed = trimUnsafeEdges(collapsed);
  return trimmed || "file";
}

function collapseRepeatedDash(value: string): string {
  let result = "";
  let previousWasDash = false;
  for (const char of value) {
    if (char === "-") {
      if (!previousWasDash) {
        result += char;
      }
      previousWasDash = true;
    } else {
      result += char;
      previousWasDash = false;
    }
  }
  return result;
}

function trimUnsafeEdges(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === "-" || value[start] === ".")) {
    start += 1;
  }
  while (end > start && (value[end - 1] === "-" || value[end - 1] === ".")) {
    end -= 1;
  }
  return value.slice(start, end);
}
