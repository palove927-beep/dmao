import { useEffect, useSyncExternalStore } from "react";

// 這裡只記「畫面要不要顯示編輯按鈕」；真正的權限在伺服器端 httpOnly cookie
// （見 src/lib/editor-auth.ts）。key 換成 v2，讓舊版只存 localStorage 的登入狀態失效、
// 重新登入一次拿到 cookie。
const STORAGE_KEY = "dmao_editor_v2";

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
  useEffect(() => {
    void syncEditorWithServer();
  }, []);
  return useSyncExternalStore(subscribeEditor, isEditor, () => false);
}

// 代碼送到伺服器驗證，正確才會拿到 cookie
export async function loginEditor(code: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return false;
  } catch {
    return false;
  }
  localStorage.setItem(STORAGE_KEY, "true");
  notifyEditorChange();
  return true;
}

export function logoutEditor(): void {
  localStorage.removeItem(STORAGE_KEY);
  notifyEditorChange();
  fetch("/api/auth", { method: "DELETE" }).catch(() => {});
}

// cookie 過期或被清掉時，把畫面上的編輯狀態一併收掉
// 每次載入頁面只查一次
let synced = false;

export async function syncEditorWithServer(): Promise<void> {
  if (synced || !isEditor()) return;
  synced = true;
  try {
    const res = await fetch("/api/auth");
    const json = await res.json();
    if (!json.editor) {
      localStorage.removeItem(STORAGE_KEY);
      notifyEditorChange();
    }
  } catch {
    // 網路錯誤時維持現狀
  }
}
