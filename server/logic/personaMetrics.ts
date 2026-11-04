/** 道具卡对「规则干预」维度的权重（越高越偏马基雅维利/破坏规则） */
export const RULE_INTERVENTION_CARD_WEIGHTS: Record<string, number> = {
  buff_slack: 1.5,
  buff_rebound: 1.2,
  buff_short: 1.4,
  buff_lottery: 1.3,
  buff_gold: 0.8,
  buff_spirit: 0.3,
  buff_insurance: 0.2,
};

export const DEFAULT_RULE_INTERVENTION_WEIGHT = 1;

export function ruleInterventionWeightForCard(cardId: string): number {
  return RULE_INTERVENTION_CARD_WEIGHTS[cardId] ?? DEFAULT_RULE_INTERVENTION_WEIGHT;
}

export function sumRuleInterventionCardWeights(usedCards: string[]): number {
  return usedCards.reduce((sum, id) => sum + ruleInterventionWeightForCard(id), 0);
}
