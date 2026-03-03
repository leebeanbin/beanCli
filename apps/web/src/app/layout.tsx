import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';

export const metadata: Metadata = {
  title: 'TFSDC Web Console',
  description: 'Terminal-First Streaming Data Console — Web UI',
};

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/connections', label: 'Connections' },
  { href: '/changes', label: 'Changes' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/state/state_orders', label: 'State' },
  { href: '/audit', label: 'Audit' },
  { href: '/recovery', label: 'Recovery' },
  { href: '/auth', label: 'Auth' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* 플래시 방지: 첫 렌더 전에 dark 클래스 적용 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('bean-theme');const d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg font-mono text-fg">
        <nav className="bg-bg-2 border-b-2 border-rim flex items-center px-4 py-2 gap-1">
          <span className="font-pixel text-2xl text-accent tracking-widest mr-4">TFSDC</span>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-mono text-xs text-fg-2 hover:text-accent uppercase tracking-widest px-2 py-1 border border-transparent hover:border-rim transition-none"
            >
              {item.label}
            </Link>
          ))}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
