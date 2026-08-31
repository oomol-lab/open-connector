import type { OomolConsoleEndpoints } from "./request.ts";

import { logger } from "../../server/logger.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requestOomolConsole } from "./request.ts";

const userSummaryCacheMaxEntries = 10_000;
const userSummaryCacheTtlMs = 30 * 60 * 1000;

interface UserSummary {
  nickname: string;
  username: string;
  avatarUrl: string;
}

interface CachedUserSummary {
  expiresAt: number;
  value: UserSummary;
}

export interface OomolTeamMemberIdentity {
  userId: string;
  userType?: "user" | "service_account";
  name?: string;
}

export interface OomolConsoleMemberDirectory {
  enrichMembers<TMember extends OomolTeamMemberIdentity>(
    members: readonly TMember[],
    apiKey: string,
    fetcher: typeof fetch,
  ): Promise<TMember[]>;
}

export function createOomolConsoleMemberDirectory(endpoints: OomolConsoleEndpoints): OomolConsoleMemberDirectory {
  const userSummaryCache = new Map<string, CachedUserSummary>();

  return {
    async enrichMembers<TMember extends OomolTeamMemberIdentity>(
      members: readonly TMember[],
      apiKey: string,
      fetcher: typeof fetch,
    ) {
      const unresolvedUserIds = uniqueIds(
        members
          .filter((member) => member.userType !== "service_account" && !displayName(member.name))
          .map((member) => member.userId),
      );
      const unresolvedServiceAccountIds = uniqueIds(
        members
          .filter((member) => member.userType === "service_account" && !displayName(member.name))
          .map((member) => member.userId),
      );

      const [userSummaries, serviceAccountNames] = await Promise.all([
        loadUserSummaries(unresolvedUserIds, apiKey, fetcher, endpoints, userSummaryCache).catch((error: unknown) => {
          logger.warn(enrichmentErrorLog(error), "OOMOL Console user-summary enrichment failed");
          return new Map<string, UserSummary>();
        }),
        loadServiceAccountNames(unresolvedServiceAccountIds, apiKey, fetcher, endpoints).catch((error: unknown) => {
          logger.warn(enrichmentErrorLog(error), "OOMOL Console service-account enrichment failed");
          return new Map<string, string>();
        }),
      ]);

      return members.map((member) => {
        const existingName = displayName(member.name);
        const name =
          member.userType === "service_account"
            ? (serviceAccountNames.get(member.userId) ?? existingName)
            : (existingName ?? summaryName(userSummaries.get(member.userId)));
        return name === undefined ? { ...member } : { ...member, name };
      });
    },
  };
}

async function loadUserSummaries(
  userIds: string[],
  apiKey: string,
  fetcher: typeof fetch,
  endpoints: OomolConsoleEndpoints,
  cache: Map<string, CachedUserSummary>,
) {
  const summaries = new Map<string, UserSummary>();
  const missingUserIds: string[] = [];
  for (const userId of userIds) {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      summaries.set(userId, cached.value);
    } else {
      cache.delete(userId);
      missingUserIds.push(userId);
    }
  }
  if (missingUserIds.length === 0) {
    return summaries;
  }

  const payload = asRecord(
    await requestOomolConsole({
      endpoints,
      endpoint: "api",
      path: "/v1/users/summaries",
      apiKey,
      fetcher,
      query: { user_ids: missingUserIds },
    }),
  );
  for (const userId of missingUserIds) {
    const summary = parseUserSummary(payload[userId]);
    if (summary) {
      summaries.set(userId, summary);
      cache.set(userId, { expiresAt: Date.now() + userSummaryCacheTtlMs, value: summary });
      if (cache.size > userSummaryCacheMaxEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
    }
  }
  return summaries;
}

async function loadServiceAccountNames(
  serviceAccountIds: string[],
  apiKey: string,
  fetcher: typeof fetch,
  endpoints: OomolConsoleEndpoints,
) {
  const names = new Map<string, string>();
  if (serviceAccountIds.length === 0) {
    return names;
  }
  const payload = asRecord(
    await requestOomolConsole({
      endpoints,
      endpoint: "api",
      path: "/v1/service-accounts",
      apiKey,
      fetcher,
    }),
  );
  const requestedIds = new Set(serviceAccountIds);
  for (const value of asArray(payload.service_accounts)) {
    const serviceAccount = asRecord(value);
    const id = displayName(serviceAccount.id);
    const name = displayName(serviceAccount.name);
    if (id && name && requestedIds.has(id)) {
      names.set(id, name);
    }
  }
  return names;
}

function parseUserSummary(value: unknown): UserSummary | undefined {
  const summary = asRecord(value);
  const nickname = displayName(summary.nickname) ?? "";
  const username = displayName(summary.username) ?? "";
  if (!nickname && !username) {
    return undefined;
  }
  return {
    nickname,
    username,
    avatarUrl: typeof summary.url === "string" ? summary.url : "",
  };
}

function summaryName(summary: UserSummary | undefined) {
  return summary ? summary.nickname || summary.username : undefined;
}

function displayName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values));
}

function enrichmentErrorLog(error: unknown) {
  return error instanceof ProviderRequestError ? { status: error.status } : { status: undefined };
}
