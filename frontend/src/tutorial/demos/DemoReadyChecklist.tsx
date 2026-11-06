import React, { useState } from "react";
import { uiRem } from "../../utils/typography";
import { STARTING_WEALTH } from "../../config/startingWealth";

const ITEMS = [
  { id: "wealth", label: `开局每人 ${STARTING_WEALTH} 财富，可买咖啡或留作拍卖/转账` },
  { id: "energy", label: "每轮精力会重置，鼓励花完" },
  { id: "long", label: "长期项目参与投资后，每轮至少投 3 点精力；不足会按累计投入每 1 点精力返还 1 点财富，并退出完成排名" },
  { id: "risk", label: "风险项目超上限会倒扣历史收益" },
  { id: "tie", label: "投入相同则并列，共享奖励/惩罚/时代加成" },
  { id: "era", label: "时代加成：短期恰好满额/长期满或超，契合主题第 1 名；短期爆与风险无" },
  { id: "auction", label: "拍卖会用财富竞拍 Buff 卡" },
  { id: "transfer", label: "右侧一对一对话框可转账；不填金额并留言即私信" },
];

export const DemoReadyChecklist: React.FC = () => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allDone = ITEMS.every((i) => checked[i.id]);

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div className="tutorial-ready-checklist">
      <p style={{ fontSize: uiRem(0.85), color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        勾选表示你已理解（仅本地记录）：
      </p>
      <ul className="tutorial-ready-checklist__list" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {ITEMS.map((item) => (
          <li key={item.id}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.65rem",
                padding: "0.65rem 0.75rem",
                borderRadius: "0.5rem",
                border: `1px solid ${checked[item.id] ? "rgba(16,185,129,0.35)" : "var(--color-border)"}`,
                background: checked[item.id] ? "rgba(16,185,129,0.08)" : "transparent",
                cursor: "pointer",
                fontSize: uiRem(0.9),
                color: "var(--color-text-secondary)",
              }}
            >
              <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggle(item.id)} style={{ marginTop: "0.2rem" }} />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
      {allDone && (
        <div
          className="animate-fadeIn"
          style={{
            marginTop: "1rem",
            padding: "1rem",
            borderRadius: "0.75rem",
            background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(168,85,247,0.12))",
            border: "1px solid rgba(168,85,247,0.3)",
            textAlign: "center",
            fontWeight: 700,
            color: "#c4b5fd",
          }}
        >
          🎉 准备就绪！祝你在光阴的博弈中此生无悔。
        </div>
      )}
    </div>
  );
};
