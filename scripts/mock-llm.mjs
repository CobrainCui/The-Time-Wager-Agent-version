/**
 * 本地 Mock LLM（OpenAI 兼容 /v1/chat/completions）。
 *
 * 只用于端到端冒烟测试：它不模拟真实模型的社会行为，
 * 但会严格走与真实供应商相同的 HTTP + JSON 解析路径。
 * 真实实验请使用 .env 中的真实 Key，不要用本文件。
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT || 3100);

function extractObservation(text) {
  const marker = "## 当前观察数据（JSON）";
  const idx = text.lastIndexOf(marker);
  if (idx < 0) return null;
  const sub = text.slice(idx + marker.length);
  const start = sub.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(sub.slice(start));
  } catch {
    return null;
  }
}

function agentIndexFrom(system) {
  const m = /第\s*(\d+)\s*号座位/.exec(system || "");
  return m ? Number(m[1]) : 1;
}

function prediction(obs, agentIndex) {
  const players = (obs?.players ?? []).slice();
  players.sort((a, b) => b.wealth - a.wealth || a.id.localeCompare(b.id));
  // 制造一点个体差异：偶数号把第 2/3 名交换，避免所有 Agent 预测完全相同。
  if (agentIndex % 2 === 0 && players.length >= 3) {
    [players[1], players[2]] = [players[2], players[1]];
  }
  return {
    reasoning: `按当前财富与第 ${obs?.globalRound ?? "?"} 轮表现排序。`,
    ranking: players.map((p) => p.id),
  };
}

function investment(obs, agentIndex) {
  const projects = (obs?.projects ?? []).slice();
  const energy = Math.max(0, Math.floor(obs?.me?.energy ?? 0));
  const investmentMap = {};
  if (projects.length > 0 && energy > 0) {
    const ordered = projects
      .slice()
      .sort((a, b) => a.id - b.id)
      .sort((a, b) => ((a.id + agentIndex) % projects.length) - ((b.id + agentIndex) % projects.length));
    const first = ordered[0];
    const second = ordered[1] ?? ordered[0];
    const firstAmount = Math.max(1, Math.floor(energy * 0.6));
    investmentMap[String(first.id)] = firstAmount;
    const rest = energy - firstAmount;
    if (rest > 0 && second) {
      investmentMap[String(second.id)] = (investmentMap[String(second.id)] ?? 0) + rest;
    }
  }

  const messages = [];
  const round = obs?.globalRound ?? 1;
  const me = obs?.me;
  const others = (obs?.players ?? []).filter((p) => p.id !== me?.id);
  if (projects[0]) {
    messages.push({
      channel: "public",
      text: `第 ${round} 轮我优先投 ${projects[0].name}，欢迎一起把盘子做大。`,
    });
  }
  if (round % 2 === 0 && others.length > 0) {
    const target = others[(agentIndex - 1) % others.length];
    messages.push({
      channel: "private",
      toPlayerId: target.id,
      text: `这轮我打算投 ${projects[0]?.name ?? "长期项目"}，你如果也投，我们可以互相照应。`,
    });
  }

  const transfer =
    round === 3 && agentIndex <= 2 && others.length > 0
      ? { toPlayerId: others[agentIndex % others.length].id, amount: 5, note: "合作诚意" }
      : null;

  const groupChats = obs?.groupChats ?? [];
  const createGroup =
    round === 1 && agentIndex === 1 && others.length >= 2 && groupChats.length === 0
      ? { name: "合作小组", memberIds: others.slice(0, 2).map((p) => p.id) }
      : null;
  const groupMessages =
    groupChats.length > 0
      ? [
          {
            groupId: groupChats[0].id,
            text: `群内同步：第 ${round} 轮我准备投 ${projects[0]?.name ?? "当前项目"}。`,
          },
        ]
      : [];

  return {
    reasoning: `根据第 ${round} 轮项目容量与精力做分配。`,
    messages,
    groupMessages,
    createGroup,
    transfer,
    coffee: 0,
    useCard: null,
    investment: investmentMap,
    ready: true,
  };
}

function auction(obs, agentIndex, userText) {
  const maxBidMatch = /即\s*(\d+)/.exec(userText);
  const maxBid = maxBidMatch ? Number(maxBidMatch[1]) : 0;
  const minNext = obs?.auction?.minimumNextBid ?? 5;
  const current = obs?.auction?.currentBid ?? 0;
  const inventory = obs?.me?.inventory ?? [];
  if (inventory.includes("buff_force_buy") && current > maxBid * 0.8) {
    return { reasoning: "价格太高，用强买强卖。", action: "force_buy" };
  }
  if (agentIndex % 3 !== 0 && minNext <= maxBid) {
    return { reasoning: `出到 ${minNext}，仍在上限内。`, action: "bid", amount: minNext };
  }
  return { reasoning: "价格或卡牌价值不匹配，放弃。", action: "pass" };
}

function responseFor(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const agentIndex = agentIndexFrom(system);
  const obs = extractObservation(user);

  let payload;
  if (user.includes("任务：预测本局结束时")) {
    payload = prediction(obs, agentIndex);
  } else if (user.includes("阶段：拍卖会")) {
    payload = auction(obs, agentIndex, user);
  } else if (user.includes("向你发起转账")) {
    payload = { reasoning: "接受这笔转账，保留合作可能。", decision: "accept" };
  } else if (user.includes("需要为这个社区命名")) {
    payload = { reasoning: "取一个中性的实验社区名。", name: `实验社区${agentIndex}` };
  } else {
    payload = investment(obs, agentIndex);
  }

  const content = JSON.stringify(payload);
  const promptChars = messages.reduce((sum, m) => sum + String(m.content ?? "").length, 0);
  return {
    id: `mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body?.model ?? "mock-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: Math.ceil(promptChars / 4),
      completion_tokens: Math.ceil(content.length / 4),
      total_tokens: Math.ceil((promptChars + content.length) / 4),
    },
  };
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/v1/models" || req.url === "/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-model", object: "model" }] }));
    return;
  }
  if (req.method !== "POST" || (!req.url?.includes("/chat/completions") && req.url !== "/chat/completions")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  let raw = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 8 * 1024 * 1024) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooLarge) return;
    if (process.env.MOCK_LLM_FAIL === "1") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "mock failure for no-fallback test" } }));
      return;
    }
    try {
      const body = JSON.parse(raw);
      const payload = responseFor(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-llm] listening on http://127.0.0.1:${PORT}/v1`);
});
