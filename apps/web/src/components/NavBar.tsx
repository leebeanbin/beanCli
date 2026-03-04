'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

type NavLeaf = { label: string; href: string; desc?: string };
type NavGroup = { label: string; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return 'children' in item;
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  {
    label: 'Data',
    children: [
      { href: '/query',   label: 'Query',   desc: 'SQL 실행기' },
      { href: '/explore', label: 'Explore', desc: '데이터 탐색' },
      { href: '/schema',  label: 'Schema',  desc: '스키마 뷰어' },
    ],
  },
  {
    label: 'Ops',
    children: [
      { href: '/monitor',  label: 'Monitor',  desc: '스트림 통계' },
      { href: '/indexes',  label: 'Indexes',  desc: '인덱스 관리' },
      { href: '/audit',    label: 'Audit',    desc: '감사 로그' },
      { href: '/recovery', label: 'Recovery', desc: 'DLQ 복구' },
    ],
  },
  {
    label: 'Changes',
    children: [
      { href: '/changes',   label: 'Changes',   desc: '변경 요청' },
      { href: '/approvals', label: 'Approvals', desc: '승인 대기' },
    ],
  },
  { label: 'Auth',        href: '/auth' },
  { label: 'Connections', href: '/connections', desc: 'DB 연결 설정' },
];

export function NavBar() {
  const pathname = usePathname();
  const router   = useRouter();
  const isHome   = pathname === '/';

  return (
    <nav className="bg-bg-2 border-b-2 border-rim px-3" style={{ height: '44px' }}>
      <div className="flex items-center h-full gap-0.5">

        {/* ← Back (홈이 아닐 때만 표시) */}
        {!isHome && (
          <button
            onClick={() => router.back()}
            className="font-pixel text-lg text-fg-2 hover:text-accent px-2 h-full flex items-center border-b-2 border-transparent hover:border-accent transition-none shrink-0 gap-1"
            title="Go back"
          >
            ◀ Back
          </button>
        )}

        {/* Logo */}
        <Link
          href="/"
          className={`font-pixel text-xl text-accent tracking-widest h-full flex items-center px-3 border-b-2 border-transparent hover:text-fg transition-none shrink-0 ${!isHome ? 'border-l border-rim ml-1' : ''}`}
        >
          BeanCLI
        </Link>

        {/* Separator */}
        <div className="w-px h-5 bg-rim mx-1 shrink-0" />

        {/* Nav items */}
        {NAV.map((item) =>
          isGroup(item) ? (
            <div key={item.label} className="relative group h-full flex items-center">
              <button className="font-pixel text-lg text-fg-2 hover:text-accent px-2.5 h-full border-b-2 border-transparent group-hover:border-accent group-hover:text-accent transition-none flex items-center gap-1">
                {item.label}
                <span className="text-xs opacity-50">▾</span>
              </button>
              <div className="absolute top-full left-0 hidden group-hover:block bg-bg-2 border border-rim shadow-px-a z-50 min-w-40">
                <div className="px-2 pt-1 pb-0.5 font-pixel text-base text-fg-2 border-b border-rim">
                  [ {item.label} ]
                </div>
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className="block px-3 py-1.5 hover:bg-accent hover:text-bg transition-none group/item"
                  >
                    <div className="font-pixel text-lg text-fg group-hover/item:text-bg">{child.label}</div>
                    {child.desc && (
                      <div className="font-mono text-xs text-fg-2 group-hover/item:text-bg opacity-80">{child.desc}</div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <Link
              key={(item as NavLeaf).href}
              href={(item as NavLeaf).href}
              className={`font-pixel text-lg text-fg-2 hover:text-accent px-2.5 h-full flex items-center border-b-2 border-transparent hover:border-accent transition-none ${
                pathname === (item as NavLeaf).href ? 'border-accent text-accent' : ''
              }`}
            >
              {item.label}
            </Link>
          ),
        )}

        {/* Right */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
