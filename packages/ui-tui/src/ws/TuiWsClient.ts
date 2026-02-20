import type { ServerMessage } from '@tfsdc/application';
import type { StreamMode } from '@tfsdc/kernel';

export interface IWsTransport {
  connect(url: string): void;
  send(data: string): void;
  close(): void;
  onOpen(callback: () => void): void;
  onMessage(callback: (data: string) => void): void;
  onClose(callback: () => void): void;
}

export interface TuiWsCallbacks {
  onChangeApplied(event: ServerMessage & { type: 'CHANGE_APPLIED' }): void;
  onStreamEvent(event: ServerMessage & { type: 'STREAM_EVENT' }): void;
  onOverloadWarning(reason: string): void;
  onConnected(): void;
  onDisconnected(): void;
}

export class TuiWsClient {
  private reconnectDelay = 1000;
  private mode: StreamMode = 'LIVE';
  private connected = false;

  constructor(
    private readonly transport: IWsTransport,
    private readonly callbacks: TuiWsCallbacks,
  ) {}

  connect(url: string, tables: string[]): void {
    this.transport.connect(url);

    this.transport.onOpen(() => {
      this.reconnectDelay = 1000;
      this.connected = true;
      this.transport.send(JSON.stringify({ type: 'SUBSCRIBE', tables }));
      this.callbacks.onConnected();
    });

    this.transport.onMessage((data: string) => {
      if (this.mode === 'PAUSED') return;
      try {
        const msg = JSON.parse(data) as ServerMessage;
        this.dispatch(msg);
      } catch {
        // ignore invalid messages
      }
    });

    this.transport.onClose(() => {
      this.connected = false;
      this.callbacks.onDisconnected();
      const delay = Math.min(this.reconnectDelay * 2, 30000);
      this.reconnectDelay = delay;
      setTimeout(() => this.connect(url, tables), delay);
    });
  }

  togglePause(): StreamMode {
    this.mode = this.mode === 'LIVE' ? 'PAUSED' : 'LIVE';
    return this.mode;
  }

  getMode(): StreamMode {
    return this.mode;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private dispatch(msg: ServerMessage): void {
    switch (msg.type) {
      case 'CHANGE_APPLIED':
        this.callbacks.onChangeApplied(msg as ServerMessage & { type: 'CHANGE_APPLIED' });
        break;
      case 'STREAM_EVENT':
        this.callbacks.onStreamEvent(msg as ServerMessage & { type: 'STREAM_EVENT' });
        break;
      case 'OVERLOAD_WARNING':
        this.callbacks.onOverloadWarning(msg.reason);
        break;
    }
  }
}
