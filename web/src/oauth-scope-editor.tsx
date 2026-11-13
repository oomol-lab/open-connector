import type { OAuthAuthorizationOption } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useEffect, useState } from "react";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";
import { normalizeOAuthScopes, toggleOAuthScope } from "./oauth-scopes";

interface OAuthScopeSelection {
  requestedScopes: string[] | undefined;
  scopes: string[];
  selectedScopes: string[];
  custom: boolean;
  setCustom(enabled: boolean): void;
  setScopes(scopes: string[]): void;
  toggleScope(scope: string, selected: boolean): void;
}

interface OAuthScopeEditorProps {
  options: OAuthAuthorizationOption[] | undefined;
  selection: OAuthScopeSelection;
}

export function useOAuthScopeSelection(defaultScopes: string[] | undefined): OAuthScopeSelection {
  const [requestedScopes, setScopes] = useState<string[] | undefined>();
  const [custom, setCustom] = useState(false);
  const scopes = requestedScopes ?? defaultScopes ?? [];
  useEffect(() => {
    setScopes(undefined);
    setCustom(false);
  }, [defaultScopes]);
  return {
    requestedScopes,
    scopes,
    selectedScopes: normalizeOAuthScopes(scopes),
    custom,
    setCustom(enabled) {
      setCustom(enabled);
      setScopes(enabled ? [...scopes] : undefined);
    },
    setScopes,
    toggleScope(scope, selected) {
      setScopes((requested) => toggleOAuthScope({ defaults: defaultScopes ?? [], requested, scope, selected, custom }));
    },
  };
}

export function OAuthScopeEditor({ options, selection }: OAuthScopeEditorProps): ReactNode {
  const t = useTranslate();
  return (
    <div className="form-grid">
      {options?.length ? (
        <fieldset className="form-grid">
          <legend>{t("providers.oauthClientSettings.additionalScopes")}</legend>
          {options.map((option) => (
            <label key={option.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={option.required || selection.selectedScopes.includes(option.id)}
                disabled={option.required}
                onChange={(event) => selection.toggleScope(option.id, event.target.checked)}
              />
              <span>
                <strong>{option.label}</strong>
                <small className="block text-muted-foreground">{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <details open={selection.custom}>
        <summary>{t("providers.oauthClientSettings.advancedScopes")}</summary>
        <div className="form-grid">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!selection.custom}
              onChange={(event) => selection.setCustom(!event.target.checked)}
            />
            {t("providers.oauthClientSettings.useDefaultScopes")}
          </label>
          {selection.custom ? (
            <Label>
              <span>{t("providers.oauthClientSettings.customScopes")}</span>
              <Textarea
                value={selection.scopes.join("\n")}
                onChange={(event) =>
                  selection.setScopes(event.target.value === "" ? [] : event.target.value.split("\n"))
                }
              />
            </Label>
          ) : null}
        </div>
      </details>
    </div>
  );
}
