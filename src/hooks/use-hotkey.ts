import { useEffect, useCallback, useRef } from "react";

export type HotkeyCombo = {
  key: string;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type HotkeyHandler = () => void;

function matchCombo(event: KeyboardEvent, combo: HotkeyCombo): boolean {
  if (event.key.toLowerCase() !== combo.key.toLowerCase()) return false;
  if (combo.ctrlOrMeta && !(event.metaKey || event.ctrlKey)) return false;
  if (!combo.ctrlOrMeta && (event.metaKey || event.ctrlKey)) return false;
  if (combo.shift && !event.shiftKey) return false;
  if (combo.alt && !event.altKey) return false;
  return true;
}

export function useHotkey(combo: HotkeyCombo, handler: HotkeyHandler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const listener = (event: KeyboardEvent) => {
      if (matchCombo(event, combo)) {
        event.preventDefault();
        handlerRef.current();
      }
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [combo.key, combo.ctrlOrMeta, combo.shift, combo.alt, enabled]);
}

export function useEscape(handler: HotkeyHandler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handlerRef.current();
      }
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled]);
}

export interface KeyboardNav {
  switchView: (view: string) => void;
}

export function useKeyboardNavigation(nav: KeyboardNav) {
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
        switch (event.key) {
          case "1":
            event.preventDefault();
            navRef.current.switchView("pipeline");
            break;
          case "2":
            event.preventDefault();
            navRef.current.switchView("calendar");
            break;
          case "3":
            event.preventDefault();
            navRef.current.switchView("table");
            break;
        }
      }
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
