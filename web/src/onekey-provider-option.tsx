import type { MarketplaceState, ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ArrowRight, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { defaultMarketplaceDiscoveryUrl, isDefaultMarketplace } from "../../src/marketplace/default-marketplace";
import { Button } from "./components/ui/button";
import { loadDefaultMarketplaceCatalog } from "./default-marketplace-discovery";
import { isOneKeyPromotionHidden } from "./onekey-visibility";

interface OneKeyProviderOptionProps {
  marketplace?: MarketplaceState;
  provider: ProviderDefinition;
  connected: boolean;
}

export function OneKeyProviderOption({ marketplace, provider, connected }: OneKeyProviderOptionProps): ReactNode {
  const t = useTranslate();
  const [supported, setSupported] = useState(false);
  const officialMarketplace = isDefaultMarketplace(marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl);

  useEffect(() => {
    if (!officialMarketplace || connected || (isOneKeyPromotionHidden() && !marketplace?.configured)) return;
    const controller = new AbortController();
    void loadDefaultMarketplaceCatalog(controller.signal).then(
      (catalog) => setSupported(provider.actions.some((action) => catalog.actions.includes(action.id))),
      () => setSupported(false),
    );
    return () => controller.abort();
  }, [connected, marketplace?.configured, officialMarketplace, provider]);

  if (!officialMarketplace || connected || !supported || (isOneKeyPromotionHidden() && !marketplace?.configured))
    return null;

  return (
    <section className="provider-onekey-option" aria-labelledby="provider-onekey-title">
      <div className="provider-onekey-icon">
        <KeyRound size={20} aria-hidden="true" />
      </div>
      <div className="provider-onekey-copy">
        <span className="provider-onekey-eyebrow">OOMOL Key</span>
        <h3 id="provider-onekey-title">{t("providers.oneKey.title")}</h3>
        <p>{t("providers.oneKey.description", { name: provider.displayName })}</p>
        <small>{t("providers.oneKey.alternative")}</small>
      </div>
      <Button asChild>
        <Link to="/providers?onekey=1">
          {t(marketplace?.configured ? "providers.hostedAccess.manage" : "providers.oneKey.connect")}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
