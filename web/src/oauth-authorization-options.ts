import type { OAuthAuthorizationOption } from "./model";

import { useCallback, useState } from "react";

export function useOAuthAuthorizationOptions(options: OAuthAuthorizationOption[], grantedScopes?: unknown) {
  const [selectedOptionIds, setSelectedOptionIds] = useState(() =>
    initialOAuthAuthorizationOptionIds(options, grantedScopes),
  );
  const toggleOption = useCallback(
    (optionId: string, selected: boolean) => {
      setSelectedOptionIds((current) => toggleOAuthAuthorizationOption(options, current, optionId, selected));
    },
    [options],
  );
  return { selectedOptionIds, toggleOption };
}

export function initialOAuthAuthorizationOptionIds(
  options: OAuthAuthorizationOption[],
  grantedScopes: unknown,
): string[] {
  if (Array.isArray(grantedScopes)) {
    return options.filter((option) => grantedScopes.includes(option.id)).map((option) => option.id);
  }
  return options.filter((option) => option.defaultSelected || option.required).map((option) => option.id);
}

export function toggleOAuthAuthorizationOption(
  options: OAuthAuthorizationOption[],
  current: string[],
  optionId: string,
  selected: boolean,
): string[] {
  const selectedIds = new Set(current);
  if (selected) {
    addOptionWithRequirements(options, selectedIds, optionId);
  } else {
    selectedIds.delete(optionId);
    for (const option of options) {
      if (option.required || requiresOption(options, option.id, optionId)) selectedIds.delete(option.id);
    }
  }
  for (const option of options) if (option.required) selectedIds.add(option.id);
  return options.filter((option) => selectedIds.has(option.id)).map((option) => option.id);
}

function addOptionWithRequirements(
  options: OAuthAuthorizationOption[],
  selectedIds: Set<string>,
  optionId: string,
): void {
  if (selectedIds.has(optionId)) return;
  selectedIds.add(optionId);
  const option = options.find((candidate) => candidate.id == optionId);
  for (const requiredId of option?.requires ?? []) addOptionWithRequirements(options, selectedIds, requiredId);
}

function requiresOption(options: OAuthAuthorizationOption[], optionId: string, requiredId: string): boolean {
  const option = options.find((candidate) => candidate.id == optionId);
  return (option?.requires ?? []).some(
    (dependency) => dependency == requiredId || requiresOption(options, dependency, requiredId),
  );
}
