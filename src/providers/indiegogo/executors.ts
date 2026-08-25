import type { ProviderActionHandlers, ProviderActionSources, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  mapProviderActionSources,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

interface Context {
  fetcher: typeof fetch;
}

const paths: ProviderActionSources<"indiegogo", string> = {
  get_creator: "/api/public/creators/getCreator",
  list_active_crowdfunding_projects: "/api/public/projects/getActiveCrowdfundingProjects",
  get_crowdfunding_project: "/api/public/projects/getCrowdfundingProject",
};
async function execute(input: Record<string, unknown>, context: Context, name: string, path: string): Promise<unknown> {
  const url = new URL(path, "https://www.indiegogo.com");
  if (input.urlName !== undefined) url.searchParams.set("urlName", String(input.urlName));
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "user-agent": providerUserAgent },
    redirect: "error",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Indiegogo request failed with status ${response.status}`, payload);
  return name === "list_active_crowdfunding_projects"
    ? { projects: payload }
    : name === "get_creator"
      ? { creator: payload }
      : { project: payload };
}

const handlers: ProviderActionHandlers<"indiegogo", ProviderRuntimeHandler<Context>> = mapProviderActionSources(
  "indiegogo",
  paths,
  (name, path) => (input, context) => execute(input, context, name, path),
);

export const executors: import("../../core/types.ts").ProviderExecutors = defineProviderExecutors<Context>({
  service: "indiegogo",
  createContext: (_context, fetcher) => ({ fetcher }),
  skipDnsValidation: true,
  handlers,
});
