export function normalizeStringItems(value: string | string[]) {
  const source = Array.isArray(value) ? value.join("\n") : value;
  return source
    .split(/[\n,;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
