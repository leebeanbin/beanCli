import { WebSocket } from 'ws';
import type { IWsTransport } from './TuiWsClient.js';

export class NodeWsTransport implements IWsTransport {
  private ws: WebSocket | null = null;

  connect(url: string): void {
    this.ws = new WebSocket(url);
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  close(): void {
    this.ws?.close();
  }

  onOpen(callback: () => void): void {
    this.ws!.on('open', callback);
  }

  onMessage(callback: (data: string) => void): void {
    this.ws!.on('message', (data) => callback(data.toString()));
  }

  onClose(callback: () => void): void {
    this.ws!.on('close', callback);
  }

  onError(callback: (err: Error) => void): void {
    this.ws!.on('error', callback);
  }
}
