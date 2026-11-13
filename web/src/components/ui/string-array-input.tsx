import { XIcon } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeStringItems } from "@/lib/string-items";

interface StringArrayInputProps {
  "aria-describedby"?: string;
  autoComplete?: React.HTMLInputAutoCompleteAttribute;
  id?: string;
  onChange: (value: string[]) => void;
  readOnly?: boolean;
  placeholder?: string;
  value: string[];
}

export function StringArrayInput({
  "aria-describedby": ariaDescribedBy,
  autoComplete,
  id,
  onChange,
  placeholder,
  readOnly = false,
  value,
}: StringArrayInputProps) {
  const [draft, setDraft] = React.useState("");

  const composing = React.useRef(false);

  function commit(raw: string) {
    const nextItems = normalizeStringItems(raw);
    if (!nextItems.length) return;
    const existing = new Set(value);
    const next = [...value];
    for (const item of nextItems) {
      if (existing.has(item)) continue;
      existing.add(item);
      next.push(item);
    }
    onChange(next);
    setDraft("");
  }

  function remove(item: string) {
    onChange(value.filter((candidate) => candidate !== item));
  }

  return (
    <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
      {value.map((item) => (
        <Badge key={item} variant="secondary" className="max-w-full min-w-0 gap-1 [&_svg:not([class*='size-'])]:size-3">
          <span className="truncate" title={item}>
            {item}
          </span>
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-0.5 size-4 rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                remove(item);
              }}
            >
              <XIcon />
              <span className="sr-only">{item}</span>
            </Button>
          ) : null}
        </Badge>
      ))}
      <Input
        id={id}
        aria-describedby={ariaDescribedBy}
        autoComplete={autoComplete}
        value={draft}
        className="h-6 min-w-32 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
        readOnly={readOnly}
        placeholder={readOnly ? undefined : placeholder}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(event) => {
          if (readOnly) return;
          const next = event.target.value;
          if (!composing.current && /[,;\n]/u.test(next)) commit(next);
          else setDraft(next);
        }}
        onBlur={() => {
          if (!readOnly && draft.trim()) commit(draft);
        }}
        onKeyDown={(event) => {
          if (readOnly || event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit(draft);
          }
          if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onPaste={(event) => {
          if (readOnly) return;
          const text = event.clipboardData.getData("text");
          if (!/[,;\n]/u.test(text)) return;
          event.preventDefault();
          const input = event.currentTarget;
          const start = input.selectionStart ?? draft.length;
          const end = input.selectionEnd ?? start;
          commit(draft.slice(0, start) + text + draft.slice(end));
        }}
      />
    </div>
  );
}
