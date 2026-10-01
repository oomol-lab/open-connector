import type { DefaultMarketplaceDiscovery } from "./default-marketplace-discovery";
import type { ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ChevronRight, Loader2, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { loadDefaultMarketplaceCatalog } from "./default-marketplace-discovery";
import { Badge, EmptyState, ProviderIcon } from "./shared-ui";

interface DefaultMarketplaceCatalogProps {
  providers: ProviderDefinition[];
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
  connected,
  embedded,
}: DefaultMarketplaceCatalogProps): ReactNode {
  const t = useTranslate();
  const [catalog, setCatalog] = useState<DefaultMarketplaceDiscovery>();
  const [failure, setFailure] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition>();

  useEffect(() => {
    let active = true;
    setFailure(undefined);
    const controller = new AbortController();
    void loadDefaultMarketplaceCatalog(controller.signal).then(
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
  }, [attempt]);

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
            const actions = provider.actions.filter((action) => available.has(action.id));
            return (
              <Button
                type="button"
                variant="ghost"
                className="marketplace-service-card"
                key={provider.service}
                onClick={() => setSelectedProvider(provider)}
              >
                <ProviderIcon provider={provider} />
                <span className="marketplace-default-copy">
                  <span className="marketplace-service-heading">
                    <span className="marketplace-service-title">
                      <strong>{provider.displayName}</strong>
                      {promoted ? (
                        <span title={promotedModels[provider.service].join(" · ")}>
                          <Badge tone="success">{t(`marketplace.default.offers.${provider.service}`)}</Badge>
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </span>
                  <span className="marketplace-service-count">
                    {t("marketplace.default.supportedActions", { count: actions.length })}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      )}
      {catalog ? (
        <footer className="marketplace-catalog-footer">
          {catalog.name} · {t(connected ? "marketplace.default.connected" : "marketplace.default.disconnected")}
        </footer>
      ) : null}
      <Dialog
        open={selectedProvider != null}
        onOpenChange={(open) => {
          if (!open) setSelectedProvider(undefined);
        }}
      >
        <DialogContent className="onekey-operations-panel">
          <DialogHeader>
            <DialogTitle>{selectedProvider?.displayName}</DialogTitle>
            <DialogDescription>{t("marketplace.default.description")}</DialogDescription>
          </DialogHeader>
          {selectedProvider ? (
            <>
              {promotedModels[selectedProvider.service] ? (
                <div className="marketplace-operation-offer">
                  <Badge tone="success">{t(`marketplace.default.offers.${selectedProvider.service}`)}</Badge>
                  <span>{promotedModels[selectedProvider.service].join(" · ")}</span>
                </div>
              ) : null}
              <ul className="marketplace-operation-list">
                {selectedProvider.actions
                  .filter((action) => available.has(action.id))
                  .map((action) => (
                    <li key={action.id}>
                      <Link to={`/actions/${encodeURIComponent(action.id)}`}>
                        <strong>{action.name}</strong>
                        <span>{action.description}</span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
              </ul>
              <Button asChild variant="outline">
                <Link to={`/providers/${encodeURIComponent(selectedProvider.service)}`}>
                  {t("marketplace.default.providerDetails")}
                </Link>
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
