'use client';

import { useLang } from '../lib/i18n';

export function LangToggle() {
  const { lang, setLang } = useLang();

  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'ko' : 'en')}
      className="font-mono text-xs text-fg-2 hover:text-accent px-2 py-1 border border-rim hover:border-accent shadow-px hover:shadow-px-a transition-none"
      title="Toggle language / 언어 전환"
    >
      {lang === 'en' ? '[KO]' : '[EN]'}
    </button>
  );
}
