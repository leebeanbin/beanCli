'use client';

import { useState, useRef, useEffect } from 'react';
import { apiClient } from '../../lib/api';

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
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

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

  async function send() {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const allMsgs = [...messages, userMsg];
    let aiContent = '';
    const aiIdx = allMsgs.length;

    setMessages((prev) => [...prev, { role: 'assistant', content: '…' }]);

    try {
      const res = await fetch(`${apiBase}/api/v1/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMsgs, model: model || undefined, includeSchema: true }),
      });

      if (!res.ok) {
        setMessages((prev) => {
          const next = [...prev];
          next[aiIdx] = { role: 'assistant', content: `Error: HTTP ${res.status}` };
          return next;
        });
        setStreaming(false);
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
                next[aiIdx] = { role: 'assistant', content: aiContent };
                return next;
              });
            } else if (evt.type === 'done') {
              const final = evt.content ?? aiContent;
              setMessages((prev) => {
                const next = [...prev];
                next[aiIdx] = { role: 'assistant', content: final };
                return next;
              });
            } else if (evt.type === 'error') {
              setMessages((prev) => {
                const next = [...prev];
                next[aiIdx] = { role: 'assistant', content: `Error: ${evt.content ?? 'AI error'}` };
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
        next[aiIdx] = {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Network error'}`,
        };
        return next;
      });
    }

    setStreaming(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-4">[ AI Assistant ]</h1>

      {/* Status bar */}
      <div className="flex items-center gap-4 mb-4">
        {health && (
          <span
            className={`font-pixel text-lg ${health.status === 'ok' ? 'text-ok' : 'text-danger'}`}
          >
            ● Sidecar: {health.status ?? '?'}
          </span>
        )}
        {models.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-pixel text-lg text-fg-2">Model:</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="font-mono text-sm bg-bg border border-rim text-fg px-2 py-0.5 focus:outline-none focus:border-accent"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="font-pixel text-lg text-fg-2 hover:text-danger ml-auto"
          >
            Clear
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="bg-bg-2 border border-rim shadow-px p-4 mb-3 min-h-64 max-h-[60vh] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="font-pixel text-xl text-fg-2 py-8 text-center">
            Ask anything about your data…
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 font-mono text-sm ${
                    msg.role === 'user'
                      ? 'bg-accent text-bg border border-accent'
                      : 'bg-bg border border-rim text-fg'
                  }`}
                >
                  <div className="font-pixel text-lg mb-1 opacity-60">
                    {msg.role === 'user' ? 'You' : 'AI'}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                    {msg.content}
                  </pre>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          className="flex-1 font-mono text-sm bg-bg border border-rim text-fg px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50"
          placeholder="Ask about your data… (Enter to send)"
        />
        <button
          onClick={() => void send()}
          disabled={streaming || !input.trim()}
          className="px-3 py-2 font-pixel text-xl border border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a disabled:opacity-40 transition-none whitespace-nowrap"
        >
          {streaming ? 'Thinking…' : '[ Send ]'}
        </button>
      </div>
    </div>
  );
}
