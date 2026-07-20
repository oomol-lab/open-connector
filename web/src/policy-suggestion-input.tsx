import type { KeyboardEvent, ReactNode } from "react";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";

interface PolicySuggestionInputProps {
  id?: string;
  value: string;
  suggestions: string[];
  placeholder: string;
  invalid?: boolean;
  open?: boolean;
  onChange(value: string): void;
  onOpenChange?(open: boolean): void;
  onSubmit?(): boolean;
}

export function PolicySuggestionInput(props: PolicySuggestionInputProps): ReactNode {
  const generatedId = useId();
  const listId = `${props.id ?? generatedId}-suggestions`;
  const [activeIndex, setActiveIndex] = useState(0);
  const [internalOpen, setInternalOpen] = useState(false);
  const suggestions = props.suggestions.filter((suggestion) => suggestion !== props.value);
  const open = (props.open ?? internalOpen) && suggestions.length > 0;

  function changeOpen(next: boolean): void {
    setInternalOpen(next);
    props.onOpenChange?.(next);
  }

  function select(value: string): void {
    props.onChange(value);
    setActiveIndex(0);
    changeOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      changeOpen(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      changeOpen(true);
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Escape") {
      changeOpen(false);
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    if (open && suggestions[activeIndex]) {
      event.preventDefault();
      select(suggestions[activeIndex]);
      return;
    }
    if (props.onSubmit) {
      event.preventDefault();
      if (props.onSubmit()) {
        changeOpen(false);
        event.currentTarget.blur();
      }
    }
  }

  return (
    <div className="policy-suggestion-input">
      <Input
        id={props.id}
        className="font-mono"
        value={props.value}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={props.invalid || undefined}
        placeholder={props.placeholder}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          setActiveIndex(0);
          changeOpen(true);
        }}
        onBlur={() => changeOpen(false)}
        onChange={(event) => {
          props.onChange(event.target.value);
          setActiveIndex(0);
          changeOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <div className="policy-suggestion-list" id={listId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              id={`${listId}-${index}`}
              key={suggestion}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-active={index === activeIndex || undefined}
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => select(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
