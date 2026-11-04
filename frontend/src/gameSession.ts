const SESSION_KEY = "gydd_game_session";

export type GameSession = { roomId: string; playerName: string; reconnectToken?: string };

export function saveGameSession(roomId: string, playerName: string): void {
  const prev = loadGameSession();
  const next: GameSession = { roomId: roomId.trim(), playerName: playerName.trim() };
  if (prev && prev.roomId === next.roomId && prev.playerName === next.playerName && prev.reconnectToken) {
    next.reconnectToken = prev.reconnectToken;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

export function saveReconnectToken(reconnectToken: string): void {
  const session = loadGameSession();
  if (!session) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, reconnectToken }));
}

export function clearGameSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadGameSession(): GameSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSession;
    if (typeof parsed.roomId === "string" && typeof parsed.playerName === "string") {
      const roomId = parsed.roomId.trim();
      const playerName = parsed.playerName.trim();
      const reconnectToken =
        typeof parsed.reconnectToken === "string" && parsed.reconnectToken ? parsed.reconnectToken : undefined;
      if (roomId && playerName) return { roomId, playerName, reconnectToken };
    }
  } catch {
    /* ignore */
  }
  return null;
}
