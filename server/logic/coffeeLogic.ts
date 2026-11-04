import { GameState, Player } from "../state/gameState.js";
import { appendSessionEvent } from "../state/sessionTelemetry.js";
import { sanitizeInvestments, spendableEnergy } from "./investmentLogic.js";

export const COFFEE_WEALTH_COST = 17;
export const COFFEE_ENERGY_GAIN = 1;

function draftEnergySum(player: Player): number {
  const draft = player.investmentDraft ?? {};
  let sum = 0;
  for (const v of Object.values(draft)) {
    sum += Math.max(0, Math.floor(Number(v)));
  }
  return sum;
}

function coffeeRoundContext(game: GameState) {
  return {
    globalRound: game.globalRound,
    currentEra: game.currentEra,
    roundInEra: game.roundInEra,
    phase: game.phase,
  };
}

export type CoffeePurchaseResult =
  | { ok: true }
  | { ok: false; message: string };

export function purchaseCoffee(game: GameState, player: Player): CoffeePurchaseResult {
  if (player.wealth < COFFEE_WEALTH_COST) {
    return { ok: false, message: "财富不足，无法购买咖啡" };
  }
  player.wealth -= COFFEE_WEALTH_COST;
  player.energy += COFFEE_ENERGY_GAIN;
  player.totalEnergyConsumed += COFFEE_ENERGY_GAIN;
  player.coffeePurchasesThisRound = (player.coffeePurchasesThisRound ?? 0) + 1;
  game.logs.push(`☕ ${player.name} 购买了咖啡 (精力+1)`);
  appendSessionEvent(
    game,
    "coffee_purchased",
    {
      ...coffeeRoundContext(game),
      wealthCost: COFFEE_WEALTH_COST,
      energyGain: COFFEE_ENERGY_GAIN,
      wealthAfter: player.wealth,
      energyAfter: player.energy,
      coffeePurchasesThisRound: player.coffeePurchasesThisRound,
    },
    player.id
  );
  return { ok: true };
}

export type CoffeeRefundResult =
  | { ok: true }
  | { ok: false; message: string };

export function refundCoffee(
  game: GameState,
  player: Player,
  count: number
): CoffeeRefundResult {
  const purchased = player.coffeePurchasesThisRound ?? 0;
  if (!Number.isFinite(count) || count !== Math.floor(count) || count < 1) {
    return { ok: false, message: "退订杯数无效" };
  }
  if (count > purchased) {
    return { ok: false, message: "退订杯数无效" };
  }

  const draftSum = draftEnergySum(player);
  const energyAfter = player.energy - count * COFFEE_ENERGY_GAIN;
  if (draftSum > spendableEnergy({ energy: energyAfter })) {
    return {
      ok: false,
      message: "预填投资已超过可退订后的精力，请先调低投资",
    };
  }
  if (player.energy >= 0 && energyAfter < 0) {
    return {
      ok: false,
      message: "退订后精力不足，请先调低预填投资",
    };
  }

  player.wealth += COFFEE_WEALTH_COST * count;
  player.energy = energyAfter;
  player.totalEnergyConsumed = Math.max(
    0,
    player.totalEnergyConsumed - count * COFFEE_ENERGY_GAIN
  );
  player.coffeePurchasesThisRound = purchased - count;

  player.investmentDraft = sanitizeInvestments(
    game,
    player,
    player.investmentDraft ?? {}
  );

  game.logs.push(`☕ ${player.name} 退订了 ${count} 杯咖啡`);
  appendSessionEvent(
    game,
    "coffee_refunded",
    {
      ...coffeeRoundContext(game),
      count,
      wealthRefund: COFFEE_WEALTH_COST * count,
      energyLoss: count * COFFEE_ENERGY_GAIN,
      wealthAfter: player.wealth,
      energyAfter: player.energy,
      coffeePurchasesThisRound: player.coffeePurchasesThisRound,
    },
    player.id
  );
  return { ok: true };
}

/** 新轮发精力时清零当轮咖啡计数 */
export function resetCoffeePurchasesForRound(game: GameState): void {
  for (const player of game.players) {
    player.coffeePurchasesThisRound = 0;
  }
}
