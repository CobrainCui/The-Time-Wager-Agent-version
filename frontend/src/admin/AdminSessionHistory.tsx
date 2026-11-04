import React, { useCallback, useEffect, useState } from "react";
import { uiRem } from "../utils/typography";
import { adminApiUrl, adminAuthHeaders } from "./adminFetch";
import type {
  SessionAnalysis,
  SessionListItem,
  SessionListResponse,
  SessionListStatus,
  SessionStats,
} from "./sessionTypes";

interface Props {
  onBack: () => void;
}

function formatDateTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: number | null, end: number): string {
  if (!start || !end || end <= start) return "—";
  const mins = Math.round((end - start) / 60_000);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

function statusBadge(item: SessionListItem): { label: string; color: string } {
  if (item.mock) return { label: "MOCK", color: "rgba(148,163,184,0.9)" };
  if (item.status === "voided") return { label: "已剔除", color: "rgba(239,68,68,0.85)" };
  if (item.leaderboardRankAtComplete != null && item.leaderboardRankAtComplete <= 10) {
    return { label: `榜内 #${item.leaderboardRankAtComplete}`, color: "rgba(168,85,247,0.9)" };
  }
  return { label: "未上榜", color: "rgba(148,163,184,0.85)" };
}

async function downloadExport(sessionId: string, format: "json" | "xlsx") {
  const res = await fetch(
    adminApiUrl(`/api/admin/sessions/${encodeURIComponent(sessionId)}/export?format=${format}`),
    { headers: adminAuthHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const filename = match ? decodeURIComponent(match[1]) : `session_${sessionId.slice(0, 8)}.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const AdminSessionHistory: React.FC<Props> = ({ onBack }) => {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [list, setList] = useState<SessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SessionListStatus>("active");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [sort, setSort] = useState<"completedAt" | "communityWealth">("completedAt");
  const [detail, setDetail] = useState<SessionListItem | null>(null);
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  /** 列表「导出」两步：先 JSON，再点一次下 Excel */
  const [listExportAwaitingXlsxId, setListExportAwaitingXlsxId] = useState<string | null>(null);
  const [listExportBusyId, setListExportBusyId] = useState<string | null>(null);
  const [listExportHint, setListExportHint] = useState<string | null>(null);

  const pageSize = 20;

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        sort,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (searchDebounced) params.set("q", searchDebounced);

      const [statsRes, listRes] = await Promise.all([
        fetch(adminApiUrl("/api/admin/sessions/stats"), { headers: adminAuthHeaders() }),
        fetch(adminApiUrl(`/api/admin/sessions?${params}`), { headers: adminAuthHeaders() }),
      ]);

      if (statsRes.status === 401 || listRes.status === 401) {
        setError("未授权，请重新登录");
        return;
      }
      if (!statsRes.ok || !listRes.ok) {
        setError("加载失败，请稍后重试");
        return;
      }

      setStats((await statsRes.json()) as SessionStats);
      const data = (await listRes.json()) as SessionListResponse;
      setList(data.items);
      setTotal(data.total);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sort, page, searchDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detail) {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }
    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);
    fetch(adminApiUrl(`/api/admin/sessions/${encodeURIComponent(detail.sessionId)}/analysis`), {
      headers: adminAuthHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? res.statusText);
        }
        return (await res.json()) as SessionAnalysis;
      })
      .then((data) => {
        if (!cancelled) setAnalysis(data);
      })
      .catch((e) => {
        if (!cancelled) setAnalysisError(e instanceof Error ? e.message : "分析数据加载失败");
      })
      .finally(() => {
        if (!cancelled) setAnalysisLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  const handleVoid = async (item: SessionListItem) => {
    const ok = window.confirm(
      `确定剔除场次「${item.communityName}」？\n\n该场次将从全服社区排行榜移除，玩家端后续对局不再计入此社区财富；记录保留为已剔除，可在筛选中查看。`,
    );
    if (!ok) return;
    setVoidingId(item.sessionId);
    try {
      const res = await fetch(adminApiUrl(`/api/admin/sessions/${encodeURIComponent(item.sessionId)}/void`), {
        method: "POST",
        headers: adminAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reason: "管理员剔除" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? "剔除失败");
        return;
      }
      setDetail(null);
      await load();
    } finally {
      setVoidingId(null);
    }
  };

  const handleListDualExport = async (sessionId: string) => {
    if (listExportBusyId) return;
    setListExportBusyId(sessionId);
    try {
      const awaitingThis = listExportAwaitingXlsxId === sessionId;
      if (!awaitingThis) {
        await downloadExport(sessionId, "json");
        setListExportAwaitingXlsxId(sessionId);
        setListExportHint("已下载 JSON。请再点同一行的「继续 Excel」，完成第二份文件。");
        return;
      }
      await downloadExport(sessionId, "xlsx");
      setListExportAwaitingXlsxId(null);
      setListExportHint("已下载 JSON 与 Excel 两份复盘文件。");
    } catch (e) {
      alert(e instanceof Error ? e.message : "导出失败");
    } finally {
      setListExportBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ minHeight: "100vh", background: "#070b14", padding: "2rem 1.5rem", color: "#e2e8f0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: "0.75rem" }}>
            ← 返回控制台
          </button>
          <h1 style={{ fontSize: "2rem", fontWeight: 900, color: "#fbbf24", margin: 0 }}>历史场次汇总</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.85), marginTop: "0.35rem" }}>
            已完成对局档案与全服社区财富榜管理
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => load()} disabled={loading}>
          刷新
        </button>
      </div>

      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          {[
            { label: "有效场次", value: stats.totalActive },
            { label: "本周完成", value: stats.completedThisWeek },
            { label: "榜内场次", value: stats.onLeaderboard },
            { label: "最高社区财富", value: stats.maxCommunityWealth.toLocaleString() },
            { label: "已剔除", value: stats.totalVoided },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "1rem",
                padding: "1rem",
              }}
            >
              <div style={{ fontSize: uiRem(0.72), color: "var(--color-text-muted)" }}>{kpi.label}</div>
              <div style={{ fontSize: uiRem(1.25), fontWeight: 800, color: "#fbbf24", marginTop: "0.25rem" }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1rem",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="搜索社区名 / 房间号"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            flex: "1 1 200px",
            minWidth: "180px",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-card)",
            color: "inherit",
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as SessionListStatus);
            setPage(1);
          }}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-card)",
            color: "inherit",
          }}
        >
          <option value="active">有效场次</option>
          <option value="voided">已剔除</option>
          <option value="all">全部</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "completedAt" | "communityWealth")}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-card)",
            color: "inherit",
          }}
        >
          <option value="completedAt">按完成时间</option>
          <option value="communityWealth">按社区财富</option>
        </select>
      </div>

      {error && (
        <p style={{ color: "#f87171", marginBottom: "1rem" }}>{error}</p>
      )}

      {listExportHint && (
        <p
          role="status"
          style={{
            color: listExportAwaitingXlsxId ? "#93c5fd" : "#86efac",
            marginBottom: "1rem",
            fontSize: uiRem(0.85),
          }}
        >
          {listExportHint}
        </p>
      )}

      <div
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "1.25rem",
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: uiRem(0.82) }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>完成时间</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>社区</th>
              <th style={{ textAlign: "right", padding: "0.75rem 1rem" }}>社区财富</th>
              <th style={{ textAlign: "center", padding: "0.75rem 1rem" }}>人数</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>房间</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>条件 / 种子</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>首富</th>
              <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>状态</th>
              <th style={{ textAlign: "right", padding: "0.75rem 1rem" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && list.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                  加载中…
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                  {statusFilter === "active"
                    ? "暂无归档场次。自功能上线后完成社区命名的对局将自动出现在此列表。"
                    : "没有匹配的场次"}
                </td>
              </tr>
            ) : (
              list.map((item) => {
                const badge = statusBadge(item);
                return (
                  <tr key={item.sessionId} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "0.65rem 1rem", whiteSpace: "nowrap" }}>
                      {formatDateTime(item.completedAt)}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", fontWeight: 600 }}>{item.communityName}</td>
                    <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {item.communityWealth.toLocaleString()}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", textAlign: "center" }}>{item.playerCount || "—"}</td>
                    <td
                      style={{
                        padding: "0.65rem 1rem",
                        fontFamily: "var(--font-mono)",
                        color: "#fbbf24",
                      }}
                    >
                      {item.roomId}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", fontSize: uiRem(0.74), color: "#c4b5fd" }}>
                      {item.condition ?? "ad-hoc"} / {item.seed ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      {item.topPlayer.name}
                      <span style={{ color: "var(--color-text-muted)", marginLeft: "0.35rem" }}>
                        ({item.topPlayer.wealth.toLocaleString()})
                      </span>
                    </td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <span
                        style={{
                          fontSize: uiRem(0.68),
                          fontWeight: 700,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "9999px",
                          background: badge.color,
                          color: "#0a0a0a",
                        }}
                      >
                        {badge.label}
                      </span>
                      {item.migrated && (
                        <span
                          style={{
                            display: "block",
                            fontSize: uiRem(0.65),
                            color: "var(--color-text-muted)",
                            marginTop: "0.2rem",
                          }}
                        >
                          榜单迁移
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDetail(item)}
                        style={{ marginRight: "0.25rem" }}
                      >
                        详情
                      </button>
                      {item.status === "active" && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={voidingId === item.sessionId}
                          onClick={() => handleVoid(item)}
                          style={{ color: "#f87171", marginRight: "0.25rem" }}
                        >
                          剔除
                        </button>
                      )}
                      {item.hasSnapshot && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={listExportBusyId === item.sessionId}
                          title={
                            listExportAwaitingXlsxId === item.sessionId
                              ? "继续下载 Excel"
                              : "先 JSON 再 Excel，避免浏览器拦截双文件"
                          }
                          onClick={() => handleListDualExport(item.sessionId)}
                        >
                          {listExportBusyId === item.sessionId
                            ? "导出中…"
                            : listExportAwaitingXlsxId === item.sessionId
                              ? "继续 Excel"
                              : "导出"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <span style={{ alignSelf: "center", fontSize: uiRem(0.85), color: "var(--color-text-muted)" }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}

      {detail && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 1000,
          }}
          onClick={() => setDetail(null)}
        >
          <div
            style={{
              width: "min(420px, 100%)",
              height: "100%",
              background: "#0f172a",
              borderLeft: "1px solid var(--color-border)",
              padding: "1.5rem",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, color: "#fbbf24", fontSize: uiRem(1.1) }}>{detail.communityName}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>关闭</button>
            </div>
            <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.8), marginTop: "0.5rem" }}>
              社区财富 {detail.communityWealth.toLocaleString()} · {formatDateTime(detail.completedAt)}
            </p>
            <dl style={{ fontSize: uiRem(0.8), marginTop: "1rem" }}>
              <dt style={{ color: "var(--color-text-muted)" }}>对局时长</dt>
              <dd>{formatDuration(detail.sessionStartedAt, detail.completedAt)}</dd>
              <dt style={{ color: "var(--color-text-muted)", marginTop: "0.5rem" }}>时代主题</dt>
              <dd>{detail.eraTheme ?? "—"}</dd>
              <dt style={{ color: "var(--color-text-muted)", marginTop: "0.5rem" }}>房间号</dt>
              <dd style={{ fontFamily: "var(--font-mono)" }}>{detail.roomId}</dd>
              <dt style={{ color: "var(--color-text-muted)", marginTop: "0.5rem" }}>场次 ID</dt>
              <dd style={{ fontFamily: "var(--font-mono)", fontSize: uiRem(0.72), wordBreak: "break-all" }}>
                {detail.sessionId}
              </dd>
              {detail.migrated && (
                <>
                  <dt style={{ color: "var(--color-text-muted)", marginTop: "0.5rem" }}>说明</dt>
                  <dd>无完整快照，仅榜单迁移数据</dd>
                </>
              )}
            </dl>
            <h3 style={{ fontSize: uiRem(0.9), marginTop: "1.25rem" }}>玩家终局</h3>
            <table style={{ width: "100%", fontSize: uiRem(0.78), marginTop: "0.5rem" }}>
              <thead>
                <tr style={{ color: "var(--color-text-muted)" }}>
                  <th style={{ textAlign: "left", padding: "0.35rem 0" }}>昵称</th>
                  <th style={{ textAlign: "right" }}>财富</th>
                </tr>
              </thead>
              <tbody>
                {(detail.playersSummary.length ? detail.playersSummary : [{ name: "—", wealth: 0 }]).map((p) => (
                  <tr key={p.name}>
                    <td style={{ padding: "0.35rem 0" }}>
                      {p.name}
                      {p.isAI ? " (AI)" : ""}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {p.wealth.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ fontSize: uiRem(0.9), marginTop: "1.25rem" }}>实验分析</h3>
            {analysisLoading && (
              <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.78) }}>加载分析数据…</p>
            )}
            {analysisError && (
              <p style={{ color: "#f87171", fontSize: uiRem(0.78) }}>{analysisError}</p>
            )}
            {analysis && !analysis.metrics && (
              <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.78) }}>
                该场次是旧版归档，没有内置指标；请导出 JSON 后离线计算，或重新跑一局实验室版。
              </p>
            )}
            {analysis?.metrics && (
              <>
                <div
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "0.5rem",
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.25)",
                    fontSize: uiRem(0.74),
                    lineHeight: 1.6,
                  }}
                >
                  <div>条件：{String(analysis.meta.condition ?? "ad-hoc")}</div>
                  <div>种子：{String(analysis.meta.seed ?? "—")}</div>
                  <div>模型：{(analysis.meta.models ?? []).join(" / ") || "—"}</div>
                  <div>提示词版本：{String((analysis.meta.experiment as { promptVersion?: string } | null)?.promptVersion ?? "—")}</div>
                </div>

                <h4 style={{ fontSize: uiRem(0.82), marginTop: "1rem", color: "#fbbf24" }}>局级指标</h4>
                <table style={{ width: "100%", fontSize: uiRem(0.74), marginTop: "0.35rem" }}>
                  <tbody>
                    {[
                      ["最终财富合计", analysis.metrics.game.totalWealth],
                      ["财富极差", analysis.metrics.game.wealthRange],
                      ["基尼系数", analysis.metrics.game.gini],
                      ["财富变异系数", analysis.metrics.game.wealthCv],
                      ["转账笔数 / 金额", `${analysis.metrics.game.transferCount} / ${analysis.metrics.game.transferVolume}`],
                      ["关系互惠率", analysis.metrics.game.transferReciprocity],
                      ["公开 / 私聊条数", `${analysis.metrics.game.publicMessageCount} / ${analysis.metrics.game.privateMessageCount}`],
                      ["干扰次数", analysis.metrics.game.attackCount],
                      ["预测平均 τ / MAE", `${analysis.metrics.game.meanPredictionTau ?? "—"} / ${analysis.metrics.game.meanPredictionMae ?? "—"}`],
                    ].map(([label, value]) => (
                      <tr key={String(label)}>
                        <td style={{ padding: "0.2rem 0", color: "var(--color-text-muted)" }}>{String(label)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{String(value ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 style={{ fontSize: uiRem(0.82), marginTop: "1rem", color: "#fbbf24" }}>玩家指标</h4>
                <div style={{ overflowX: "auto", marginTop: "0.35rem" }}>
                  <table style={{ width: "100%", fontSize: uiRem(0.7), borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "0.25rem 0.35rem" }}>玩家</th>
                        <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>财富</th>
                        <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>名次</th>
                        <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>长期%</th>
                        <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>风险%</th>
                        <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>转出/入</th>
                        <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>公开/私聊</th>
                        <th style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>预测τ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.metrics.players.map((p) => (
                        <tr key={p.playerId} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: "0.25rem 0.35rem" }}>
                            {p.name}
                            {p.agentIndex != null ? ` #${p.agentIndex}` : ""}
                          </td>
                          <td style={{ padding: "0.25rem 0.35rem", textAlign: "right", fontFamily: "var(--font-mono)" }}>{p.finalWealth}</td>
                          <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{p.finalRank}</td>
                          <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{Math.round(p.longShare * 100)}</td>
                          <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{Math.round(p.riskShare * 100)}</td>
                          <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{p.transfersSent}/{p.transfersReceived}</td>
                          <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{p.publicMessages}/{p.privateMessages}</td>
                          <td style={{ padding: "0.25rem 0.35rem", textAlign: "right" }}>{p.predictionTau ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h4 style={{ fontSize: uiRem(0.82), marginTop: "1rem", color: "#fbbf24" }}>预测记录</h4>
                {analysis.predictions.length === 0 ? (
                  <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.74) }}>无预测记录</p>
                ) : (
                  <div style={{ maxHeight: "220px", overflowY: "auto", marginTop: "0.35rem" }}>
                    {analysis.predictions.map((p) => {
                      const score = analysis.metrics.predictionScores.find((s) => s.predictionId === p.id);
                      return (
                        <div
                          key={p.id}
                          style={{
                            fontSize: uiRem(0.7),
                            padding: "0.35rem 0",
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <span style={{ color: "#fbbf24" }}>{p.playerName}</span>
                          <span style={{ color: "var(--color-text-muted)" }}> 时代 {p.era} </span>
                          <span>{p.ranking.map((id) => analysis.players.find((x) => x.id === id)?.name ?? id).join(" > ")}</span>
                          <span style={{ color: "var(--color-text-muted)" }}>
                            {" "}τ={score?.tau ?? "—"} MAE={score?.mae ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <h4 style={{ fontSize: uiRem(0.82), marginTop: "1rem", color: "#fbbf24" }}>通信记录</h4>
                {analysis.groupMessages.length + analysis.directMessages.length === 0 ? (
                  <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.74) }}>无通信记录</p>
                ) : (
                  <div style={{ maxHeight: "240px", overflowY: "auto", marginTop: "0.35rem" }}>
                    {[
                      ...analysis.groupMessages.map((m) => ({
                        id: m.id,
                        ts: m.timestamp,
                        text: `[公开] ${m.fromName}: ${m.text}`,
                      })),
                      ...analysis.directMessages.map((m) => ({
                        id: m.id,
                        ts: m.timestamp,
                        text: `[私聊] ${m.fromName} → ${m.toName}: ${m.text}`,
                      })),
                    ]
                      .sort((a, b) => a.ts - b.ts)
                      .slice(-80)
                      .map((m) => (
                        <div
                          key={m.id}
                          style={{
                            fontSize: uiRem(0.7),
                            padding: "0.25rem 0",
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {m.text}
                        </div>
                      ))}
                  </div>
                )}
                <h4 style={{ fontSize: uiRem(0.82), marginTop: "1rem", color: "#fbbf24" }}>Agent 决策</h4>
                {analysis.agentDecisions.length === 0 ? (
                  <p style={{ color: "var(--color-text-muted)", fontSize: uiRem(0.74) }}>无 Agent 决策记录</p>
                ) : (
                  <div style={{ maxHeight: "260px", overflowY: "auto", marginTop: "0.35rem" }}>
                    {analysis.agentDecisions.slice(-100).reverse().map((d) => (
                      <div
                        key={d.id}
                        style={{
                          fontSize: uiRem(0.7),
                          padding: "0.3rem 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={{ color: "#60a5fa" }}>{d.playerName}</span>
                        <span style={{ color: "var(--color-text-muted)" }}>
                          {" "}
                          {d.kind}
                          {d.totalTokens ? ` · ${d.totalTokens} tok` : ""}
                          {d.latencyMs ? ` · ${d.latencyMs}ms` : ""}
                        </span>
                        <div style={{ color: "var(--color-text-secondary)" }}>{d.reasoning}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {detail.hasSnapshot && (
              <div style={{ marginTop: "1.25rem" }}>
                <p
                  style={{
                    margin: "0 0 0.75rem",
                    fontSize: uiRem(0.8),
                    color: "var(--color-text-muted)",
                  }}
                >
                  复盘含 JSON 与 Excel 两份文件。请分别点击下载（浏览器可能拦截同一次点击的第二个文件）。
                </p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      downloadExport(detail.sessionId, "json").catch((e) =>
                        alert(e instanceof Error ? e.message : "导出失败"),
                      )
                    }
                  >
                    下载 JSON 复盘
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      downloadExport(detail.sessionId, "xlsx").catch((e) =>
                        alert(e instanceof Error ? e.message : "导出失败"),
                      )
                    }
                  >
                    下载 Excel 复盘
                  </button>
                </div>
              </div>
            )}
            {detail.status === "active" && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: "1rem", color: "#f87171" }}
                disabled={voidingId === detail.sessionId}
                onClick={() => handleVoid(detail)}
              >
                从排行榜剔除本场
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
