import React, { useState } from "react";
import { uiRem } from "../../utils/typography";
import { COFFEE_ENERGY_GAIN, COFFEE_WEALTH_COST } from "../../config/coffeeConfig";
import { STARTING_WEALTH } from "../../config/startingWealth";
import { PlayerResourceStatusBar } from "../../components/PlayerResourceStatusBar";

const INITIAL_ENERGY = 10;

export const DemoResources: React.FC<{ playerName?: string }> = () => {
  const [energyTotal, setEnergyTotal] = useState(INITIAL_ENERGY);
  const [spent, setSpent] = useState(0);
  const [wealth, setWealth] = useState(STARTING_WEALTH);

  const remaining = energyTotal - spent;
  const canBuyCoffee = wealth >= COFFEE_WEALTH_COST;

  return (
    <div className="tutorial-resources-demo">
      <PlayerResourceStatusBar
        remainingEnergy={remaining}
        energyTotal={energyTotal}
        wealth={wealth}
        coffee={{
          onClick: () => {
            setWealth((w) => w - COFFEE_WEALTH_COST);
            setEnergyTotal((e) => e + COFFEE_ENERGY_GAIN);
          },
          disabled: !canBuyCoffee,
        }}
        trailing={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSpent(0);
              setEnergyTotal(INITIAL_ENERGY);
            }}
          >
            下一轮（精力重置为 {INITIAL_ENERGY})
          </button>
        }
      />

      <p style={{ fontSize: uiRem(1.05), color: "var(--color-text-secondary)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
        拖动分配本轮精力：
      </p>
      <input
        type="range"
        min={0}
        max={energyTotal}
        value={spent}
        onChange={(e) => setSpent(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#3b82f6", marginBottom: "0.5rem" }}
      />
      <p style={{ margin: 0, fontSize: uiRem(0.85), color: "var(--color-text-muted)" }}>
        已分配 {spent} ⚡（本轮提交前可调整）
      </p>
    </div>
  );
};
