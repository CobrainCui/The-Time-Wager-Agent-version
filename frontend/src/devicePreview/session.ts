import type { Socket } from "socket.io-client";
import { publicAssetUrl } from "../utils/publicAssetUrl";
import { socket } from "../socket";

let active = false;
let originalEmit: Socket["emit"] | null = null;

function ensureEmitGuardInstalled(): void {
  if (originalEmit) return;
  originalEmit = socket.emit.bind(socket);
  socket.emit = ((...args: Parameters<Socket["emit"]>) => {
    if (active) return socket;
    return originalEmit!(...args);
  }) as Socket["emit"];
}

export function isDevicePreviewSession(): boolean {
  return active;
}

export function enterDevicePreviewSession(): void {
  ensureEmitGuardInstalled();
  active = true;
}

export function leaveDevicePreviewSession(): void {
  active = false;
}

export const DEVICE_PREVIEW_PORTRAIT_SRC = publicAssetUrl("/images/device-preview-portrait.jpg");
export const DEVICE_PREVIEW_LANDSCAPE_SRC = publicAssetUrl("/images/device-preview-landscape.jpg");
