import type { OAuthAuthorizationOption } from "./model";

import { useEffect, useState } from "react";

export function useOAuthAuthorizationOptions(options: OAuthAuthorizationOption[] | undefined) {
  const [selectedOptionIds, setSelectedOptionIds] = useState(() => initialOAuthAuthorizationOptionIds(options ?? []));
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    setSelectedOptionIds(initialOAuthAuthorizationOptionIds(options ?? []));
    setCustom(false);
  }, [options]);
  return {
    selectedOptionIds,
    custom,
    setCustom,
    setScopes: setSelectedOptionIds,
    toggleOption(optionId: string, selected: boolean) {
      setSelectedOptionIds((current) => toggleOAuthAuthorizationOption(options ?? [], current, optionId, selected));
    },
  };
}

export function initialOAuthAuthorizationOptionIds(options: OAuthAuthorizationOption[]): string[] {
  return options.filter((option) => option.required || option.defaultSelected).map((option) => option.id);
}

export function toggleOAuthAuthorizationOption(
  options: OAuthAuthorizationOption[],
  current: string[],
  optionId: string,
  selected: boolean,
): string[] {
  const ids = new Set(current);
  if (selected) ids.add(optionId);
  else ids.delete(optionId);
  for (const option of options) if (option.required) ids.add(option.id);
  return [...ids];
}

export function normalizeOAuthScopes(values: string[] | undefined): string[] | undefined {
  return values === undefined ? undefined : [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
