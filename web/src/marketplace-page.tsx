import type { AppData, MarketplaceState, ProviderPreference } from "./model";
import type { ReactNode, SubmitEvent } from "react";

import { useTranslate } from "@embra/i18n/react";
import { CheckCircle2, Eye, EyeOff, Loader2, Store, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { apiDelete, apiPatch, apiPut } from "./api";
import { Badge, EmptyState, FormStatus, ProviderIcon } from "./shared-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MarketplacePageProps {
  data: AppData;
  onRefresh(): void;
}

export function MarketplacePage(props: MarketplacePageProps): ReactNode {
  const t = useTranslate();
  const marketplace = props.data.marketplace;
  const [discoveryUrl, setDiscoveryUrl] = useState(marketplace?.discoveryUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
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
      <MarketplaceSummary marketplace={marketplace} />

      <section className="marketplace-panel">
        <header className="marketplace-panel-header">
          <div>
            <h2>{t("marketplace.configuration.title")}</h2>
            <p>{t("marketplace.configuration.description")}</p>
          </div>
          {marketplace?.configured ? <Badge tone="success">{t("marketplace.configuration.configured")}</Badge> : null}
        </header>
        <form className="marketplace-form" onSubmit={(event) => void save(event)}>
          <Label className="marketplace-field">
            <span>{t("marketplace.configuration.discoveryUrl")}</span>
            <Input value={discoveryUrl} onChange={(event) => setDiscoveryUrl(event.target.value)} required />
            <small>{t("marketplace.configuration.discoveryHelp")}</small>
          </Label>
          <Label className="marketplace-field">
            <span>{t("marketplace.configuration.apiKey")}</span>
            <div className="marketplace-secret-input">
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={t(
                  marketplace?.configured
                    ? "marketplace.configuration.keepCurrentKey"
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
            <small>{t("marketplace.configuration.apiKeyHelp")}</small>
          </Label>
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
            {marketplace?.configured ? (
              confirmRemove ? (
                <div className="marketplace-remove-confirmation">
                  <span>{t("marketplace.configuration.removeConfirmation")}</span>
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
                  {t("marketplace.configuration.remove")}
                </Button>
              )
            ) : null}
          </div>
        </form>
      </section>

      <section className="marketplace-panel">
        <header className="marketplace-panel-header">
          <div>
            <h2>{t("marketplace.providers.title")}</h2>
            <p>{t("marketplace.providers.description")}</p>
          </div>
          {providers.length > 0 ? <Badge>{t("marketplace.providers.count", { count: providers.length })}</Badge> : null}
        </header>
        {providers.length === 0 ? (
          <EmptyState
            icon={<Store size={20} />}
            title={t("marketplace.providers.emptyTitle")}
            description={t("marketplace.providers.emptyDescription")}
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
