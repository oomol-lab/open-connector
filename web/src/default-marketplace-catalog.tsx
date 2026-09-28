import type { DefaultMarketplaceDiscovery } from "./default-marketplace-discovery";
import type { ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ChevronRight, Loader2, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "./components/ui/button";
import { loadDefaultMarketplaceCatalog } from "./default-marketplace-discovery";
import { Badge, EmptyState, ProviderIcon } from "./shared-ui";

interface DefaultMarketplaceCatalogProps {
  providers: ProviderDefinition[];
  discoveryUrl: string;
  connected?: boolean;
  embedded?: boolean;
}

// Default promotions apply only to the named models, never to custom marketplaces.
const promotedModels: Record<string, string[]> = {
  kling: ["Kling 3.0"],
  minimax: ["MiniMax H3"],
  seedance: ["Seedance 2.0", "Seedance 2.5"],
};
const promotedServices = Object.keys(promotedModels);

export function DefaultMarketplaceCatalog({
  providers,
  discoveryUrl,
  connected,
  embedded,
}: DefaultMarketplaceCatalogProps): ReactNode {
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
    <section
      className={
        embedded
          ? "marketplace-panel marketplace-preview-panel marketplace-preview-embedded"
          : "marketplace-panel marketplace-preview-panel"
      }
      id={embedded ? "onekey-supported-features" : undefined}
    >
      <header className="marketplace-panel-header">
        <div>
          {embedded ? null : <h2>{t("marketplace.default.title")}</h2>}
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
        <div className="marketplace-default-grid">
          {rows.map((provider) => {
            const promoted = promotedServices.includes(provider.service);
            const path = `/providers/${encodeURIComponent(provider.service)}`;
            const actions = provider.actions.filter((action) => available.has(action.id));
            return (
              <div className="marketplace-service-card" key={provider.service}>
                <ProviderIcon provider={provider} />
                <div className="marketplace-default-copy">
                  <Link className="marketplace-service-heading" to={path}>
                    <span className="marketplace-service-title">
                      <strong>{provider.displayName}</strong>
                      {promoted ? (
                        <span title={promotedModels[provider.service].join(" · ")}>
                          <Badge tone="success">{t(`marketplace.default.offers.${provider.service}`)}</Badge>
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                  <details className="marketplace-supported-actions">
                    <summary>{t("marketplace.default.supportedActions", { count: actions.length })}</summary>
                    <ul>
                      {actions.map((action) => (
                        <li key={action.id}>
                          <Link to={`/actions/${encodeURIComponent(action.id)}`}>
                            {action.description || action.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {catalog ? (
        <footer className="marketplace-catalog-footer">
          {catalog.name} · {t(connected ? "marketplace.default.connected" : "marketplace.default.disconnected")}
        </footer>
      ) : null}
    </section>
  );
}
