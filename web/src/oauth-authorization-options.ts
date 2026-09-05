import type { OAuthAuthorizationOption } from "./model";

import { useEffect, useState } from "react";

export interface OAuthAuthorizationOptionSelection {
  selectedOptionIds: string[];
  toggleOption(optionId: string, selected: boolean): void;
}

export function useOAuthAuthorizationOptions(
  options: OAuthAuthorizationOption[] | undefined,
  grantedScopes?: string[],
): OAuthAuthorizationOptionSelection {
  const [selectedOptionIds, setSelectedOptionIds] = useState(() =>
    initialOAuthAuthorizationOptionIds(options ?? [], grantedScopes),
  );
  useEffect(() => {
    setSelectedOptionIds(initialOAuthAuthorizationOptionIds(options ?? [], grantedScopes));
  }, [options, grantedScopes]);
  const toggleOption = (optionId: string, selected: boolean) => {
    setSelectedOptionIds((current) => toggleOAuthAuthorizationOption(options ?? [], current, optionId, selected));
  };
  return { selectedOptionIds, toggleOption };
}

export function initialOAuthAuthorizationOptionIds(
  options: OAuthAuthorizationOption[],
  grantedScopes?: string[],
): string[] {
  const selectedIds = new Set(
    options
      .filter((option) =>
        grantedScopes
          ? option.required || grantedScopes.includes(option.id)
          : option.required || option.defaultSelected,
      )
      .map((option) => option.id),
  );
  return normalizeOAuthAuthorizationOptionIds(options, selectedIds);
}

export function toggleOAuthAuthorizationOption(
  options: OAuthAuthorizationOption[],
  current: string[],
  optionId: string,
  selected: boolean,
): string[] {
  const selectedIds = new Set(current);
  if (selected) {
    selectedIds.add(optionId);
  } else {
    const removedIds = new Set([optionId]);
    for (const removedId of removedIds) {
      for (const option of options) {
        if (option.requires?.includes(removedId)) removedIds.add(option.id);
      }
    }
    for (const removedId of removedIds) selectedIds.delete(removedId);
  }
  return normalizeOAuthAuthorizationOptionIds(options, selectedIds);
}

function normalizeOAuthAuthorizationOptionIds(options: OAuthAuthorizationOption[], selectedIds: Set<string>): string[] {
  for (const option of options) if (option.required) selectedIds.add(option.id);
  for (const selectedId of selectedIds) {
    const option = options.find((candidate) => candidate.id == selectedId);
    for (const requiredId of option?.requires ?? []) selectedIds.add(requiredId);
  }
  return options.filter((option) => selectedIds.has(option.id)).map((option) => option.id);
}
