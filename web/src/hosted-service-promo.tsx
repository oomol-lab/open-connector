import type { MouseEvent, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "./components/ui/button";

const dismissalKey = "oomol-connect.hosted-service-promo.dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(dismissalKey) === "true";
  } catch {
    // Hide the promotion when browser storage is unavailable, so dismissal stays reliable.
    return true;
  }
}

export function HostedServicePromo(): ReactNode {
  const t = useTranslate();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key === dismissalKey && event.newValue === "true") {
        setDismissed(true);
      }
    }
    window.addEventListener("storage", onStorage);
    // Catch a dismissal from another tab between the initial read and subscription.
    if (readDismissed()) setDismissed(true);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function dismiss(): void {
    setDismissed(true);
    try {
      localStorage.setItem(dismissalKey, "true");
    } catch {
      // Keep this session dismissed even if the browser rejects the write.
    }
  }

  function openMarketplace(event: MouseEvent<HTMLAnchorElement>): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    navigate("/marketplace");
  }

  if (dismissed) return null;

  return (
    <section className="hosted-service-promo" aria-labelledby="hosted-service-promo-title">
      <div className="hosted-service-promo-header">
        <p className="hosted-service-promo-greeting">{t("hostedPromo.title")}</p>
        <Button
          className="hosted-service-promo-close"
          variant="ghost"
          size="icon-xs"
          onClick={dismiss}
          aria-label={t("hostedPromo.dismiss")}
          title={t("hostedPromo.dismiss")}
        >
          <X size={14} />
        </Button>
      </div>
      <h2 id="hosted-service-promo-title">{t("hostedPromo.headline")}</h2>
      <p className="hosted-service-promo-description">{t("hostedPromo.description")}</p>
      <p className="hosted-service-promo-offer">{t("hostedPromo.offer")}</p>
      <Button asChild size="default" className="hosted-service-promo-link">
        <a href="https://console.oomol.com/api-key" target="_blank" rel="noopener noreferrer" onClick={openMarketplace}>
          {t("hostedPromo.cta")}
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </Button>
    </section>
  );
}
