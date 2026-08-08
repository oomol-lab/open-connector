import type { CredentialField } from "./model";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CredentialInput(props: {
  field: CredentialField;
  value: string;
  onChange(value: string): void;
}): ReactNode {
  return (
    <Label className="field">
      <span>{props.field.label}</span>
      {props.field.inputType === "textarea" || props.field.inputType === "json" ? (
        <Textarea
          className="min-h-24 resize-y font-mono text-xs leading-relaxed"
          value={props.value}
          placeholder={props.field.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          required={props.field.required}
          spellCheck={false}
        />
      ) : (
        <Input
          type={props.field.secret ? "password" : "text"}
          placeholder={props.field.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          required={props.field.required}
        />
      )}
      {props.field.description ? <small>{props.field.description}</small> : null}
    </Label>
  );
}
