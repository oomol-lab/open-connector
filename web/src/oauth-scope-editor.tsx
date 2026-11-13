import type { OAuthAuthorizationOption } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useState } from "react";
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
  const id = useId();
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
      <details className="group min-w-0" open={selection.custom}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
          {t("providers.oauthClientSettings.advancedScopes")}
        </summary>
        <div className="grid gap-4 pt-3">
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
          {selection.custom ? (
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-custom`} className="leading-snug">
                {t("providers.oauthClientSettings.customScopes")}
              </Label>
              <Textarea
                id={`${id}-custom`}
                value={selection.scopes.join("\n")}
                onChange={(event) =>
                  selection.setScopes(event.target.value === "" ? [] : event.target.value.split("\n"))
                }
              />
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
