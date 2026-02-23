import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

type Summary = {
  projectId: string;
  status: "ACTIVE" | "PAUSED" | "KILL_SWITCH";
  signalsCount: number;
  executionsCount: number;
  realizedPnL: number;
  lastSignalAt: string | null;
  lastExecutionAt: string | null;
};

type RiskResponse = {
  projectId: string;
  testnet: boolean;
  baseUrl: string;
  symbol: string;
  positions: RiskPosition[];
  openOrdersCount: number;
  openOrders: any[];
};

type RiskPosition = {
  symbol: string;
  positionSide: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unrealizedProfit: string;
  leverage: string;
  marginType: string;
  liquidationPrice: string;
  notional: string;
  updateTime: number;
};

type ExecutionsResponse = {
  total: number;
  limit: number;
  offset: number;
  items: ExecutionRow[];
};

type ExecutionRow = {
  id: number;
  createdAt: string;
  projectId: string;
  signalId: number;
  type: string;
  status: string;
  orderId: string | null;
  exchangeRaw?: any;
};

type SignalsResponse = {
  total: number;
  limit: number;
  offset: number;
  items: SignalRow[];
};

type SignalRow = {
  createdAt: string;
  signalId: string;
  projectId: string;
  status: string;
  normalized?: any;
  raw?: any;
};

type TabKey = "signals" | "executions" | "risk";

