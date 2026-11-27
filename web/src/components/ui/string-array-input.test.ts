import type { ComponentProps, KeyboardEvent } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { StringArrayInput } from "./string-array-input";

const inputEvents = vi.hoisted(() => ({ keyDown: undefined as ComponentProps<"input">["onKeyDown"] }));
vi.mock("@/components/ui/input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./input")>();
  return {
    ...actual,
    Input(props: ComponentProps<"input">) {
      inputEvents.keyDown = props.onKeyDown;
      return createElement(actual.Input, props);
    },
  };
});

it.each([
  { value: ["send", "openid", "email"], readOnlyItems: ["openid", "email"], expected: ["openid", "email"] },
  { value: ["openid", "email"], readOnlyItems: ["openid", "email"], expected: undefined },
  { value: ["first", "last"], readOnlyItems: undefined, expected: ["first"] },
])("Backspace removes only editable items: $value", ({ value, readOnlyItems, expected }) => {
  const onChange = vi.fn();
  renderToStaticMarkup(
    createElement(StringArrayInput, {
      value,
      readOnlyItems,
      onChange,
      removeLabel: (item) => `Remove ${item}`,
    }),
  );
  inputEvents.keyDown!({ key: "Backspace", nativeEvent: { isComposing: false } } as KeyboardEvent<HTMLInputElement>);
  if (expected) expect(onChange).toHaveBeenCalledWith(expected);
  else expect(onChange).not.toHaveBeenCalled();
});
