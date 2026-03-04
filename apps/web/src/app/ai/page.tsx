'use client';

import { useState, useRef, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { useLang } from '../../lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface HealthData {
  status?: string;
  model?: string;
}

interface ModelsData {
  models?: string[];
}

export default function AiPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';
  const { t } = useLang();

  const QUICK_PROMPTS = [
    { label: t('ai.prompt1.label'), sql: t('ai.prompt1.sql') },
    { label: t('ai.prompt2.label'), sql: t('ai.prompt2.sql') },
    { label: t('ai.prompt3.label'), sql: t('ai.prompt3.sql') },
    { label: t('ai.prompt4.label'), sql: t('ai.prompt4.sql') },
  ];

  useEffect(() => {
    void (async () => {
      const [hRes, mRes] = await Promise.all([
        apiClient.get<HealthData>('/api/v1/ai/health'),
        apiClient.get<ModelsData>('/api/v1/ai/models'),
      ]);
      if (hRes.ok && hRes.data) setHealth(hRes.data);
      if (mRes.ok && mRes.data?.models) {
        setModels(mRes.data.models);
        setModel(mRes.data.models[0] ?? '');
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;
    setInput('');
    const userMsg: Message = { role: 'user', content: msg };
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);
    setStreaming(true);

    const allMsgs = [...messages, userMsg];
    let aiContent = '';
    const aiIdx = allMsgs.length;

    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('tfsdc_token') : null;
      const res = await fetch(`${apiBase}/api/v1/ai/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: allMsgs,
          model: model || undefined,
          includeSchema: true,
        }),
      });

      if (!res.ok) {
        setMessages((prev) => {
          const next = [...prev];
          next[aiIdx] = { role: 'assistant', content: `⚠ API error: HTTP ${res.status}` };
          return next;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setStreaming(false); return; }

      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: 'chunk' | 'done' | 'error';
              content?: string;
            };
            if (evt.type === 'chunk' && evt.content) {
              aiContent += evt.content;
              setMessages((prev) => {
                const next = [...prev];
                next[aiIdx] = { role: 'assistant', content: aiContent };
                return next;
              });
            } else if (evt.type === 'done') {
              setMessages((prev) => {
                const next = [...prev];
                next[aiIdx] = { role: 'assistant', content: evt.content ?? aiContent };
                return next;
              });
            } else if (evt.type === 'error') {
              setMessages((prev) => {
                const next = [...prev];
                next[aiIdx] = { role: 'assistant', content: `⚠ ${evt.content ?? 'AI error'}` };
                return next;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[aiIdx] = {
          role: 'assistant',
          content: `⚠ ${err instanceof Error ? err.message : 'Network error'}`,
        };
        return next;
      });
    }
    setStreaming(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-pixel text-3xl text-fg">[ AI Assistant ]</h1>
        <div className="flex items-center gap-3">
          {/* Sidecar status */}
          <div className="flex items-center gap-2 bg-bg-2 border border-rim shadow-px px-3 py-1">
            <span
              className={`font-mono text-xs ${
                health === null
                  ? 'text-fg-2'
                  : health.status === 'ok'
                    ? 'text-ok'
                    : 'text-danger'
              }`}
            >
              {health === null ? '◌ connecting' : health.status === 'ok' ? '● online' : '○ offline'}
            </span>
            {health?.model && (
              <span className="font-mono text-xs text-fg-2 border-l border-rim pl-2">
                {health.model}
              </span>
            )}
          </div>
          {/* Model selector */}
          {models.length > 0 && (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="font-mono text-xs bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="font-pixel text-lg text-fg-2 hover:text-danger border border-rim hover:border-danger px-2 py-0.5 transition-none"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Quick prompts sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-bg-2 border border-rim shadow-px p-3">
            <div className="font-pixel text-xl text-fg-2 mb-2">[ Quick Prompts ]</div>
            <div className="space-y-1">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => void send(p.sql)}
                  disabled={streaming}
                  className="w-full text-left font-pixel text-lg text-fg-2 hover:text-accent hover:bg-bg border border-rim hover:border-accent px-2 py-1.5 transition-none disabled:opacity-40"
                >
                  &gt; {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-rim pt-2">
              <div className="font-pixel text-lg text-fg-2 mb-1">{t('ai.widgetSection')}</div>
              <div className="font-mono text-xs text-fg-2 leading-relaxed">
                {t('ai.widgetDesc')}
              </div>
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="lg:col-span-3 flex flex-col" style={{ minHeight: '60vh' }}>
          {/* Messages */}
          <div className="flex-1 bg-bg-2 border border-rim shadow-px p-3 mb-3 overflow-y-auto" style={{ minHeight: '50vh', maxHeight: '65vh' }}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-8">
                <div className="font-pixel text-4xl text-accent">◈</div>
                <div className="font-pixel text-2xl text-fg">AI Assistant</div>
                <div className="font-pixel text-lg text-fg-2 max-w-xs">
                  {t('ai.emptySubtitle')}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="shrink-0 font-pixel text-xl text-accent mt-0.5">◈</div>
                    )}
                    <div
                      className={`max-w-[85%] px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-accent text-bg border border-accent'
                          : 'bg-bg border border-rim text-fg'
                      }`}
                    >
                      <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
                        {msg.content ||
                          (i === messages.length - 1 && streaming ? (
                            <span className="text-fg-2 animate-pulse">{t('ai.generating')}</span>
                          ) : (
                            ''
                          ))}
                      </pre>
                    </div>
                    {msg.role === 'user' && (
                      <div className="shrink-0 font-pixel text-xl text-fg-2 mt-0.5">›</div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="bg-bg-2 border border-rim shadow-px p-3">
            <div className="flex gap-2">
              <div className="font-pixel text-xl text-accent mt-1.5 shrink-0">›</div>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
                autoFocus
                className="flex-1 font-mono text-sm bg-bg border border-rim text-fg px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50"
                placeholder={t('ai.inputPlaceholder')}
              />
              <button
                onClick={() => void send()}
                disabled={streaming || !input.trim()}
                className="px-4 py-2 font-pixel text-xl border-2 border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a disabled:opacity-40 transition-none"
              >
                {streaming ? '▋' : '▶ Send'}
              </button>
            </div>
            <div className="flex items-center gap-3 mt-2 px-5">
              <span className="font-mono text-xs text-fg-2">{t('ai.enterSend')}</span>
              <span className="font-mono text-xs text-fg-2">·</span>
              <span className="font-mono text-xs text-fg-2">{t('ai.quickHint')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
