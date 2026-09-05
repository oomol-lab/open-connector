import type { OAuthAuthorizationOption } from "./model";

import { useCallback, useEffect, useState } from "react";

export interface OAuthAuthorizationOptionSelection {
  selectedOptionIds: string[];
  toggleOption(optionId: string, selected: boolean): void;
}

export function useOAuthAuthorizationOptions(
  options: OAuthAuthorizationOption[],
  grantedScopes?: unknown,
): OAuthAuthorizationOptionSelection {
  const optionKey = JSON.stringify(options.map((option) => option.id));
  const grantedScopeKey = Array.isArray(grantedScopes) ? JSON.stringify(grantedScopes) : "none";
  const [selectedOptionIds, setSelectedOptionIds] = useState(() =>
    initialOAuthAuthorizationOptionIds(options, grantedScopes),
  );
  useEffect(() => {
    setSelectedOptionIds(initialOAuthAuthorizationOptionIds(options, grantedScopes));
  }, [optionKey, grantedScopeKey]);
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
  const selectedIds = new Set<string>();
  if (Array.isArray(grantedScopes)) {
    for (const option of options) {
      if (option.required || grantedScopes.includes(option.id)) {
        addOptionWithRequirements(options, selectedIds, option.id);
      }
    }
  } else {
    for (const option of options) {
      if (option.defaultSelected || option.required) {
        addOptionWithRequirements(options, selectedIds, option.id);
      }
    }
  }
  return options.filter((option) => selectedIds.has(option.id)).map((option) => option.id);
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
  for (const option of options) {
    if (option.required) addOptionWithRequirements(options, selectedIds, option.id);
  }
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
