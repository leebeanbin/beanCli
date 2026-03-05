/**
 * PasswordChangeOverlay — `\pw` meta-command
 * 3-step flow: current password → new password → confirm new password
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppContext } from '../../context/AppContext.js';

type Step = 'current' | 'new' | 'confirm';

const STEP_LABEL: Record<Step, string> = {
  current: 'Current password',
  new: 'New password',
  confirm: 'Confirm new password',
};

const STEPS: Step[] = ['current', 'new', 'confirm'];

export const PasswordChangeOverlay: React.FC = () => {
  const { setOverlay, connectionService } = useAppContext();

  const [step, setStep] = useState<Step>('current');
  const [values, setValues] = useState<Record<Step, string>>({
    current: '',
    new: '',
    confirm: '',
  });
  const [fieldInput, setFieldInput] = useState('');
  const [status, setStatus] = useState<{ ok?: boolean; msg?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useInput((inp, key) => {
    if (busy) return;

    if (status) {
      // any key dismisses result
      setOverlay(null);
      return;
    }

    if (key.escape) {
      setOverlay(null);
      return;
    }

    if (key.return) {
      const val = fieldInput;
      if (!val) return;

      // Confirm step: validate match then submit
      if (step === 'confirm') {
        if (val !== values.new) {
          setFieldInput('');
          setStatus({ ok: false, msg: 'Passwords do not match — press any key to retry' });
          return;
        }
        const updated = { ...values, confirm: val };
        setValues(updated);
        setBusy(true);
        void (async () => {
          const result = await connectionService?.changePassword?.(
            updated.current,
            updated.new,
          );
          setBusy(false);
          if (result?.error) {
            setStatus({ ok: false, msg: result.error });
          } else {
            setStatus({ ok: true, msg: 'Password changed successfully' });
          }
        })();
        setFieldInput('');
        return;
      }

      // Advance to next step
      setValues((prev) => ({ ...prev, [step]: val }));
      setFieldInput('');
      const nextIdx = STEPS.indexOf(step) + 1;
      setStep(STEPS[nextIdx] ?? step);
      return;
    }

    if (key.backspace) {
      setFieldInput((s) => s.slice(0, -1));
      return;
    }

    if (inp && inp >= ' ' && !key.ctrl && !key.meta) {
      setFieldInput((s) => s + inp);
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="#00d4ff"
        paddingX={3}
        paddingY={1}
        width={50}
      >
        <Box marginBottom={1} justifyContent="center">
          <Text color="#00d4ff" bold>
            Change Password
          </Text>
        </Box>

        {status ? (
          <Box flexDirection="column" gap={1}>
            <Text color={status.ok ? '#10b981' : '#ef4444'}>{status.msg}</Text>
            <Text color="#374151" dimColor>
              Press any key to close
            </Text>
          </Box>
        ) : busy ? (
          <Text color="#f59e0b">Changing password…</Text>
        ) : (
          <>
            {STEPS.map((s) => {
              const done = STEPS.indexOf(s) < STEPS.indexOf(step);
              const active = s === step;
              return (
                <Box key={s} marginBottom={active ? 1 : 0}>
                  <Text color={active ? '#00d4ff' : done ? '#10b981' : '#374151'}>
                    {done ? '✓ ' : active ? '❯ ' : '  '}
                  </Text>
                  <Text color={active ? '#e0e0e0' : done ? '#6b7280' : '#374151'}>
                    {STEP_LABEL[s]}:{' '}
                  </Text>
                  {active && (
                    <Text color="#e0e0e0">
                      {'•'.repeat(fieldInput.length)}
                      <Text color="#0a1628" backgroundColor="#00d4ff">
                        {' '}
                      </Text>
                    </Text>
                  )}
                  {done && <Text color="#6b7280">{'•'.repeat(values[s].length)}</Text>}
                </Box>
              );
            })}
            <Text color="#374151" dimColor>
              Enter: next  Esc: cancel
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
};
