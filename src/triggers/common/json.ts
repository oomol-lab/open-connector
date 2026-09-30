export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export type JsonObject = { readonly [key: string]: JsonValue };

type Frame = {
  readonly value: object;
  readonly keys: readonly (string | symbol)[];
  readonly arrayLength: number | undefined;
  index: number;
};

function hasJsonShape(root: unknown): boolean {
  if (root === null || typeof root == "boolean" || typeof root == "string") return true;
  if (typeof root == "number") return Number.isFinite(root);
  if (typeof root != "object") return false;

  const ancestors = new Set<object>();
  const pending: Frame[] = [];
  let value = root;

  traversal: while (true) {
    let keys: readonly (string | symbol)[];
    let arrayLength: number | undefined;
    if (Array.isArray(value)) {
      arrayLength = value.length;
      keys = Reflect.ownKeys(value);
      if (keys.length != arrayLength + 1) return false;
    } else {
      const prototype = Reflect.getPrototypeOf(value);
      if (prototype != Object.prototype && prototype != null) return false;
      keys = Reflect.ownKeys(value);
      arrayLength = undefined;
    }
    ancestors.add(value);

    let index = 0;
    while (true) {
      if (index >= keys.length) {
        ancestors.delete(value);
        const parent = pending.pop();
        if (parent === undefined) return true;
        value = parent.value;
        keys = parent.keys;
        arrayLength = parent.arrayLength;
        index = parent.index;
        continue;
      }

      const key = keys[index++]!;
      if (arrayLength !== undefined) {
        if (key == "length") continue;
        if (typeof key != "string") return false;
        const arrayIndex = Number(key);
        if (
          !Number.isSafeInteger(arrayIndex) ||
          arrayIndex < 0 ||
          arrayIndex >= arrayLength ||
          String(arrayIndex) != key
        )
          return false;
      } else if (typeof key != "string") {
        return false;
      }

      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable != true || !Object.hasOwn(descriptor, "value")) return false;
      const child: unknown = descriptor.value;
      if (child === null || typeof child == "boolean" || typeof child == "string") continue;
      if (typeof child == "number") {
        if (!Number.isFinite(child)) return false;
        continue;
      }
      if (typeof child != "object" || ancestors.has(child)) return false;

      pending.push({ value, keys, arrayLength, index });
      value = child;
      continue traversal;
    }
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  try {
    return hasJsonShape(value);
  } catch {
    return false;
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  try {
    return value != null && typeof value == "object" && !Array.isArray(value) && hasJsonShape(value);
  } catch {
    return false;
  }
}
