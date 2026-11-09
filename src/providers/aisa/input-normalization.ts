import { optionalRecord } from "../../core/cast.ts";
import { providerInputError } from "../provider-runtime.ts";

export function normalizeAisaInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  const submission = name.startsWith("submit_");
  if (name.includes("firecrawl")) normalizeFirecrawlInput(name, normalized, submission);
  if (!submission) return normalized;

  for (const field of ["query", "prompt", "maxPriceUsd"]) {
    if (typeof normalized[field] === "string") normalized[field] = normalized[field].trim();
  }

  if (normalized.query === "" || normalized.prompt === "") {
    throw providerInputError("Research input must not be blank");
  }

  if (normalized.maxPriceUsd !== undefined) {
    const amount = String(normalized.maxPriceUsd);
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      throw providerInputError("Expected a non-negative USD amount");
    }
  }

  if (name === "submit_oxylabs_answer") {
    const maxBytes = normalized.source === "chatgpt" ? 4000 : 8000;
    if (Buffer.byteLength(String(normalized.prompt)) > maxBytes) {
      throw providerInputError("Prompt exceeds the source-specific UTF-8 byte limit");
    }
  }

  return normalized;
}

function normalizeFirecrawlInput(name: string, input: Record<string, unknown>, submission: boolean): void {
  const validateUrl = (value: unknown): string => {
    const text = String(value).trim();
    const url = URL.parse(text);
    const forbidsPdf = submission || name === "scrape_firecrawl";
    const hasPdfPath = url?.pathname.toLowerCase().endsWith(".pdf");
    const hasCredentialsOrFragment = url && (url.username || url.password || url.hash);
    if (
      !url?.hostname ||
      url.protocol !== "https:" ||
      (forbidsPdf && hasPdfPath) ||
      (submission && hasCredentialsOrFragment)
    ) {
      throw providerInputError("Firecrawl requires an HTTPS URL without credentials, fragment or PDF suffix");
    }

    return text;
  };
  if (input.url !== undefined) input.url = validateUrl(input.url);
  if (!submission) return;

  if (Array.isArray(input.urls)) {
    const urls = input.urls.map(validateUrl);
    const unique = new Set(urls.map(withoutTrailingSlashes));
    if (unique.size !== urls.length) {
      throw providerInputError("URLs must be unique after trimming whitespace and trailing slashes");
    }

    input.urls = urls;
  }

  const scrapeOptions = optionalRecord(input.scrapeOptions);
  if (scrapeOptions) {
    const normalizedOptions = { ...scrapeOptions };
    normalizeSelectors(normalizedOptions);
    input.scrapeOptions = normalizedOptions;
  }

  normalizeSelectors(input);
}

function withoutTrailingSlashes(value: string): string {
  while (value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

const selectorByteLimits: Record<string, number> = {
  includeTags: 128,
  excludeTags: 128,
  includePaths: 256,
  excludePaths: 256,
};

function normalizeSelectors(input: Record<string, unknown>): void {
  for (const [field, limit] of Object.entries(selectorByteLimits)) {
    const selectors = input[field];
    if (!Array.isArray(selectors)) continue;
    input[field] = selectors.map((entry: unknown) => {
      const text = String(entry).trim();
      const hasNewline = text.includes("\r") || text.includes("\n");
      if (!text || Buffer.byteLength(text) > limit || hasNewline) {
        throw providerInputError(`${field} entries must fit ${limit} UTF-8 bytes and contain no newlines`);
      }

      return text;
    });
  }
}
