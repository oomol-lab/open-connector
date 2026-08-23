import type { ProviderDefinition, ProviderScenario } from "./model";

export interface ProviderScenarioOption {
  id: Exclude<ProviderScenario, "other">;
  descriptionKey: string;
  featuredServices: readonly string[];
  titleKey: string;
}

export const providerScenarioOptions: readonly ProviderScenarioOption[] = [
  {
    id: "ai",
    descriptionKey: "providers.discovery.scenarios.ai.description",
    featuredServices: ["openai", "anthropic", "gemini", "deepseek"],
    titleKey: "providers.discovery.scenarios.ai.title",
  },
  {
    id: "cross-border-ecommerce",
    descriptionKey: "providers.discovery.scenarios.crossBorderEcommerce.description",
    featuredServices: ["shopify", "17track", "aftership", "shippo"],
    titleKey: "providers.discovery.scenarios.crossBorderEcommerce.title",
  },
  {
    id: "communication",
    descriptionKey: "providers.discovery.scenarios.communication.description",
    featuredServices: ["slack", "gmail", "discord", "telegram"],
    titleKey: "providers.discovery.scenarios.communication.title",
  },
  {
    id: "docs",
    descriptionKey: "providers.discovery.scenarios.docs.description",
    featuredServices: ["notion", "googledrive", "googledocs", "dropbox"],
    titleKey: "providers.discovery.scenarios.docs.title",
  },
  {
    id: "productivity",
    descriptionKey: "providers.discovery.scenarios.productivity.description",
    featuredServices: ["asana", "jira", "trello", "clickup"],
    titleKey: "providers.discovery.scenarios.productivity.title",
  },
  {
    id: "marketing",
    descriptionKey: "providers.discovery.scenarios.marketing.description",
    featuredServices: ["hubspot", "mailchimp", "googleads", "googleanalytics"],
    titleKey: "providers.discovery.scenarios.marketing.title",
  },
  {
    id: "data-storage",
    descriptionKey: "providers.discovery.scenarios.dataStorage.description",
    featuredServices: ["googlebigquery", "databricks", "algolia", "mongo_db_atlas_administration"],
    titleKey: "providers.discovery.scenarios.dataStorage.title",
  },
  {
    id: "developer",
    descriptionKey: "providers.discovery.scenarios.developer.description",
    featuredServices: ["github", "gitlab", "vercel", "cloudflareworker"],
    titleKey: "providers.discovery.scenarios.developer.title",
  },
];

export function providerScenario(provider: ProviderDefinition): ProviderScenario {
  return provider.scenario ?? "other";
}

export function filterProvidersByScenario(
  providers: ProviderDefinition[],
  scenario: ProviderScenario | "all",
): ProviderDefinition[] {
  if (scenario === "all") return providers;
  return providers.filter((provider) => providerScenario(provider) === scenario);
}

export function providerScenarioCounts(providers: ProviderDefinition[]): Map<ProviderScenario, number> {
  const counts = new Map<ProviderScenario, number>();
  for (const provider of providers) {
    const scenario = providerScenario(provider);
    counts.set(scenario, (counts.get(scenario) ?? 0) + 1);
  }
  return counts;
}

export function featuredProvidersForScenario(
  providers: ProviderDefinition[],
  option: ProviderScenarioOption,
): ProviderDefinition[] {
  const providersByService = new Map(providers.map((provider) => [compactService(provider.service), provider]));
  const featured = option.featuredServices
    .map((service) => providersByService.get(compactService(service)))
    .filter((provider): provider is ProviderDefinition => provider !== undefined);

  return featured.length > 0 ? featured : providers.slice(0, 4);
}

function compactService(service: string): string {
  return service
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "")
    .trim();
}
