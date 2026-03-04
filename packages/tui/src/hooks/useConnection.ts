import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext.js';
import type { DbConnection } from '../services/types.js';

interface UseConnectionReturn {
  connecting: boolean;
  connectError: string | null;
  connect: (conn: DbConnection) => Promise<void>;
  disconnect: () => void;
  saveConn: (conn: DbConnection) => void;
  deleteConn: (id: string) => void;
}

export function useConnection(): UseConnectionReturn {
  const { connectionService, setConnections, setActiveConnection, setTables, setConnection } =
    useAppContext();

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const connect = useCallback(
    async (conn: DbConnection) => {
      if (!connectionService) {
        setConnectError('No connection service configured');
        return;
      }
      setConnecting(true);
      setConnectError(null);

      const result = await connectionService.testConnection(conn);

      setConnecting(false);
      if (result.error) {
        setConnectError(result.error);
      } else {
        setActiveConnection(conn);
        setTables(result.tables);
        setConnection(conn.label); // status bar
      }
    },
    [connectionService, setActiveConnection, setTables, setConnection],
  );

  const disconnect = useCallback(() => {
    setActiveConnection(null);
    setTables([]);
    setConnection(null);
    setConnectError(null);
  }, [setActiveConnection, setTables, setConnection]);

  const saveConn = useCallback(
    (conn: DbConnection) => {
      if (!connectionService) return;
      connectionService.saveConnection(conn);
      setConnections(connectionService.loadConnections());
    },
    [connectionService, setConnections],
  );

  const deleteConn = useCallback(
    (id: string) => {
      if (!connectionService) return;
      connectionService.deleteConnection(id);
      setConnections(connectionService.loadConnections());
    },
    [connectionService, setConnections],
  );

  return { connecting, connectError, connect, disconnect, saveConn, deleteConn };
}
