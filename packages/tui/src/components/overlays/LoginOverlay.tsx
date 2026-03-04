import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import type { UserRole } from '../../services/types.js';
import { SPINNER } from '../../utils/constants.js';

// ── ASCII logo ────────────────────────────────────────────────────────────────

const LOGO_LINES = [
  ' ██████╗ ███████╗ █████╗ ███╗   ██╗ ██████╗██╗     ██╗ ',
  ' ██╔══██╗██╔════╝██╔══██╗████╗  ██║██╔════╝██║     ██║ ',
  ' ██████╔╝█████╗  ███████║██╔██╗ ██║██║     ██║     ██║ ',
  ' ██╔══██╗██╔══╝  ██╔══██║██║╚██╗██║██║     ██║     ██║ ',
  ' ██████╔╝███████╗██║  ██║██║ ╚████║╚██████╗███████╗██║ ',
  ' ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═╝ ',
];

type Field = 'username' | 'password';

// ── LoginOverlay ──────────────────────────────────────────────────────────────

export const LoginOverlay: React.FC = () => {
  const { connectionService, setStartupPhase, setUserRole, setAuthToken } = useAppContext();

  const [field, setField] = useState<Field>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Spinner while authenticating
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [loading]);

  const goNext = () => setStartupPhase('connection-picker');

  const doLogin = async () => {
    // If no login method — dev mode skip
    if (!connectionService?.login) {
      goNext();
      return;
    }

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await connectionService.login(username.trim(), password);
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Login failed. Check credentials.');
    } else {
      if (result.role) setUserRole(result.role as UserRole);
      if (result.token) setAuthToken(result.token);
      goNext();
    }
  };

  useInput((inp, key) => {
    if (loading) return;

    // Esc — skip auth (dev use only, no role assigned)
    if (key.escape) {
      goNext();
      return;
    }

    if (key.tab) {
      setField((f) => (f === 'username' ? 'password' : 'username'));
      return;
    }

    if (key.return) {
      if (field === 'username' && !username.trim()) {
        setField('password');
        return;
      }
      void doLogin();
      return;
    }

    if (key.backspace || key.delete) {
      if (field === 'username') setUsername((s) => s.slice(0, -1));
      else setPassword((s) => s.slice(0, -1));
      return;
    }

    if (inp && inp >= ' ' && !key.ctrl && !key.meta) {
      if (field === 'username') setUsername((s) => s + inp);
      else setPassword((s) => s + inp);
    }
  });

  const W = 60;

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="#00d4ff"
        width={W}
        paddingX={2}
        paddingY={1}
      >
        {/* Logo */}
        <Box flexDirection="column" alignItems="center" marginBottom={1}>
          {LOGO_LINES.map((line, i) => (
            <Text key={i} color="#00d4ff">
              {line}
            </Text>
          ))}
          <Text color="#4a5568"> Database Console · v0.1.2 </Text>
        </Box>

        <Text color="#1a2a3a">{'─'.repeat(W - 6)}</Text>

        {/* Fields */}
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Box>
            <Text color={field === 'username' ? '#00d4ff' : '#4a5568'} bold={field === 'username'}>
              {'  Username : '}
            </Text>
            <Text color="#e0e0e0">
              {username}
              {field === 'username' ? <Text color="#00d4ff">█</Text> : null}
            </Text>
          </Box>
          <Box>
            <Text color={field === 'password' ? '#00d4ff' : '#4a5568'} bold={field === 'password'}>
              {'  Password : '}
            </Text>
            <Text color="#e0e0e0">
              {'•'.repeat(password.length)}
              {field === 'password' ? <Text color="#00d4ff">█</Text> : null}
            </Text>
          </Box>
        </Box>

        <Text color="#1a2a3a">{'─'.repeat(W - 6)}</Text>

        {/* Status line */}
        <Box marginTop={1}>
          {loading ? (
            <Text color="#f59e0b"> {SPINNER[spinIdx]} Authenticating...</Text>
          ) : error ? (
            <Text color="#ef4444"> {error.slice(0, W - 8)}</Text>
          ) : (
            <Text color="#374151">
              {'  Tab:next field  Enter:login'}
              <Text color="#4a5568"> Esc:skip(dev)</Text>
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
