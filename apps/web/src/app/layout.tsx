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
  { href: '/query', label: 'Query' },
  { href: '/explore', label: 'Explore' },
  { href: '/schema', label: 'Schema' },
  { href: '/monitor', label: 'Monitor' },
  { href: '/indexes', label: 'Indexes' },
  { href: '/audit', label: 'Audit' },
  { href: '/recovery', label: 'Recovery' },
  { href: '/ai', label: 'AI' },
  { href: '/changes', label: 'Changes' },
  { href: '/approvals', label: 'Approvals' },
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
        <nav className="bg-bg-2 border-b-2 border-rim px-4 py-0">
          <div className="flex items-center flex-wrap gap-x-0 gap-y-0">
            <span className="font-pixel text-xl text-accent tracking-widest pr-3 border-r border-rim mr-2 py-2">
              TFSDC
            </span>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-pixel text-lg text-fg-2 hover:text-accent px-2 py-2 border-b-2 border-transparent hover:border-accent transition-none"
              >
                {item.label}
              </Link>
            ))}
            <div className="ml-auto py-1">
              <ThemeToggle />
            </div>
          </div>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
