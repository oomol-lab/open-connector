const visibilityKey = "oomol-connect.onekey-promotion-hidden";

/** Whether this browser chose to hide the optional official service recommendation. */
export function isOneKeyPromotionHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(visibilityKey) === "true";
  } catch {
    return false;
  }
}

export function setOneKeyPromotionHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hidden) window.localStorage.setItem(visibilityKey, "true");
    else window.localStorage.removeItem(visibilityKey);
  } catch {
    // The current page still honors the choice when browser storage is unavailable.
  }
}
