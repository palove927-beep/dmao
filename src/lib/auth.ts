import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dmao_editor";
const EDITOR_CODE = "0800";

export function isEditor(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

// 同分頁內改 localStorage 不會觸發 storage 事件（那只發給其他分頁），
// 所以登入／登出時自己補一個事件，同一頁的訂閱者才收得到。
const EDITOR_EVENT = "dmao_editor_change";

function notifyEditorChange(): void {
  window.dispatchEvent(new Event(EDITOR_EVENT));
}

// localStorage 屬於 React 之外的狀態，用 useSyncExternalStore 讀取，
// 不必在 effect 裡 setState（那會多觸發一次 render）。
function subscribeEditor(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EDITOR_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EDITOR_EVENT, onChange);
  };
}

export function useIsEditor(): boolean {
  return useSyncExternalStore(subscribeEditor, isEditor, () => false);
}

export function loginEditor(code: string): boolean {
  if (code === EDITOR_CODE) {
    localStorage.setItem(STORAGE_KEY, "true");
    notifyEditorChange();
    return true;
  }
  return false;
}

export function logoutEditor(): void {
  localStorage.removeItem(STORAGE_KEY);
  notifyEditorChange();
}
