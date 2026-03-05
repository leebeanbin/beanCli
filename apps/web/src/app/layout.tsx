import './globals.css';
import type { Metadata } from 'next';
import { NavBar } from '../components/NavBar';
import { AiChatWidget } from '../components/AiChatWidget';
import { LangProvider } from '../lib/i18n';
import { AuthProvider } from '../context/AuthContext';

export const metadata: Metadata = {
  title: 'BeanCLI Web Console',
  description: 'BeanCLI — Streaming Data Console Web UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('bean-theme');const d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>

      <body className="font-mono text-fg flex justify-center items-start py-6 px-2 sm:py-10 sm:px-4">
        <AuthProvider>
        <LangProvider>

        {/* ╔══════════════════════════════════════════════════════════════╗
            ║            GAME BOY CONSOLE SHELL                          ║
            ╚══════════════════════════════════════════════════════════════╝ */}
        <div
          className="gb-shell w-full flex flex-col"
          style={{ maxWidth: '1160px', minHeight: 'calc(100vh - 80px)' }}
        >
          {/* ── Top brand strip ─────────────────────────────────────── */}
          <div className="flex items-center justify-between px-8 pt-5 pb-4 shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <span className="font-pixel text-2xl text-accent tracking-widest"
                    style={{ textShadow: '0 0 12px var(--c-accent)' }}>
                ◈ BeanCLI
              </span>
              <span className="font-mono text-xs text-fg-2 opacity-60 hidden sm:inline">
                CONSOLE v1.0
              </span>
            </div>

            {/* Status LEDs */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-fg-2 uppercase tracking-wider">PWR</span>
                <span className="gb-led gb-led-ok" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-fg-2 uppercase tracking-wider">NET</span>
                <span className="gb-led gb-led-net" />
              </div>
            </div>
          </div>

          {/* ── Screen bezel ────────────────────────────────────────── */}
          <div className="gb-bezel mx-6 flex-1 flex flex-col">
            {/* id="gb-screen": theme boundary + transform creates new fixed-position
                containing block, so AiChatWidget's fixed coords are relative to
                this screen div, not the viewport. */}
            <div id="gb-screen" className="gb-screen flex-1 flex flex-col bg-bg"
                 style={{ transform: 'translate(0,0)', position: 'relative' }}>
              <NavBar />
              <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
              <AiChatWidget />
            </div>
          </div>

          {/* ── Physical ridge between screen and controls ──────────── */}
          <div className="gb-ridge mx-6 shrink-0" />

          {/* ── Controls strip ──────────────────────────────────────── */}
          <div
            className="flex items-center justify-between shrink-0"
            style={{ padding: '20px 40px 28px' }}
            aria-hidden="true"
          >
            {/* D-pad — larger SVG */}
            <div style={{ userSelect: 'none', cursor: 'default' }}>
              <svg width="88" height="88" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="dp-g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#303c58"/>
                    <stop offset="100%" stopColor="#1c2638"/>
                  </linearGradient>
                  <linearGradient id="dp-g-lm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8898a8"/>
                    <stop offset="100%" stopColor="#6a7a8a"/>
                  </linearGradient>
                  <filter id="dp-sh" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.55"/>
                  </filter>
                </defs>
                {/* vertical */}
                <rect x="29" y="0"  width="30" height="88" rx="6" fill="url(#dp-g)" filter="url(#dp-sh)"/>
                {/* horizontal */}
                <rect x="0"  y="29" width="88" height="30" rx="6" fill="url(#dp-g)" filter="url(#dp-sh)"/>
                {/* center cap */}
                <circle cx="44" cy="44" r="12" fill="#141e2e"/>
                <circle cx="44" cy="44" r="6"  fill="#0e1624"/>
                {/* arrows */}
                <text x="44" y="16"  textAnchor="middle" dominantBaseline="middle" fill="#5a6e88" fontSize="14" fontFamily="monospace" fontWeight="bold">▲</text>
                <text x="44" y="72"  textAnchor="middle" dominantBaseline="middle" fill="#5a6e88" fontSize="14" fontFamily="monospace" fontWeight="bold">▼</text>
                <text x="16" y="44"  textAnchor="middle" dominantBaseline="middle" fill="#5a6e88" fontSize="14" fontFamily="monospace" fontWeight="bold">◀</text>
                <text x="72" y="44"  textAnchor="middle" dominantBaseline="middle" fill="#5a6e88" fontSize="14" fontFamily="monospace" fontWeight="bold">▶</text>
              </svg>
            </div>

            {/* Center: SELECT / START */}
            <div className="flex flex-col items-center gap-4">
              <span className="font-pixel text-base text-fg-2 opacity-20 tracking-widest hidden sm:block">
                BeanCLI
              </span>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="gb-btn-sm font-mono">SELECT</span>
                  <span className="font-mono text-[9px] text-fg-2 opacity-30">⬤</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="gb-btn-sm font-mono">START</span>
                  <span className="font-mono text-[9px] text-fg-2 opacity-30">⬤</span>
                </div>
              </div>
            </div>

            {/* A / B buttons with labels */}
            <div className="flex items-end gap-6">
              {/* Speaker grille */}
              <div
                className="gb-speaker hidden sm:block self-center"
                style={{ width: '50px', height: '44px' }}
              />

              {/* Buttons — slight diagonal offset like real Game Boy */}
              <div className="flex items-end gap-4" style={{ paddingBottom: '8px' }}>
                {/* B — lower */}
                <div className="flex flex-col items-center gap-2" style={{ marginBottom: '0px' }}>
                  <span className="gb-btn-ab gb-btn-b">B</span>
                  <span className="font-mono text-[10px] text-fg-2 opacity-40 tracking-widest">B</span>
                </div>
                {/* A — higher */}
                <div className="flex flex-col items-center gap-2" style={{ marginBottom: '18px' }}>
                  <span className="gb-btn-ab gb-btn-a">A</span>
                  <span className="font-mono text-[10px] text-fg-2 opacity-40 tracking-widest">A</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom rounded foot ─────────────────────────────────── */}
          <div className="h-3 shrink-0" />
        </div>
        {/* ╚══════════════════════════════════════════════════════════════╝ */}

        </LangProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
