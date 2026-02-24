import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

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
      <body className="min-h-screen bg-gray-50 font-sans">
        <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-6">
          <span className="font-mono font-bold text-green-400 text-sm">TFSDC</span>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
