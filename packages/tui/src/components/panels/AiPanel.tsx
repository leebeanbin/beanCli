import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import type { AiMessage } from '../../services/types.js';
import { SPINNER } from '../../utils/constants.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string | null;
  intent?: string;
  model?: string;
  ts: Date;
  streaming: boolean;
}

const SYSTEM_MSG =
  'You are beanllm, an expert database assistant integrated into beanCLI. ' +
  'Answer concisely. When generating SQL, wrap it in a ```sql block.';

// ── Compact sidebar view (not focused) ────────────────────────────────────────

interface CompactProps {
  messages: ChatMessage[];
  aiStatus: 'ok' | 'unavailable';
  model: string;
}

const CompactView: React.FC<CompactProps> = ({ messages, aiStatus, model }) => {
  const last = messages[messages.length - 1];
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box gap={1}>
        <Text color={aiStatus === 'ok' ? '#10b981' : '#6b7280'}>
          {aiStatus === 'ok' ? '●' : '○'}
        </Text>
        <Text color="#00d4ff">{model.slice(0, 16)}</Text>
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(20)}</Text>
      {messages.length === 0 ? (
        <Text color="#374151" dimColor>
          Ask anything...
        </Text>
      ) : (
        last && (
          <Box flexDirection="column">
            <Text color={last.role === 'user' ? '#6b7280' : '#a0aec0'} dimColor>
              {last.role === 'user' ? '❯' : '◆'} {last.content.slice(0, 18)}
            </Text>
          </Box>
        )
      )}
      <Text color="#1a2a3a">{'─'.repeat(20)}</Text>
      <Text color="#374151" dimColor>
        Tab/4: open chat
      </Text>
    </Box>
  );
};

// ── Full chat view (focused) ──────────────────────────────────────────────────

interface FullViewProps {
  messages: ChatMessage[];
  input: string;
  streaming: boolean;
  spinIdx: number;
  aiStatus: 'ok' | 'unavailable';
  model: string;
  panelWidth: number;
  onSqlExec: (sql: string) => void;
}

const FullView: React.FC<FullViewProps> = ({
  messages,
  input,
  streaming,
  spinIdx,
  aiStatus,
  model,
  panelWidth,
  onSqlExec: _onSqlExec,
}) => {
  const msgW = Math.max(14, panelWidth - 4);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Status */}
      <Box gap={1}>
        <Text color={aiStatus === 'ok' ? '#10b981' : '#6b7280'}>
          {aiStatus === 'ok' ? '●' : '○'}
        </Text>
        <Text color="#00d4ff">{model.slice(0, msgW - 4)}</Text>
        {streaming && <Text color="#f59e0b">{SPINNER[spinIdx]}</Text>}
      </Box>
      <Text color="#1a2a3a">{'─'.repeat(Math.min(msgW, 40))}</Text>

      {/* Messages */}
      {messages.length === 0 && (
        <Box flexDirection="column">
          <Text color="#374151" dimColor>
            Ask about your database.
          </Text>
          <Text color="#374151" dimColor>
            {'/sql <query>  /clear  /model'}
          </Text>
        </Box>
      )}
      {messages.slice(-6).map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={0}>
          <Text color={msg.role === 'user' ? '#6b7280' : '#00d4ff'} bold>
            {msg.role === 'user' ? '❯ You' : `◆ ${msg.model?.slice(0, 10) ?? 'AI'}`}
            {msg.intent ? ` [${msg.intent}]` : ''}
          </Text>
          <Text color={msg.role === 'user' ? '#a0aec0' : '#e0e0e0'} wrap="wrap">
            {msg.content.slice(0, msgW * 3)}
          </Text>
          {msg.sql && (
            <Box flexDirection="column" marginTop={0}>
              <Text color="#1a2a3a">{'─'.repeat(Math.min(msgW, 30))}</Text>
              <Text color="#f59e0b" wrap="truncate">
                {msg.sql.slice(0, msgW - 2)}
              </Text>
              <Text color="#374151" dimColor>
                Enter:execute
              </Text>
            </Box>
          )}
          <Text color="#1a2a3a">{'─'.repeat(Math.min(msgW, 30))}</Text>
        </Box>
      ))}

      {/* Input */}
      <Box>
        <Text color="#00d4ff" bold>
          {'❯ '}
        </Text>
        <Text color="#e0e0e0">{input}</Text>
        <Text color="#00d4ff">█</Text>
      </Box>
      <Text color="#374151" dimColor>
        Enter:send Esc:clear
      </Text>
    </Box>
  );
};

