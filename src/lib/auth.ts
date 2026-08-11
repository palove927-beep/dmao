import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dmao_editor";
const EDITOR_CODE = "0800";

export function isEditor(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

// localStorage 屬於 React 之外的狀態，用 useSyncExternalStore 讀取，
// 不必在 effect 裡 setState（那會多觸發一次 render）。
function subscribeEditor(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function useIsEditor(): boolean {
  return useSyncExternalStore(subscribeEditor, isEditor, () => false);
}

export function loginEditor(code: string): boolean {
  if (code === EDITOR_CODE) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }
  return false;
}

export function logoutEditor(): void {
  localStorage.removeItem(STORAGE_KEY);
}
