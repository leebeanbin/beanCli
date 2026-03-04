'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100')
  : 'http://localhost:3100';

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    const aiMsg: Message = { role: 'assistant', content: '', pending: true };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    const allMsgs = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
    let aiContent = '';

    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('tfsdc_token') : null;
      const res = await fetch(`${API_BASE}/api/v1/ai/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: allMsgs, includeSchema: true }),
      });

      if (!res.ok) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: 'assistant',
            content: `⚠ API error: HTTP ${res.status}`,
          };
          return next;
        });
        setStreaming(false);
        if (!open) setUnread((n) => n + 1);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        setStreaming(false);
        return;
      }

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
                next[next.length - 1] = { role: 'assistant', content: aiContent };
                return next;
              });
            } else if (evt.type === 'done') {
              const final = evt.content ?? aiContent;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: final };
                return next;
              });
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: `⚠ ${err instanceof Error ? err.message : 'Network error'}`,
        };
        return next;
      });
    }

    setStreaming(false);
    if (!open) setUnread((n) => n + 1);
  }, [input, streaming, messages, open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-16 right-4 z-50 flex flex-col bg-bg-2 border-2 border-accent shadow-px-a"
          style={{ width: '360px', height: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-rim bg-bg shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-pixel text-xl text-accent">[ AI Assistant ]</span>
              {streaming && (
                <span className="font-mono text-xs text-warn animate-pulse">● thinking</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <a
                href="/ai"
                className="font-pixel text-lg text-fg-2 hover:text-accent px-1 border border-transparent hover:border-rim transition-none"
                title="Full screen"
              >
                ⤢
              </a>
              <button
                onClick={() => setMessages([])}
                className="font-pixel text-lg text-fg-2 hover:text-danger px-1 border border-transparent hover:border-rim transition-none"
                title="Clear chat"
              >
                ✕
              </button>
              <button
                onClick={() => setOpen(false)}
                className="font-pixel text-lg text-fg-2 hover:text-accent px-1 border border-transparent hover:border-rim transition-none"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-4">
                <div className="font-pixel text-2xl text-accent">◈ AI</div>
                <div className="font-pixel text-lg text-fg-2 text-center px-4">
                  데이터에 대해 무엇이든 물어보세요
                </div>
                {/* Quick prompts */}
                {[
                  '전체 테이블 목록 알려줘',
                  '최근 에러 이벤트 조회해줘',
                  '인덱스 최적화 제안해줘',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="font-mono text-xs text-fg-2 hover:text-accent border border-rim hover:border-accent px-3 py-1 transition-none w-full text-left"
                  >
                    &gt; {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-2 py-1.5 text-xs font-mono ${
                        msg.role === 'user'
                          ? 'bg-accent text-bg border border-accent'
                          : 'bg-bg border border-rim text-fg'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="font-pixel text-lg text-fg-2 mb-0.5">◈ AI</div>
                      )}
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                        {msg.content || (msg.pending ? '▋' : '')}
                      </pre>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-1 p-2 border-t border-rim shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
              className="flex-1 font-mono text-xs bg-bg border border-rim text-fg px-2 py-1.5 focus:outline-none focus:border-accent disabled:opacity-50"
              placeholder="메시지 입력… (Enter)"
            />
            <button
              onClick={() => void send()}
              disabled={streaming || !input.trim()}
              className="font-pixel text-lg border border-accent text-accent hover:bg-accent hover:text-bg px-2 py-1 shadow-px-a disabled:opacity-40 transition-none"
            >
              ▶
            </button>
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-4 right-4 z-50 font-pixel text-xl px-4 py-2 border-2 shadow-px-a transition-none ${
          open
            ? 'bg-accent text-bg border-accent'
            : 'bg-bg-2 text-accent border-accent hover:bg-accent hover:text-bg'
        }`}
        title="AI Assistant"
      >
        {open ? '▼ AI' : '◈ AI'}
        {!open && unread > 0 && (
          <span className="ml-2 bg-danger text-bg font-mono text-xs px-1">{unread}</span>
        )}
      </button>
    </>
  );
}