function fmtTs(ts: string | null) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const apiBase = useMemo(() => import.meta.env.VITE_API_URL as string, []);
  const executorBase = useMemo(() => import.meta.env.VITE_EXECUTOR_URL as string, []);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [signals, setSignals] = useState<SignalsResponse | null>(null);
  const [executions, setExecutions] = useState<ExecutionsResponse | null>(null);
  const [risk, setRisk] = useState<RiskResponse | null>(null);

  const [tab, setTab] = useState<TabKey>("signals");
  const [err, setErr] = useState<string | null>(null);

  // Summary
  useEffect(() => {
    if (!projectId) return;
    setErr(null);
    setSummary(null);
    fetch(`${apiBase}/v1/projects/${projectId}/summary`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(setSummary)
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [apiBase, projectId]);

  // Signals (only when tab is active)
  useEffect(() => {
    if (!projectId) return;
    if (tab !== "signals") return;

    setErr(null);
    setSignals(null);
    fetch(`${apiBase}/v1/projects/${projectId}/signals?limit=50&offset=0`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(setSignals)
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [apiBase, projectId, tab]);

  // Executions (only when tab is active)
  useEffect(() => {
    if (!projectId) return;
    if (tab !== "executions") return;

    setErr(null);
    setExecutions(null);
    fetch(`${apiBase}/v1/projects/${projectId}/executions?limit=50&offset=0`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(setExecutions)
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [apiBase, projectId, tab]);

  // Risk (live from executor) (only when tab is active)
  useEffect(() => {
    if (!projectId) return;
    if (tab !== "risk") return;

    setErr(null);
    setRisk(null);

    // symbol inferred server-side; allow manual override later
    fetch(`${executorBase}/v1/projects/${projectId}/risk`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(setRisk)
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [executorBase, projectId, tab]);




  async function setKillSwitch(enabled: boolean) {
    if (!projectId) return;
    const pin = window.prompt("Enter PIN to confirm Kill Switch change:");
    if (!pin) return;

    setErr(null);
    try {
      const r = await fetch(`${apiBase}/v1/projects/${projectId}/kill-switch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, pin }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`${r.status} ${r.statusText} — ${txt}`);
      }
      // refresh summary
      const rs = await fetch(`${apiBase}/v1/projects/${projectId}/summary`);
      if (!rs.ok) throw new Error(`${rs.status} ${rs.statusText}`);
      setSummary(await rs.json());
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link to="/projects">← Projects</Link>
        <h1 style={{ margin: 0 }}>Project: {projectId}</h1>
      </div>

      {err && (
        <div style={{ padding: 12, border: "1px solid #f99", background: "#fff5f5", marginBottom: 16 }}>
          <b>Error:</b> {err}
        </div>
      )}

      {/* Top card grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={cardStyle}>
          <div style={cardTitle}>Status</div>
          <div style={cardValue}>{summary?.status ?? "…"}</div>
          <div style={cardMeta}>Last signal: {fmtTs(summary?.lastSignalAt ?? null)}</div>
          <div style={cardMeta}>Last exec: {fmtTs(summary?.lastExecutionAt ?? null)}</div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitle}>Performance</div>
          <div style={cardValue}>{summary ? summary.realizedPnL.toFixed(2) : "…"} USDT</div>
          <div style={cardMeta}>Realized PnL (placeholder)</div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitle}>Activity</div>
          <div style={cardValue}>{summary?.signalsCount ?? "…"} signals</div>
          <div style={cardMeta}>{summary?.executionsCount ?? "…"} executions</div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitle}>Controls</div>
          <button
            style={{
              ...btnStyle,
              cursor: "pointer",
              background: summary?.status === "KILL_SWITCH" ? "#fff5f5" : "#f5fff6",
              borderColor: summary?.status === "KILL_SWITCH" ? "#f99" : "#9f9",
            }}
            onClick={() => setKillSwitch(!(summary?.status === "KILL_SWITCH"))}
          >
            Kill Switch: {summary?.status === "KILL_SWITCH" ? "ON" : "OFF"}
          </button>
          <button disabled style={btnStyle}>
            Reset (PIN) (next)
          </button>
          <div style={cardMeta}>
            Mode C: blocks new orders + cancels open orders + closes position
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Tab label="Signals" active={tab === "signals"} onClick={() => setTab("signals")} />
          <Tab label="Executions" active={tab === "executions"} onClick={() => setTab("executions")} />
          <Tab label="Risk" active={tab === "risk"} onClick={() => setTab("risk")} />
        </div>

        {tab === "signals" && (
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Signals</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {signals ? `total ${signals.total}` : "loading…"}
              </div>
            </div>

            {signals && signals.items.length === 0 && <div>No signals found.</div>}

            {signals && signals.items.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Time</th>
                      <th style={thStyle}>SignalId</th>
                      <th style={thStyle}>Side</th>
                      <th style={thStyle}>Symbol</th>
                      <th style={thStyle}>Qty</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.items.map((s) => {
                      const side = s.normalized?.side ?? "-";
                      const symbol = s.normalized?.symbol ?? "-";
                      const qty = s.normalized?.qty ?? "-";
                      return (
                        <tr key={s.signalId}>
                          <td style={tdStyle}>{fmtTs(s.createdAt)}</td>
                          <td style={tdStyleMono}>{s.signalId}</td>
                          <td style={tdStyle}>{side}</td>
                          <td style={tdStyle}>{symbol}</td>
                          <td style={tdStyle}>{qty}</td>
                          <td style={tdStyle}>{s.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "executions" && (
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Executions</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {executions ? `total ${executions.total}` : "loading…"}
              </div>
            </div>

            {executions && executions.items.length === 0 && <div>No executions found.</div>}

            {executions && executions.items.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Time</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>OrderId</th>
                      <th style={thStyle}>Symbol</th>
                      <th style={thStyle}>Side</th>
                      <th style={thStyle}>PositionSide</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.items.map((e) => {
                      const symbol = e.exchangeRaw?.symbol ?? "-";
                      const side = e.exchangeRaw?.side ?? "-";
                      const positionSide = e.exchangeRaw?.positionSide ?? "-";
                      return (
                        <tr key={e.id}>
                          <td style={tdStyle}>{fmtTs(e.createdAt)}</td>
                          <td style={tdStyle}>{e.type}</td>
                          <td style={tdStyle}>{e.status}</td>
                          <td style={tdStyleMono}>{e.orderId ?? "-"}</td>
                          <td style={tdStyle}>{symbol}</td>
                          <td style={tdStyle}>{side}</td>
                          <td style={tdStyle}>{positionSide}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "risk" && (
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Live Risk</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {risk ? `${risk.testnet ? "TESTNET" : "PROD"} • ${risk.symbol} • openOrders ${risk.openOrdersCount}` : "loading…"}
              </div>
            </div>

            {risk && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                <div style={cardStyle}>
                  <div style={cardTitle}>Venue</div>
                  <div style={cardValue} title={risk.baseUrl}>{risk.testnet ? "Binance Testnet" : "Binance"}</div>
                  <div style={cardMeta}>{risk.baseUrl}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardTitle}>Open Orders</div>
                  <div style={cardValue}>{risk.openOrdersCount}</div>
                  <div style={cardMeta}>For {risk.symbol}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardTitle}>Positions</div>
                  <div style={cardValue}>{risk.positions?.length ?? 0}</div>
                  <div style={cardMeta}>Hedge mode shows LONG/SHORT</div>
                </div>
              </div>
            )}

            {risk && risk.positions && risk.positions.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Side</th>
                      <th style={thStyle}>Amt</th>
                      <th style={thStyle}>Entry</th>
                      <th style={thStyle}>Mark</th>
                      <th style={thStyle}>UPnL</th>
                      <th style={thStyle}>Lev</th>
                      <th style={thStyle}>Margin</th>
                      <th style={thStyle}>Liq</th>
                      <th style={thStyle}>Notional</th>
                      <th style={thStyle}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risk.positions.map((p) => (
                      <tr key={`${p.symbol}-${p.positionSide}`}>
                        <td style={tdStyle}>{p.positionSide}</td>
                        <td style={tdStyleMono}>{p.positionAmt}</td>
                        <td style={tdStyleMono}>{p.entryPrice}</td>
                        <td style={tdStyleMono}>{p.markPrice}</td>
                        <td style={tdStyleMono}>{p.unrealizedProfit}</td>
                        <td style={tdStyle}>{p.leverage}</td>
                        <td style={tdStyle}>{p.marginType}</td>
                        <td style={tdStyleMono}>{p.liquidationPrice}</td>
                        <td style={tdStyleMono}>{p.notional}</td>
                        <td style={tdStyle}>{p.updateTime ? new Date(p.updateTime).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {risk && (!risk.positions || risk.positions.length === 0) && <div>No positionRisk rows returned.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: active ? "#f5f5f5" : "transparent",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 12,
  background: "white",
  minHeight: 92,
};

const cardTitle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  marginBottom: 8,
};

const cardValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 6,
};

const cardMeta: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fafafa",
  marginBottom: 8,
  cursor: "not-allowed",
};

const panelStyle: React.CSSProperties = {
  padding: 12,
  border: "1px solid #eee",
  borderRadius: 8,
  background: "white",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #eee",
  padding: "8px 8px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f2f2f2",
  padding: "8px 8px",
  whiteSpace: "nowrap",
};

const tdStyleMono: React.CSSProperties = {
  ...tdStyle,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};
