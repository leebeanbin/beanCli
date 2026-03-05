import React, { useState, useEffect } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { Panel } from './Panel.js';
import { StatusBar } from './StatusBar.js';
import { SchemaPanel } from '../panels/SchemaPanel.js';
import { QueryPanel } from '../panels/QueryPanel.js';
import { ResultPanel } from '../panels/ResultPanel.js';
import { ExplorePanel } from '../panels/ExplorePanel.js';
import { MonitorPanel } from '../panels/MonitorPanel.js';
import { IndexPanel } from '../panels/IndexPanel.js';
import { AuditPanel } from '../panels/AuditPanel.js';
import { RecoveryPanel } from '../panels/RecoveryPanel.js';
import { ChangePanel } from '../panels/ChangePanel.js';
import { ApprovalPanel } from '../panels/ApprovalPanel.js';
import { AiPanel } from '../panels/AiPanel.js';
import { ConnectionFormOverlay } from '../connection/ConnectionFormOverlay.js';
import { TablePickerOverlay } from '../overlays/TablePickerOverlay.js';
import { CreateTableOverlay } from '../overlays/CreateTableOverlay.js';
import { HelpOverlay } from '../overlays/HelpOverlay.js';
import { PasswordChangeOverlay } from '../overlays/PasswordChangeOverlay.js';
import { usePanelFocus } from '../../hooks/usePanelFocus.js';
import { useAppContext } from '../../context/AppContext.js';
import { useConnection } from '../../hooks/useConnection.js';
import type { AppMode } from '../../context/AppContext.js';

const VERSION = '0.1.2';

// ── Center panel title/hint ───────────────────────────────────────────────────

const CENTER_TITLES: Record<AppMode, string> = {
  query: 'Query Editor',
  browse: 'Explore',
  monitor: 'Stream Monitor',
  index: 'Index Lab',
  audit: 'Audit Log',
  recovery: 'DLQ Recovery',
  changes: 'Change Requests',
  approvals: 'Pending Approvals',
};

// ── AppShell ─────────────────────────────────────────────────────────────────

