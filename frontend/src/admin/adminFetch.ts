import { BACKEND_URL } from "../socket";
import { getAdminToken } from "./adminToken";

export function adminAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAdminToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extra) {
    const h = new Headers(extra);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

export function adminApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_URL}${p}`;
}
