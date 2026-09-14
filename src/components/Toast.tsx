"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 全站共用的 toast。
// 一般訊息看一眼就夠，3 秒後自動消失、點一下可以提早關掉；
// 錯誤訊息常常帶著上游 API 的原因，要留久一點才讀得完，也要能整段複製下來，
// 所以錯誤的 toast 文字可選取、只由「複製 / 關閉」按鈕操作，滑鼠移上去還會暫停倒數。
const TOAST_MS = 3000;
const TOAST_ERROR_MS = 20000;

export type ToastState = {
  message: string;
  // persistent：進行中的提示（例如「分析中…」），要等呼叫端自己關掉
  persistent?: boolean;
  tone?: "error";
};

// 讓各頁共用同一組 toast 狀態，省得每頁自己接一次 useState
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const showToast = useCallback(
    (message: string, persistent?: boolean) => setToast({ message, persistent }),
    []
  );
  const showError = useCallback(
    (message: string) => setToast({ message, tone: "error" }),
    []
  );
  return { toast, showToast, showError, clearToast };
}

export default function Toast({ message, persistent, tone, onClose }: ToastState & { onClose: () => void }) {
  const isError = tone === "error";
  // 錯誤要讓人讀完、選取、複製，所以不做「點一下就關」
  const clickToDismiss = !persistent && !isError;
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (persistent || paused) return;
    const t = setTimeout(onClose, isError ? TOAST_ERROR_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [onClose, persistent, isError, paused]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪貼簿不可用（權限／舊瀏覽器）→ 幫忙把訊息選起來，讓使用者自己按 Ctrl+C
      const el = textRef.current;
      const sel = window.getSelection();
      if (!el || !sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  return (
    <div
      onClick={clickToDismiss ? onClose : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)",
        background: isError ? "#7f1d1d" : "#222", color: "#fff",
        padding: "12px 28px", borderRadius: 8,
        fontSize: 14, lineHeight: 1.6, zIndex: 9999,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        maxWidth: "min(680px, calc(100vw - 32px))",
        cursor: clickToDismiss ? "pointer" : "default",
      }}
    >
      <div
        ref={textRef}
        style={{
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          userSelect: isError ? "text" : "none",
          maxHeight: "40vh", overflowY: "auto",
        }}
      >
        {message}
      </div>
      {isError && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={copy} style={errorBtnStyle}>
            {copied ? "已複製" : "複製訊息"}
          </button>
          <button onClick={onClose} style={errorBtnStyle}>關閉</button>
        </div>
      )}
    </div>
  );
}

const errorBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.35)",
  borderRadius: 6,
  padding: "4px 12px",
  fontSize: 12,
  cursor: "pointer",
};