export const AppShell: React.FC = () => {
  const { focusedPanel, nextPanel, prevPanel, focusPanel } = usePanelFocus();
  const {
    paletteOpen,
    overlay,
    setOverlay,
    connection,
    env,
    appMode,
    setAppMode,
    browseTable,
    userRole,
  } = useAppContext();
  const { saveConn } = useConnection();
  const { stdout } = useStdout();

  // Track terminal width for layout — re-render on resize
  const [termCols, setTermCols] = useState(stdout.columns ?? 80);
  useEffect(() => {
    const onResize = () => setTermCols(stdout.columns ?? 80);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const isBlocked = paletteOpen || overlay !== null;

  // True when the SQL text editor is active — block shortcut keys that conflict
  const isTypingSQL = appMode === 'query' && focusedPanel === 'query';

  useInput((input, key) => {
    if (isBlocked) return;

    // Panel cycling
    if (key.tab && !key.shift) {
      nextPanel();
      return;
    }
    if (key.tab && key.shift) {
      prevPanel();
      return;
    }

    // Direct panel jump (skip when SQL editor is active to avoid inserting numbers)
    if (!isTypingSQL) {
      if (input === '1') {
        focusPanel('schema');
        return;
      }
      if (input === '2') {
        focusPanel('query');
        return;
      }
      if (input === '3') {
        focusPanel('result');
        return;
      }
      if (input === '4') {
        focusPanel('ai');
        return;
      }
    }

    // t — open table picker
    if (input === 't') {
      setOverlay({ type: 'table-picker' });
      return;
    }

    // Mode shortcuts — block only when SQL text editor is active
    if (!isTypingSQL) {
      if (input === 'm') {
        setAppMode('monitor');
        focusPanel('query');
        return;
      }
      if (input === 'A') {
        setAppMode('audit');
        focusPanel('query');
        return;
      }
      if (input === 'R') {
        setAppMode('recovery');
        focusPanel('query');
        return;
      }
      if (input === 'I') {
        setAppMode('index');
        focusPanel('query');
        return;
      }
      // b — return to browse mode if a table was previously selected
      if (input === 'b' && browseTable) {
        setAppMode('browse');
        focusPanel('query');
        return;
      }
      if (input === 'C') {
        setAppMode('changes');
        focusPanel('query');
        return;
      }
      if (input === 'P') {
        setAppMode('approvals');
        focusPanel('query');
        return;
      }
    }
  });

  // ── Center mode title ─────────────────────────────────────────────────────
  const showConnForm = overlay?.type === 'connection-form';
  const showTablePicker = overlay?.type === 'table-picker';
  const showCreateTable = overlay?.type === 'create-table';
  const showHelp = overlay?.type === 'help';
  const showPasswordChange = overlay?.type === 'password-change';
  const centerTitle =
    appMode === 'browse' ? `Explore · ${browseTable ?? '—'}` : (CENTER_TITLES[appMode] ?? 'Query');

  // ── Center content ────────────────────────────────────────────────────────
  const renderCenter = () => {
    const isCenterFocused = focusedPanel === 'query' || focusedPanel === 'result';

    if (appMode === 'browse') {
      return (
        <Panel title={centerTitle} isFocused={isCenterFocused} hint="2" flexGrow={1}>
          <ExplorePanel />
        </Panel>
      );
    }

    if (appMode === 'monitor') {
      return (
        <Panel title={centerTitle} isFocused={isCenterFocused} hint="2" flexGrow={1}>
          <MonitorPanel />
        </Panel>
      );
    }

    if (appMode === 'index') {
      return (
        <Panel title={centerTitle} isFocused={isCenterFocused} hint="2" flexGrow={1}>
          <IndexPanel />
        </Panel>
      );
    }

    if (appMode === 'audit') {
      return (
        <Panel title={centerTitle} isFocused={isCenterFocused} hint="2" flexGrow={1}>
          <AuditPanel />
        </Panel>
      );
    }

    if (appMode === 'recovery') {
      return (
        <Panel title={centerTitle} isFocused={isCenterFocused} hint="2" flexGrow={1}>
          <RecoveryPanel />
        </Panel>
      );
    }

    if (appMode === 'changes') {
      return (
        <Panel title={centerTitle} isFocused={isCenterFocused} hint="2" flexGrow={1}>
          <ChangePanel />
        </Panel>
      );
    }

    if (appMode === 'approvals') {
      return (
        <Panel title={centerTitle} isFocused={isCenterFocused} hint="2" flexGrow={1}>
          <ApprovalPanel />
        </Panel>
      );
    }

    // Default: query mode
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Panel title="Query Editor" isFocused={focusedPanel === 'query'} hint="2" flexGrow={1}>
          <QueryPanel />
        </Panel>
        <Panel title="Results" isFocused={focusedPanel === 'result'} hint="3" flexGrow={1}>
          <ResultPanel />
        </Panel>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* ── 3-pane area ─────────────────────────────────── */}
      <Box flexGrow={1} width={termCols}>
        {/* Left: Schema tree */}
        <Panel title="Schema" isFocused={focusedPanel === 'schema'} hint="1" width={26}>
          <SchemaPanel />
        </Panel>

        {/* Center: mode-dependent content */}
        {renderCenter()}

        {/* Right: AI Copilot */}
        <Panel
          title="AI · beanllm"
          isFocused={focusedPanel === 'ai'}
          hint="4"
          width={focusedPanel === 'ai' ? 50 : 26}
        >
          <AiPanel />
        </Panel>
      </Box>

      {/* ── Status bar ──────────────────────────────────── */}
      <StatusBar
        version={VERSION}
        env={env}
        connection={connection}
        focused={focusedPanel}
        appMode={appMode}
        userRole={userRole}
      />

      {/* ── ConnectionForm overlay ───────────────────────── */}
      {showConnForm && (
        <Box position="absolute" marginLeft={4} marginTop={2}>
          <ConnectionFormOverlay
            initial={overlay?.conn}
            onSave={(conn) => {
              saveConn(conn);
              setOverlay(null);
            }}
            onCancel={() => setOverlay(null)}
          />
        </Box>
      )}

      {/* ── Table picker overlay (t key) ─────────────────── */}
      {showTablePicker && (
        <Box position="absolute" marginLeft={0} marginTop={0}>
          <TablePickerOverlay />
        </Box>
      )}

      {/* ── Create Table wizard (c key in Schema panel) ───── */}
      {showCreateTable && (
        <Box position="absolute" marginLeft={0} marginTop={0}>
          <CreateTableOverlay />
        </Box>
      )}

      {/* ── Help overlay (? key) ─────────────────────────── */}
      {showHelp && (
        <Box position="absolute" marginLeft={0} marginTop={0}>
          <HelpOverlay />
        </Box>
      )}

      {/* ── Password change overlay (\pw meta-command) ─── */}
      {showPasswordChange && (
        <Box position="absolute" marginLeft={0} marginTop={0}>
          <PasswordChangeOverlay />
        </Box>
      )}
    </Box>
  );
};
