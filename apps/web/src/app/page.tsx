'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient } from '../lib/api';
import { loadConnections, type DbConnection } from '../lib/connections';
import { useLang } from '../lib/i18n';

interface HealthData {
  status: string;
  db?: { status: string; p95LatencyMs: number };
  kafka?: { status: string; consumerLag: number };
  wsConnections?: number;
  uptime?: number;
}

const DB_BADGE: Record<string, { abbr: string; color: string }> = {
  postgresql:    { abbr: 'PG', color: '#336791' },
  mysql:         { abbr: 'MY', color: '#e48e00' },
  sqlite:        { abbr: 'SQ', color: '#44a347' },
  mongodb:       { abbr: 'MG', color: '#13aa52' },
  redis:         { abbr: 'RD', color: '#d92b21' },
  kafka:         { abbr: 'KF', color: '#231f20' },
  rabbitmq:      { abbr: 'RB', color: '#ff6600' },
  elasticsearch: { abbr: 'ES', color: '#005571' },
  nats:          { abbr: 'NT', color: '#27aee0' },
};

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [conns, setConns] = useState<DbConnection[]>([]);
  const { t } = useLang();

  useEffect(() => {
    setConns(loadConnections());
    void (async () => {
      const res = await apiClient.get<HealthData>('/health');
      setHealth(res.ok ? (res.data ?? null) : null);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-pixel text-3xl text-fg">[ Dashboard ]</h1>

      {/* ── DB Connections ───────────────────────────────────────────── */}
      <div className="bg-bg-2 border border-rim shadow-px">
        <div className="flex items-center justify-between px-4 py-2 border-b border-rim">
          <span className="font-pixel text-xl text-accent">[ DB Connections ]</span>
          <Link
            href="/connections"
            className="font-pixel text-base text-fg-2 hover:text-accent transition-none border border-rim px-3 py-0.5 hover:border-accent"
          >
            + Manage
          </Link>
        </div>

        {conns.length === 0 ? (
          /* ── No connections yet ── */
          <div className="p-6 flex flex-col items-center gap-3 text-center">
            <div className="font-pixel text-2xl text-fg-2 opacity-40">◈</div>
            <p className="font-pixel text-xl text-fg-2">No connections configured</p>
            <p className="font-mono text-xs text-fg-2 opacity-60">
              {t('dashboard.noConnsDesc')}
            </p>
            <Link
              href="/connections"
              className="font-pixel text-lg bg-accent text-bg px-5 py-1.5 hover:opacity-80 transition-none shadow-px-a mt-1"
            >
              ▶ Set up Connection
            </Link>
          </div>
        ) : (
          /* ── Connection list ── */
          <div className="divide-y divide-rim/30">
            {conns.map((conn) => {
              const b = DB_BADGE[conn.type] ?? { abbr: conn.type.slice(0, 2).toUpperCase(), color: '#888' };
              return (
                <div key={conn.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className="font-pixel text-sm px-1.5 py-0.5 shrink-0"
                    style={{ background: b.color, color: '#fff', minWidth: '32px', textAlign: 'center' }}
                  >
                    {b.abbr}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-pixel text-lg text-fg">{conn.label}</span>
                    <span className="font-mono text-xs text-fg-2 ml-3">
                      {conn.type === 'sqlite'
                        ? (conn.host ?? '—')
                        : `${conn.host ?? 'localhost'}:${conn.port ?? ''}`}
                      {conn.database ? ` / ${conn.database}` : ''}
                    </span>
                  </div>
                  {conn.isDefault && (
                    <span className="font-mono text-xs text-ok border border-ok/40 px-1.5 py-0.5 shrink-0">
                      default
                    </span>
                  )}
                </div>
              );
            })}
            <div className="px-4 py-2 border-t border-rim/20">
              <Link
                href="/connections"
                className="font-mono text-xs text-fg-2 hover:text-accent transition-none"
              >
                ⚙ Edit connections →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── API Health ───────────────────────────────────────────────── */}
      <div>
        <div className="font-pixel text-xl text-fg-2 mb-3">[ API Server ]</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-bg-2 border border-rim shadow-px p-4">
            <div className="font-pixel text-base text-fg-2 mb-1">Status</div>
            <div className={`font-pixel text-2xl ${
              loading ? 'text-fg-2' : health?.status === 'ok' ? 'text-ok' : 'text-danger'
            }`}>
              {loading ? '…' : (health?.status ?? 'unreachable')}
            </div>
          </div>

          <div className="bg-bg-2 border border-rim shadow-px p-4">
            <div className="font-pixel text-base text-fg-2 mb-1">DB p95 Latency</div>
            <div className="font-pixel text-2xl text-fg">
              {loading ? '…' : health?.db?.p95LatencyMs != null ? `${health.db.p95LatencyMs}ms` : '—'}
            </div>
          </div>

          <div className="bg-bg-2 border border-rim shadow-px p-4">
            <div className="font-pixel text-base text-fg-2 mb-1">WS Connections</div>
            <div className="font-pixel text-2xl text-fg">
              {loading ? '…' : (health?.wsConnections ?? '—')}
            </div>
          </div>
        </div>
      </div>

      {/* ── System Info ──────────────────────────────────────────────── */}
      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="font-pixel text-xl text-fg-2 mb-3">[ System Info ]</div>
        <dl className="grid grid-cols-2 gap-2 text-xs font-mono">
          <dt className="text-fg-2">Kafka Consumer Lag</dt>
          <dd className="text-fg">{loading ? '…' : (health?.kafka?.consumerLag ?? '—')}</dd>
          <dt className="text-fg-2">Uptime</dt>
          <dd className="text-fg">
            {loading ? '…' : health?.uptime != null ? `${Math.floor(health.uptime / 1000)}s` : '—'}
          </dd>
        </dl>
      </div>
    </div>
  );
}
