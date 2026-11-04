import type { GameSnapshot, Observation, PlayerView } from "./types.js";

export function buildObservation(game: GameSnapshot, playerId: string): Observation {
  const me = game.players.find((p) => p.id === playerId);
  if (!me) {
    throw new Error(`玩家 ${playerId} 不在当前 gameUpdate 中`);
  }

  const players = game.players.map((p: PlayerView) => ({
    id: p.id,
    name: p.name,
    wealth: p.wealth,
    rank: p.rank ?? 0,
    energy: typeof p.energy === "number" ? p.energy : null,
    ready: p.ready === true,
    isMe: p.id === playerId,
    isAgent: p.isAgent === true,
    agentPersona: p.agentPersona ?? p.aiPersona ?? null,
    inventoryCount: p.inventory?.length ?? 0,
  }));

  const leader = [...players].sort((a, b) => b.wealth - a.wealth)[0] ?? null;

  const pending = (game.transactions ?? []).filter((t) => t.status === "pending");
  const myPending = pending.filter((t) => t.toId === playerId);

  const auction = game.auctionFocusCardId
    ? {
        focusCardId: game.auctionFocusCardId,
        currentBid: game.auctionCurrentBid ?? 0,
        minimumNextBid: game.auctionMinimumNextBid ?? game.auctionStartingBid ?? 5,
        highBidderId: game.auctionHighBidderId ?? null,
        highBidderName: game.auctionHighBidderName ?? null,
        soldCardIds: (game.auctionSoldLots ?? []).map((s) => s.cardId),
        distributedCardIds: game.auctionDistributedCardIds ?? [],
        bidHistory: game.auctionBidHistory ?? [],
      }
    : null;

  return {
    phase: game.phase,
    era: game.currentEra,
    roundInEra: game.roundInEra,
    globalRound: game.globalRound,
    serverNow: game.serverNow ?? Date.now(),
    me: {
      id: me.id,
      name: me.name,
      energy: Number(me.energy ?? 0),
      wealth: me.wealth,
      rank: me.rank ?? 0,
      ready: me.ready === true,
      inventory: me.inventory ?? [],
      usedCards: me.usedCards ?? [],
      coffeePurchases: me.coffeePurchasesThisRound ?? 0,
      investment: me.investment ?? {},
    },
    players,
    projects: game.activeProjects ?? [],
    eraCard: game.currentEraCard ?? null,
    currencyLeader: leader ? leader.name : null,
    pendingTransactions: pending,
    myPendingTransactions: myPending,
    auction,
    recentLogs: (game.logs ?? []).slice(-12),
  };
}
