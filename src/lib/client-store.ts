"use client";

import { useSyncExternalStore } from "react";

// localStorage 是 React 之外的狀態。在 effect 裡讀出來再 setState 會多觸發一輪
// render（也正是 react-hooks/set-state-in-effect 點名的寫法），用
// useSyncExternalStore 訂閱才是對的做法，而且不會有 hydration 不一致：
// 伺服器端先用 serverValue 繪製，hydrate 完成後 React 自己換成實際存的值。
//
// 同一個分頁改 localStorage 不會觸發 storage 事件（那只發給其他分頁），
// 所以寫入端要呼叫 notifyStorageChange()，同頁的訂閱者才收得到。
const CHANGE_EVENT = "dmao_storage_change";

export function notifyStorageChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

// 模組層級的常數參考：每次 render 傳同一個函式，React 才不會重新訂閱
export function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// 存成字串的偏好設定。值不在允許清單裡（沒設過、或是舊格式）就退回預設值。
export function useStoredChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return useSyncExternalStore(
    subscribeStorage,
    () => {
      const raw = readRaw(key);
      return allowed.includes(raw as T) ? (raw as T) : fallback;
    },
    () => fallback,
  );
}

// 原樣讀回字串，沒設過就是 null
export function useStoredString(key: string): string | null {
  return useSyncExternalStore(subscribeStorage, () => readRaw(key), () => null);
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 無痕模式或容量滿了：偏好設定存不起來不影響功能，忽略
  }
  notifyStorageChange();
}

// 需要解析的值（例如 JSON）不能每次都回傳新物件 —— getSnapshot 回傳的參考只要
// 每次都不同，React 就會判定狀態一直在變而無限重繪。用原始字串當快取鍵，
// 字串沒變就回傳上一次解析出來的同一個物件。
export function createParsedSnapshot<T>(key: string, parse: () => T): () => T {
  let cachedRaw: string | null | undefined;
  let cached: T;
  return () => {
    const raw = readRaw(key);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = parse();
    }
    return cached;
  };
}
