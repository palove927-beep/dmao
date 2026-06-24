const STORAGE_KEY = "dmao_editor";
const EDITOR_CODE = "0800";

export function isEditor(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
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
