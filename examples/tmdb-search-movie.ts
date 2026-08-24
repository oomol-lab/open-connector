import type { ExecutionContext, ResolvedCredential } from "../src/core/types.ts";

import { executors } from "../src/providers/tmdb/executors.ts";

const accessToken = process.env.TMDB_ACCESS_TOKEN?.trim();

async function main(): Promise<void> {
  if (!accessToken) {
    console.log("Skip TMDB example: missing TMDB_ACCESS_TOKEN.");
    return;
  }

  const resolvedCredential: ResolvedCredential = {
    authType: "api_key",
    apiKey: accessToken,
    values: { apiKey: accessToken },
    profile: {
      accountId: "api_key",
      displayName: "TMDB API Read Access Token",
      grantedScopes: [],
    },
    metadata: {},
  };
  const context: ExecutionContext = {
    async getCredential(service) {
      return service === "tmdb" ? resolvedCredential : undefined;
    },
  };

  const result = await executors["tmdb.search_movie"]!(
    {
      query: process.env.TMDB_SEARCH_QUERY?.trim() || "Inception",
    },
    context,
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

await main();
