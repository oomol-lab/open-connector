import { optionalRecord, optionalString } from "../core/cast.ts";
import { ProviderRequestError } from "./provider-runtime.ts";

export interface CloudflareCurrentUser {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export function readCloudflareCurrentUser(value: unknown): CloudflareCurrentUser {
  const user = optionalRecord(value);
  if (!user) {
    throw new ProviderRequestError(502, "cloudflare user response is invalid");
  }
  const userId = optionalString(user.id);
  if (!userId) {
    throw new ProviderRequestError(502, "cloudflare user response is missing id");
  }
  return {
    userId,
    email: optionalString(user.email),
    firstName: optionalString(user.first_name),
    lastName: optionalString(user.last_name),
    username: optionalString(user.username),
  };
}

export function cloudflareCurrentUserDisplayName(user: CloudflareCurrentUser, fallback: string): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || user.email || fallback;
}
