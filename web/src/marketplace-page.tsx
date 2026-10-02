import type { AppData, MarketplaceState, ProviderPreference } from "./model";
import type { ReactNode, SubmitEvent } from "react";

import { useTranslate } from "@embra/i18n/react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Store,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { defaultMarketplaceDiscoveryUrl, isDefaultMarketplace } from "../../src/marketplace/default-marketplace";
import { apiDelete, apiPatch, apiPut } from "./api";
import { DefaultMarketplaceCatalog } from "./default-marketplace-catalog";
import { Badge, EmptyState, FormStatus, ProviderIcon } from "./shared-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MarketplacePageProps {
  data: AppData;
  embedded?: boolean;
  onConnected?(): void;
  onCancel?(): void;
  onRefresh(): void;
}

export function MarketplacePage(props: MarketplacePageProps): ReactNode {
  const t = useTranslate();
  const marketplace = props.data.marketplace;
  const [discoveryUrl, setDiscoveryUrl] = useState(marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(
    !isDefaultMarketplace(marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl),
  );
  const officialMarketplace = isDefaultMarketplace(discoveryUrl);
  const providers = useMemo(
    () =>
      (props.data.providerPreferences ?? []).flatMap((preference) => {
        const provider = props.data.providers.find((item) => item.service === preference.service);
        return provider ? [{ preference, provider }] : [];
      }),
    [props.data.providerPreferences, props.data.providers],
  );

  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      await apiPut("/api/marketplace", { discoveryUrl, apiKey: apiKey || undefined, enabled: true });
      setApiKey("");
      setMessage(t("marketplace.messages.saved"));
      props.onRefresh();
      props.onConnected?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("marketplace.messages.saveFailed"));
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<void> {
    setPending(true);
    setMessage(undefined);
    try {
      await apiDelete("/api/marketplace");
      setApiKey("");
      setConfirmRemove(false);
      setMessage(t("marketplace.messages.removed"));
      props.onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("marketplace.messages.removeFailed"));
    } finally {
      setPending(false);
    }
  }

  async function toggleProvider(preference: ProviderPreference): Promise<void> {
    setMessage(undefined);
    try {
      await apiPatch(`/api/provider-preferences/${encodeURIComponent(preference.service)}`, {
        enabled: !preference.enabled,
      });
      props.onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("marketplace.messages.providerFailed"));
    }
  }

  return (
    <div className="marketplace-page">
      {props.embedded ? null : officialMarketplace ? (
        <section className="marketplace-onekey-hero">
          <div className="marketplace-onekey-copy">
            <span className="marketplace-onekey-eyebrow">OOMOL Key</span>
            <h2>{t("marketplace.oneKey.headline")}</h2>
            <p>{t("marketplace.oneKey.description")}</p>
            <div className="marketplace-onekey-actions">
              <Button asChild>
                <a href="https://console.oomol.com/api-key" target="_blank" rel="noopener noreferrer">
                  {t("marketplace.oneKey.getKey")}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="#marketplace-connect">{t("marketplace.oneKey.haveKey")}</a>
              </Button>
            </div>
          </div>
          <div className="marketplace-onekey-benefits" aria-label={t("marketplace.oneKey.benefitsLabel")}>
            <div>
              <strong>01</strong>
              <span>{t("marketplace.oneKey.benefitSetup")}</span>
            </div>
            <div>
              <strong>02</strong>
              <span>{t("marketplace.oneKey.benefitChoice")}</span>
            </div>
            <div>
              <strong>03</strong>
              <span>{t("marketplace.oneKey.benefitPricing")}</span>
            </div>
          </div>
        </section>
      ) : (
        <MarketplaceSummary marketplace={marketplace} />
      )}

      <section className="marketplace-panel" id="marketplace-connect">
        {!props.embedded ? (
          <header className="marketplace-panel-header">
            <div>
              <h2>{t(officialMarketplace ? "marketplace.oneKey.connectTitle" : "marketplace.configuration.title")}</h2>
              <p>
                {t(
                  officialMarketplace
                    ? "marketplace.oneKey.connectDescription"
                    : "marketplace.configuration.description",
                )}
              </p>
            </div>
            {marketplace?.configured ? <Badge tone="success">{t("marketplace.configuration.configured")}</Badge> : null}
          </header>
        ) : null}
        <form className="marketplace-form" onSubmit={(event) => void save(event)}>
          <div className="marketplace-field">
            <div className="marketplace-field-heading">
              <Label htmlFor="marketplace-api-key">
                {t(officialMarketplace ? "marketplace.oneKey.keyLabel" : "marketplace.configuration.apiKey")}
              </Label>
              {officialMarketplace ? (
                <a
                  className="marketplace-get-key"
                  href="https://console.oomol.com/api-key"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("marketplace.oneKey.getKey")} <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <div className="marketplace-secret-input">
              <Input
                id="marketplace-api-key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={t(
                  marketplace?.configured
                    ? "marketplace.configuration.keepCurrentKey"
                    : officialMarketplace
                      ? "marketplace.oneKey.keyPlaceholder"
                      : "marketplace.configuration.apiKeyPlaceholder",
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t(
                  showApiKey ? "marketplace.configuration.hideApiKey" : "marketplace.configuration.showApiKey",
                )}
                onClick={() => setShowApiKey((value) => !value)}
              >
                {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </Button>
            </div>
            <small>
              {t(officialMarketplace ? "marketplace.oneKey.keyHelp" : "marketplace.configuration.apiKeyHelp")}
            </small>
          </div>
          <details
            className="marketplace-advanced"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary>
              {t("marketplace.oneKey.advanced")} <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <Label className="marketplace-field">
              <span>{t("marketplace.configuration.discoveryUrl")}</span>
              <Input
                type="url"
                value={discoveryUrl}
                onChange={(event) => setDiscoveryUrl(event.target.value)}
                required
                spellCheck={false}
              />
              <small>{t("marketplace.configuration.discoveryHelp")}</small>
            </Label>
          </details>
          {message ? <FormStatus message={message} /> : null}
          {marketplace?.error ? (
            <Alert variant="destructive">
              <TriangleAlert size={16} />
              <AlertDescription>{marketplace.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="marketplace-form-actions">
            <Button type="submit" disabled={pending || !discoveryUrl.trim() || (!apiKey && !marketplace?.configured)}>
              {pending ? <Loader2 className="spin" size={15} /> : null}
              {t(
                marketplace?.configured ? "marketplace.configuration.revalidate" : "marketplace.configuration.connect",
              )}
            </Button>
            {props.onCancel ? (
              <Button type="button" variant="outline" disabled={pending} onClick={props.onCancel}>
                {t("common.cancel")}
              </Button>
            ) : null}
            {marketplace?.configured ? (
              confirmRemove ? (
                <div className="marketplace-remove-confirmation">
                  <span>
                    {t(
                      officialMarketplace
                        ? "providers.hostedAccess.removeHelp"
                        : "marketplace.configuration.removeConfirmation",
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => void remove()}
                  >
                    {t("marketplace.configuration.confirmRemove")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>
                    {t("common.close")}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmRemove(true)}>
                  <Trash2 size={15} />
                  {t("providers.hostedAccess.removeKey")}
                </Button>
              )
            ) : null}
          </div>
        </form>
      </section>

      {props.embedded && !marketplace?.configured ? null : !marketplace?.configured ? (
        isDefaultMarketplace(marketplace?.discoveryUrl ?? defaultMarketplaceDiscoveryUrl) ? (
          <DefaultMarketplaceCatalog providers={props.data.providers} />
        ) : null
      ) : (
        <section className="marketplace-panel">
          <header className="marketplace-panel-header">
            <div>
              <h2>{t("marketplace.providers.title")}</h2>
              <p>{t("marketplace.providers.description")}</p>
            </div>
            {providers.length > 0 ? (
              <Badge>{t("marketplace.providers.count", { count: providers.length })}</Badge>
            ) : null}
          </header>
          {providers.length === 0 ? (
            <EmptyState
              icon={<Store size={20} />}
              title={t(
                marketplace.status === "available"
                  ? "marketplace.providers.emptyTitle"
                  : `marketplace.status.${marketplace.status}`,
              )}
              description={t(
                marketplace.status === "available"
                  ? "marketplace.providers.emptyDescription"
                  : "marketplace.configuration.reconnect",
              )}
              density="compact"
            />
          ) : (
            <div className="marketplace-provider-list">
              {providers.map(({ preference, provider }) => (
                <div className="marketplace-provider-row" key={preference.service}>
                  <ProviderIcon provider={provider} />
                  <Link className="marketplace-provider-copy" to={`/providers/${encodeURIComponent(provider.service)}`}>
                    <strong>{provider.displayName}</strong>
                    <span>{t("marketplace.providers.actionCount", { count: provider.actions.length })}</span>
                  </Link>
                  <Badge tone={preference.enabled ? "success" : undefined}>
                    {t(preference.enabled ? "marketplace.providers.enabled" : "marketplace.providers.disabled")}
                  </Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => void toggleProvider(preference)}>
                    {t(preference.enabled ? "marketplace.providers.disable" : "marketplace.providers.enable")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MarketplaceSummary(props: { marketplace?: MarketplaceState }): ReactNode {
  const t = useTranslate();
  const marketplace = props.marketplace;
  const available = marketplace?.status === "available";
  return (
    <section className="marketplace-summary">
      <div className="marketplace-summary-icon">
        <Store size={20} />
      </div>
      <div className="marketplace-summary-copy">
        <div className="marketplace-summary-title">
          <h2 title={marketplace?.marketplace?.id}>
            {marketplace?.marketplace?.name ?? t("marketplace.summary.title")}
          </h2>
          <Badge tone={available ? "success" : marketplace?.status === "auth_error" ? "error" : undefined}>
            {available ? <CheckCircle2 size={12} /> : null}
            {t(`marketplace.status.${marketplace?.status ?? "disabled"}`)}
          </Badge>
          {marketplace?.marketplace?.pricing ? (
            <Badge>{t(`marketplace.pricing.${marketplace.marketplace.pricing}`)}</Badge>
          ) : null}
        </div>
        <p>{t("marketplace.summary.description")}</p>
      </div>
      <div className="marketplace-summary-metrics">
        <div>
          <strong>{marketplace?.compatibleProviderCount ?? 0}</strong>
          <span>{t("marketplace.summary.providers")}</span>
        </div>
        <div>
          <strong>{marketplace?.compatibleActionCount ?? 0}</strong>
          <span>{t("marketplace.summary.actions")}</span>
        </div>
      </div>
    </section>
  );
}
