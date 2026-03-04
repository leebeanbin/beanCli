'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Lang = 'en' | 'ko';

const translations = {
  en: {
    // ── NavBar descriptions ──────────────────────────────────────────
    'nav.query.desc':       'SQL executor',
    'nav.explore.desc':     'Data browser',
    'nav.schema.desc':      'Schema viewer',
    'nav.monitor.desc':     'Stream stats',
    'nav.indexes.desc':     'Index management',
    'nav.audit.desc':       'Audit log',
    'nav.recovery.desc':    'DLQ recovery',
    'nav.changes.desc':     'Change requests',
    'nav.approvals.desc':   'Pending approvals',
    'nav.connections.desc': 'DB connection settings',

    // ── Dashboard ────────────────────────────────────────────────────
    'dashboard.noConnsDesc': 'Register a DB connection to access your data from any page.',

    // ── AI page ──────────────────────────────────────────────────────
    'ai.prompt1.label': 'Table List',
    'ai.prompt1.sql':   'List all tables with their row counts',
    'ai.prompt2.label': 'Error Events',
    'ai.prompt2.sql':   'Write SQL to query error events from the last 24 hours',
    'ai.prompt3.label': 'Index Tips',
    'ai.prompt3.sql':   'Suggest index optimizations for the current table structure',
    'ai.prompt4.label': 'Slow Queries',
    'ai.prompt4.sql':   'Explain how to find and optimize slow queries',
    'ai.widgetSection':      '[ Tips ]',
    'ai.widgetDesc':         'Navigate to this page anytime via the AI link in the nav bar.',
    'ai.emptySubtitle':      'Ask questions about your database, generate SQL, or analyze performance',
    'ai.generating':         '▋ generating...',
    'ai.inputPlaceholder':   'Write SQL, ask about data, request optimizations… (Enter)',
    'ai.enterSend':          'Enter: send',
    'ai.quickHint':          'Click a Quick Prompt on the left to get started',
  },
  ko: {
    // ── NavBar descriptions ──────────────────────────────────────────
    'nav.query.desc':       'SQL 실행기',
    'nav.explore.desc':     '데이터 탐색',
    'nav.schema.desc':      '스키마 뷰어',
    'nav.monitor.desc':     '스트림 통계',
    'nav.indexes.desc':     '인덱스 관리',
    'nav.audit.desc':       '감사 로그',
    'nav.recovery.desc':    'DLQ 복구',
    'nav.changes.desc':     '변경 요청',
    'nav.approvals.desc':   '승인 대기',
    'nav.connections.desc': 'DB 연결 설정',

    // ── Dashboard ────────────────────────────────────────────────────
    'dashboard.noConnsDesc': 'DB 연결을 등록하면 모든 페이지에서 데이터에 접근할 수 있습니다.',

    // ── AI page ──────────────────────────────────────────────────────
    'ai.prompt1.label': '테이블 목록',
    'ai.prompt1.sql':   '전체 테이블 목록과 각 레코드 수를 알려줘',
    'ai.prompt2.label': '에러 조회',
    'ai.prompt2.sql':   '최근 24시간 에러 이벤트를 조회하는 SQL 작성해줘',
    'ai.prompt3.label': '인덱스 제안',
    'ai.prompt3.sql':   '현재 테이블 구조에서 인덱스 최적화 제안해줘',
    'ai.prompt4.label': '느린 쿼리',
    'ai.prompt4.sql':   '느린 쿼리를 찾는 방법과 개선 방법 설명해줘',
    'ai.widgetSection':      '[ 팁 ]',
    'ai.widgetDesc':         '네비게이션 바의 AI 링크로 언제든 이 페이지에 접근할 수 있습니다.',
    'ai.emptySubtitle':      '데이터베이스에 대한 질문, SQL 생성, 성능 분석을 도와드립니다',
    'ai.generating':         '▋ 생성 중...',
    'ai.inputPlaceholder':   'SQL 작성, 데이터 분석, 최적화 제안 등… (Enter)',
    'ai.enterSend':          'Enter: 전송',
    'ai.quickHint':          '좌측 Quick Prompts 클릭으로 빠른 시작',
  },
} as const;

export type TranslationKey = keyof (typeof translations)['en'];

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => translations.en[key],
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bean-lang') as Lang | null;
      if (saved === 'en' || saved === 'ko') setLangState(saved);
    } catch { /* ignore */ }
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    try { localStorage.setItem('bean-lang', l); } catch { /* ignore */ }
  }

  const t = (key: TranslationKey): string => translations[lang][key];

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
