import type { AuthDefinition, CredentialField, OAuthConfig, ProviderDefinition } from "./model";
import type { FormEvent, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { Settings, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiPut } from "./api";
import { CredentialInput } from "./credential-input";
import { FormStatus } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OAuthAppFormProps {
  provider: ProviderDefinition;
  auth: Extract<AuthDefinition, { type: "oauth2" }>;
  config?: OAuthConfig;
  onRefresh(): void;
  onSaved?(): void;
}

interface OAuthAppDialogProps extends OAuthAppFormProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function OAuthAppDialog(props: OAuthAppDialogProps): ReactNode {
  const t = useTranslate();
  const configured = props.config?.configured ?? false;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-[min(560px,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(560px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>
            {t(configured ? "oauthApps.dialog.editTitle" : "oauthApps.dialog.configureTitle", {
              name: props.provider.displayName,
            })}
          </DialogTitle>
          <DialogDescription>{props.provider.service}</DialogDescription>
        </DialogHeader>
        <OAuthAppForm
          provider={props.provider}
          auth={props.auth}
          config={props.config}
          onRefresh={props.onRefresh}
          onSaved={() => {
            props.onSaved?.();
            props.onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function OAuthAppForm(props: OAuthAppFormProps): ReactNode {
  const t = useTranslate();
  const configured = props.config?.configured ?? false;
  const clientConfigFields = useMemo(() => clientConfigFieldsFor(props.auth), [props.auth]);
  const [clientId, setClientId] = useState(() => props.config?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [extraValues, setExtraValues] = useState(() =>
    initialClientConfigFieldValues(clientConfigFields, props.config),
  );
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setClientId(props.config?.clientId ?? "");
    setClientSecret("");
    setExtraValues(initialClientConfigFieldValues(clientConfigFields, props.config));
    setStatus(null);
  }, [props.provider.service, props.config?.clientId, clientConfigFields]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus(t("providers.oauthClientSettings.saving"));
    try {
      const { extra, secretExtra } = splitClientConfigFieldValues(clientConfigFields, extraValues);
      await apiPut(`/api/oauth/configs/${props.provider.service}`, {
        clientId,
        clientSecret,
        extra,
        secretExtra,
      });
      setStatus(t("providers.oauthClientSettings.saved"));
      props.onRefresh();
      props.onSaved?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.oauthClientSettings.failed"));
    }
  }

  async function reset(): Promise<void> {
    setStatus(t("providers.oauthClientSettings.resetting"));
    try {
      await apiDelete(`/api/oauth/configs/${props.provider.service}`);
      setStatus(t("providers.oauthClientSettings.reset"));
      props.onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("providers.oauthClientSettings.resetFailed"));
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {props.config?.expectedRedirectUri ? (
        <Label className="field">
          <span>{t("providers.oauthClientSettings.callbackUrl")}</span>
          <Input className="font-mono text-xs" value={props.config.expectedRedirectUri} readOnly />
        </Label>
      ) : null}
      <Label className="field">
        <span>{t("providers.oauthClientSettings.clientId")}</span>
        <Input value={clientId} onChange={(event) => setClientId(event.target.value)} required />
      </Label>
      {props.auth.tokenEndpointAuthMethod !== "none" ? (
        <Label className="field">
          <span>{t("providers.oauthClientSettings.clientSecret")}</span>
          <Input
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            required
          />
          {configured ? <small>{t("providers.oauthClientSettings.storedSecretHint")}</small> : null}
        </Label>
      ) : null}
      {clientConfigFields.map((field) => (
        <CredentialInput
          key={field.key}
          field={field}
          value={extraValues[field.key] ?? ""}
          onChange={(value) => setExtraValues((previous) => ({ ...previous, [field.key]: value }))}
        />
      ))}
      <div className="button-row">
        <Button type="submit">
          <Settings size={16} />
          {t(configured ? "providers.buttons.updateOAuthClient" : "providers.buttons.saveOAuthClient")}
        </Button>
        {configured ? (
          <Button variant="outline" type="button" onClick={() => void reset()}>
            <Trash2 size={16} />
            {t("providers.buttons.resetOAuthClient")}
          </Button>
        ) : null}
      </div>
      {status ? <FormStatus message={status} /> : null}
    </form>
  );
}

export function clientConfigFieldsFor(auth: AuthDefinition): CredentialField[] {
  return auth.type === "oauth2" ? (auth.clientConfigFields ?? []) : [];
}

export function initialClientConfigFieldValues(
  fields: CredentialField[],
  config: OAuthConfig | undefined,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.key] = config?.extra?.[field.key] ?? field.defaultValue ?? "";
  }
  return values;
}

export interface ClientConfigFieldValues {
  extra: Record<string, string>;
  secretExtra: Record<string, string>;
}

export function splitClientConfigFieldValues(
  fields: CredentialField[],
  values: Record<string, string>,
): ClientConfigFieldValues {
  const extra: Record<string, string> = {};
  const secretExtra: Record<string, string> = {};
  for (const field of fields) {
    const target = field.location === "secretExtra" ? secretExtra : extra;
    target[field.key] = values[field.key] ?? "";
  }
  return { extra, secretExtra };
}
