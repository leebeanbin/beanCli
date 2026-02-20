import type { ServerMessage, ClientMessage } from '../types.js';

export interface IWebSocket {
  readyState: number;
  send(data: string): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'message', listener: (data: unknown) => void): void;
}

export const WS_OPEN = 1;

export type SseCallback = (message: ServerMessage) => void;

export class WsConnectionManager {
  private wsSubscriptions = new Map<string, Set<IWebSocket>>();
  private sseSubscriptions = new Map<string, { tables: string[]; callback: SseCallback }>();

  register(ws: IWebSocket, tables: string[]): void {
    for (const table of tables) {
      if (!this.wsSubscriptions.has(table)) {
        this.wsSubscriptions.set(table, new Set());
      }
      this.wsSubscriptions.get(table)!.add(ws);
    }

    ws.on('close', () => this.unregister(ws));
  }

  private unregister(ws: IWebSocket): void {
    for (const [, subscribers] of this.wsSubscriptions) {
      subscribers.delete(ws);
    }
  }

  registerSse(clientId: string, tables: string[], callback: SseCallback): void {
    this.sseSubscriptions.set(clientId, { tables, callback });
  }

  unregisterSse(clientId: string): void {
    this.sseSubscriptions.delete(clientId);
  }

  broadcast(table: string, message: ServerMessage): void {
    const subscribers = this.wsSubscriptions.get(table);
    if (subscribers) {
      const payload = JSON.stringify(message);
      const dead: IWebSocket[] = [];

      for (const ws of subscribers) {
        if (ws.readyState === WS_OPEN) {
          ws.send(payload);
        } else {
          dead.push(ws);
        }
      }

      for (const ws of dead) {
        subscribers.delete(ws);
      }
    }

    for (const [, sub] of this.sseSubscriptions) {
      if (sub.tables.includes(table)) {
        sub.callback(message);
      }
    }
  }

  handleMessage(ws: IWebSocket, raw: unknown): void {
    try {
      const data = typeof raw === 'string' ? raw : String(raw);
      const msg = JSON.parse(data) as ClientMessage;

      switch (msg.type) {
        case 'SUBSCRIBE':
          this.register(ws, msg.tables);
          ws.send(JSON.stringify({ type: 'SUBSCRIBED', tables: msg.tables }));
          break;
        case 'UNSUBSCRIBE':
          for (const table of msg.tables) {
            this.wsSubscriptions.get(table)?.delete(ws);
          }
          break;
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
      }
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }));
    }
  }

  getConnectionCount(): number {
    const allWs = new Set<IWebSocket>();
    for (const [, subs] of this.wsSubscriptions) {
      for (const ws of subs) {
        allWs.add(ws);
      }
    }
    return allWs.size + this.sseSubscriptions.size;
  }
}
