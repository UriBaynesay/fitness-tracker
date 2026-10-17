import { useEffect, useRef, type RefObject } from "react";

// A modal sheet must keep keyboard focus inside itself, close on Escape, and give
// focus back to whatever opened it. `open` is whether the sheet is showing.
export function useSheetFocus(open: boolean, sheet: RefObject<HTMLElement | null>, onClose: () => void): void {
  // The sheet's own autofocus moves focus before an effect could read "what opened me",
  // so the last focused element outside the sheet is tracked all the time.
  const lastOutside = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[aria-modal=\"true\"]")) lastOutside.current = target;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [sheet]);

  useEffect(() => {
    if (!open) return;
    const opener = lastOutside.current;
    const focusables = () =>
      Array.from(sheet.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(
        (el) => !el.hasAttribute("disabled")
      );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const inside = sheet.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open, sheet, onClose]);
}