// ── AiPanel ───────────────────────────────────────────────────────────────────

export const AiPanel: React.FC = () => {
  const {
    focusedPanel,
    overlay,
    paletteOpen,
    connectionService,
    setPendingSql,
    setAppMode,
    setFocusedPanel,
  } = useAppContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const [model, setModel] = useState('beanllm');
  const [aiStatus, setAiStatus] = useState<'ok' | 'unavailable'>('unavailable');
  const streamingRef = useRef('');

  const isActive = focusedPanel === 'ai' && !overlay && !paletteOpen;
  const panelWidth = 24; // right sidebar

  // Spinner
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [streaming]);

  // Check if AI is available
  useEffect(() => {
    setAiStatus(connectionService?.streamAi ? 'ok' : 'unavailable');
  }, [connectionService]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      // Slash commands
      if (text.startsWith('/clear')) {
        setMessages([]);
        setInput('');
        return;
      }
      if (text.startsWith('/model ')) {
        setModel(text.slice(7).trim());
        setInput('');
        return;
      }
      if (text.startsWith('/sql ')) {
        const sql = text.slice(5).trim();
        if (sql) {
          setPendingSql(sql);
          setAppMode('query');
          setFocusedPanel('query');
        }
        setInput('');
        return;
      }

      if (!connectionService?.streamAi) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'AI not available. Check that the beanllm sidecar is running.',
            streaming: false,
            ts: new Date(),
          },
        ]);
        setInput('');
        return;
      }

      // Add user message
      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        streaming: false,
        ts: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setStreaming(true);
      streamingRef.current = '';

      // Build message history for API
      const history: AiMessage[] = [
        { role: 'system', content: SYSTEM_MSG },
        ...[...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
      ];

      // Placeholder streaming message
      const _placeholderIdx = messages.length + 1;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          streaming: true,
          ts: new Date(),
          model,
        },
      ]);

      await connectionService.streamAi(
        history,
        { model },
        {
          onChunk: (chunk) => {
            streamingRef.current += chunk;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.streaming) {
                updated[updated.length - 1] = { ...last, content: streamingRef.current };
              }
              return updated;
            });
          },
          onIntent: (intent) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.streaming) updated[updated.length - 1] = { ...last, intent };
              return updated;
            });
          },
          onDone: (content, sql, mdl) => {
            setStreaming(false);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.streaming) {
                updated[updated.length - 1] = {
                  ...last,
                  content,
                  sql,
                  model: mdl || model,
                  streaming: false,
                };
              }
              return updated;
            });
          },
          onError: (err) => {
            setStreaming(false);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.streaming) {
                updated[updated.length - 1] = {
                  ...last,
                  content: `Error: ${err}`,
                  streaming: false,
                };
              }
              return updated;
            });
          },
        },
      );
    },
    [messages, streaming, model, connectionService, setPendingSql, setAppMode, setFocusedPanel],
  );

  // Execute last SQL from AI response
  const execLastSql = useCallback(() => {
    const lastWithSql = [...messages].reverse().find((m) => m.sql);
    if (lastWithSql?.sql) {
      setPendingSql(lastWithSql.sql);
      setAppMode('query');
      setFocusedPanel('query');
    }
  }, [messages, setPendingSql, setAppMode, setFocusedPanel]);

  useInput((inp, key) => {
    if (!isActive) return;

    if (key.return) {
      if (input.trim()) {
        void sendMessage(input);
      } else {
        execLastSql();
      }
      return;
    }
    if (key.escape) {
      setInput('');
      return;
    }
    if (key.backspace) {
      setInput((s) => s.slice(0, -1));
      return;
    }
    if (inp && inp >= ' ' && !key.ctrl && !key.meta) {
      setInput((s) => s + inp);
      return;
    }
  });

  if (!isActive) {
    return <CompactView messages={messages} aiStatus={aiStatus} model={model} />;
  }

  return (
    <FullView
      messages={messages}
      input={input}
      streaming={streaming}
      spinIdx={spinIdx}
      aiStatus={aiStatus}
      model={model}
      panelWidth={panelWidth}
      onSqlExec={execLastSql}
    />
  );
};
