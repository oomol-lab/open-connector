import type { DefaultMarketplaceDiscovery } from "./default-marketplace-discovery";
import type { ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Loader2, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "./components/ui/button";
import { loadDefaultMarketplaceCatalog } from "./default-marketplace-discovery";
import { Badge, EmptyState, ProviderIcon } from "./shared-ui";

interface DefaultMarketplaceCatalogProps {
  providers: ProviderDefinition[];
  discoveryUrl: string;
}

// Default promotions apply only to the named models, never to custom marketplaces.
const promotedModels: Record<string, string[]> = {
  kling: ["Kling 3.0"],
  minimax: ["MiniMax H3"],
  seedance: ["Seedance 2.0", "Seedance 2.5"],
};
const promotedServices = Object.keys(promotedModels);

export function DefaultMarketplaceCatalog({ providers, discoveryUrl }: DefaultMarketplaceCatalogProps): ReactNode {
  const t = useTranslate();
  const [catalog, setCatalog] = useState<DefaultMarketplaceDiscovery>();
  const [failure, setFailure] = useState<Error>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailure(undefined);
    const controller = new AbortController();
    void loadDefaultMarketplaceCatalog(discoveryUrl, controller.signal).then(
      (value) => {
        if (active) setCatalog(value);
      },
      (error: unknown) => {
        if (active) {
          setFailure(error instanceof Error ? error : new Error());
        }
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, discoveryUrl]);

  const available = new Set(catalog?.actions);
  const rows = providers
    .filter((provider) => provider.actions.some((action) => available.has(action.id)))
    .sort((a, b) => {
      const aRank = promotedServices.indexOf(a.service);
      const bRank = promotedServices.indexOf(b.service);
      return (
        (aRank < 0 ? promotedServices.length : aRank) - (bRank < 0 ? promotedServices.length : bRank) ||
        a.displayName.localeCompare(b.displayName)
      );
    });

  return (
    <section className="marketplace-panel">
      <header className="marketplace-panel-header">
        <div>
          <h2>{t("marketplace.default.title")}</h2>
          <p>{t("marketplace.default.description")}</p>
        </div>
        {catalog ? <Badge>{t("marketplace.providers.count", { count: rows.length })}</Badge> : null}
      </header>
      {failure ? (
        <div className="marketplace-catalog-feedback" role="status">
          <p>{t("marketplace.default.failed")}</p>
          {failure.message ? <p className="marketplace-catalog-error">{failure.message}</p> : null}
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {t("marketplace.default.retry")}
          </Button>
        </div>
      ) : !catalog ? (
        <div className="marketplace-catalog-feedback" role="status">
          <Loader2 className="spin" size={16} aria-hidden="true" />
          {t("marketplace.default.loading")}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Store size={20} />}
          title={t("marketplace.default.empty")}
          description={t("marketplace.default.description")}
          density="compact"
        />
      ) : (
        <div className="marketplace-provider-list">
          {rows.map((provider) => {
            const promoted = promotedServices.includes(provider.service);
            const path = `/providers/${encodeURIComponent(provider.service)}`;
            return (
              <div className="marketplace-provider-row marketplace-default-row" key={provider.service}>
                <ProviderIcon provider={provider} />
                <div className="marketplace-default-copy">
                  <Link className="marketplace-provider-copy" to={path}>
                    <strong>{provider.displayName}</strong>
                    <span>
                      {promoted
                        ? t(`marketplace.default.descriptions.${provider.service}`)
                        : provider.description || t("marketplace.default.browseDescription")}
                    </span>
                  </Link>
                  {promoted ? (
                    <div className="marketplace-default-tags">
                      {promotedModels[provider.service].map((model) => (
                        <span className="marketplace-model-tag" key={model}>
                          {model}
                        </span>
                      ))}
                      <Badge tone="success">{t(`marketplace.default.offers.${provider.service}`)}</Badge>
                    </div>
                  ) : null}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={path}>{t("marketplace.default.view")}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {catalog ? (
        <footer className="marketplace-catalog-footer">
          {catalog.name} · {t("marketplace.default.disconnected")}
        </footer>
      ) : null}
    </section>
  );
}
