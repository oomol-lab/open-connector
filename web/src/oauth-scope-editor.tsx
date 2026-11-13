import type { OAuthAuthorizationOption } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Label } from "./components/ui/label";
import { StringArrayInput } from "./components/ui/string-array-input";
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
  requiredScopes?: string[];
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

export function OAuthScopeEditor({ options, selection, requiredScopes }: OAuthScopeEditorProps): ReactNode {
  const t = useTranslate();
  const id = useId();
  const showBasicPermissions =
    selection.custom && selection.selectedScopes.length === 0 && Boolean(requiredScopes?.length);
  return (
    <div className="grid min-w-0 gap-4">
      {options?.length ? (
        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-medium">{t("providers.oauthClientSettings.additionalScopes")}</legend>
          <div className="grid gap-4">
            {options.map((option) => (
              <div key={option.id} className="flex items-start gap-3">
                <input
                  id={`${id}-${option.id}`}
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={option.required || selection.selectedScopes.includes(option.id)}
                  disabled={option.required}
                  aria-describedby={`${id}-${option.id}-description`}
                  onChange={(event) => selection.toggleScope(option.id, event.target.checked)}
                />
                <div className="grid min-w-0 flex-1 gap-1">
                  <Label htmlFor={`${id}-${option.id}`} className="leading-snug">
                    {option.label}
                  </Label>
                  <p
                    id={`${id}-${option.id}-description`}
                    className="text-sm leading-normal wrap-break-word text-muted-foreground"
                  >
                    {option.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      <details className="group min-w-0">
        <summary className="flex h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
          {t("providers.oauthClientSettings.advancedScopes")}
        </summary>
        <div className="grid gap-4 pt-2 pb-3">
          <div className="flex items-center gap-3">
            <input
              id={`${id}-defaults`}
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={!selection.custom}
              onChange={(event) => selection.setCustom(!event.target.checked)}
            />
            <Label htmlFor={`${id}-defaults`} className="leading-snug">
              {t("providers.oauthClientSettings.useDefaultScopes")}
            </Label>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={`${id}-custom`} className="leading-snug">
              {t("providers.oauthClientSettings.scopeLabel")}
            </Label>
            <StringArrayInput
              key={selection.custom ? "custom" : "default"}
              id={`${id}-custom`}
              aria-describedby={showBasicPermissions ? `${id}-help` : undefined}
              value={selection.selectedScopes}
              readOnly={!selection.custom}
              removeLabel={(scope) => t("providers.oauthClientSettings.removeScope", { scope })}
              onChange={selection.setScopes}
              placeholder={t("providers.oauthClientSettings.scopePlaceholder")}
            />
            {showBasicPermissions ? (
              <p id={`${id}-help`} className="text-sm text-muted-foreground">
                {t("providers.oauthClientSettings.emptyScopes")}
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
