import { TikHubRequestError } from "./errors.ts";

export type TikHubEndpointMethod = "GET" | "POST";

export interface TikHubEndpointPolicyMatch {
  placeholders: string[];
  requiredScope: string;
}

const tikhubUserCategory = "TikHub-User-API";
const tikhubUserPathPrefix = "/api/v1/tikhub/user/";

export function isEligibleTikHubEndpointCategory(category: string): boolean {
  return category !== tikhubUserCategory;
}

export function matchTikHubEndpointPolicy(
  methodInput: string,
  pathInput: string,
  category?: string,
): TikHubEndpointPolicyMatch | undefined {
  normalizeMethod(methodInput);
  const { path, placeholders } = normalizePath(pathInput);
  if (
    path.startsWith(tikhubUserPathPrefix) ||
    (category !== undefined && !isEligibleTikHubEndpointCategory(category))
  ) {
    return undefined;
  }
  return { placeholders, requiredScope: requiredScopeForPath(path) };
}

export function assertTikHubEndpointEligible(
  methodInput: string,
  pathInput: string,
  category?: string,
): TikHubEndpointPolicyMatch {
  const match = matchTikHubEndpointPolicy(methodInput, pathInput, category);
  if (!match) {
    throw policyDenied();
  }
  return match;
}

export function assertResolvedTikHubEndpointEligible(
  methodInput: string,
  encodedPath: string,
): TikHubEndpointPolicyMatch {
  if (
    !encodedPath.startsWith("/api/v1/") ||
    encodedPath.includes("?") ||
    encodedPath.includes("#") ||
    encodedPath.includes("\\") ||
    encodedPath.includes("{") ||
    encodedPath.includes("}") ||
    hasTikHubControlCharacter(encodedPath)
  ) {
    throw invalidEndpointInput("resolved path contains a forbidden component or character");
  }

  const decodedSegments: string[] = [];
  for (const encodedSegment of encodedPath.split("/").slice(1)) {
    let segment: string;
    try {
      segment = decodeURIComponent(encodedSegment);
    } catch {
      throw invalidEndpointInput("resolved path contains invalid percent encoding");
    }
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("?") ||
      segment.includes("#") ||
      segment.includes("%") ||
      hasTikHubControlCharacter(segment)
    ) {
      throw invalidEndpointInput("resolved path contains an invalid segment");
    }
    decodedSegments.push(segment);
  }

  const match = matchTikHubEndpointPolicy(methodInput, `/${decodedSegments.join("/")}`);
  if (!match) {
    throw policyDenied();
  }
  return match;
}

function requiredScopeForPath(path: string): string {
  return `${path.split("/").slice(0, 5).join("/")}/`;
}

function normalizeMethod(methodInput: string): TikHubEndpointMethod {
  if (typeof methodInput !== "string") {
    throw invalidEndpointInput("method must be GET or POST");
  }
  const method = methodInput.trim().toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw invalidEndpointInput("method must be GET or POST");
  }
  return method;
}

function normalizePath(pathInput: string): { path: string; placeholders: string[] } {
  if (typeof pathInput !== "string" || !pathInput.startsWith("/api/v1/")) {
    throw invalidEndpointInput("path must be an absolute TikHub API v1 path");
  }
  if (
    pathInput.includes("://") ||
    pathInput.includes("?") ||
    pathInput.includes("#") ||
    pathInput.includes("\\") ||
    pathInput.includes("%") ||
    hasTikHubControlCharacter(pathInput)
  ) {
    throw invalidEndpointInput("path contains a forbidden URL component or character");
  }

  const segments = pathInput.split("/").slice(1);
  const placeholders: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw invalidEndpointInput("path contains an empty or dot segment");
    }
    const isPlaceholder = segment.startsWith("{") && segment.endsWith("}");
    if (isPlaceholder) {
      const name = segment.slice(1, -1);
      if (!isSafePathToken(name) || placeholders.includes(name)) {
        throw invalidEndpointInput("path contains an invalid or duplicate placeholder");
      }
      placeholders.push(name);
      continue;
    }
    if (segment.includes("{") || segment.includes("}") || !isSafePathToken(segment)) {
      throw invalidEndpointInput("path contains an invalid segment");
    }
  }
  return { path: pathInput, placeholders };
}

function isSafePathToken(value: string): boolean {
  if (value === "") {
    return false;
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUppercase = code >= 65 && code <= 90;
    const isLowercase = code >= 97 && code <= 122;
    if (!isDigit && !isUppercase && !isLowercase && character !== "_" && character !== "-") {
      return false;
    }
  }
  return true;
}

export function hasTikHubControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function invalidEndpointInput(message: string): TikHubRequestError {
  return new TikHubRequestError("invalid_input", message, 400);
}

function policyDenied(): TikHubRequestError {
  return new TikHubRequestError(
    "invalid_input",
    "TikHub account endpoints are unavailable through dynamic invocation",
    400,
  );
}
