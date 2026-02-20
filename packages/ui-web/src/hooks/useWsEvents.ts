import type { ServerMessage } from '@tfsdc/application';

export interface WsEventHookResult {
  events: ServerMessage[];
  connected: boolean;
}

export interface IWsEventManager {
  connect(wsUrl: string, tables: string[]): void;
  disconnect(): void;
  onMessage(callback: (msg: ServerMessage) => void): () => void;
  isConnected(): boolean;
}

interface SimpleWs {
  close(): void;
  send(data: string): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

export class WsEventManager implements IWsEventManager {
  private ws: SimpleWs | null = null;
  private listeners = new Set<(msg: ServerMessage) => void>();
  private _connected = false;

  connect(wsUrl: string, tables: string[]): void {
    if (typeof globalThis.WebSocket === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const WsCtor = (globalThis as any).WebSocket as new (url: string) => SimpleWs;
    const ws = new WsCtor(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this._connected = true;
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', tables }));
    };

    ws.onmessage = (e: { data: string }) => {
      try {
        const msg = JSON.parse(e.data) as ServerMessage;
        for (const listener of this.listeners) {
          listener(msg);
        }
      } catch {
        // ignore invalid messages
      }
    };

    ws.onclose = () => {
      this._connected = false;
    };
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  onMessage(callback: (msg: ServerMessage) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  isConnected(): boolean {
    return this._connected;
  }
}
