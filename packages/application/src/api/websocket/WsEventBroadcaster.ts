import type { ServerMessage } from '../types.js';
import type { IWebSocket } from './WsConnectionManager.js';
import { WS_OPEN } from './WsConnectionManager.js';

export class WsEventBroadcaster {
  private queues = new Map<IWebSocket, ServerMessage[]>();
  private readonly maxQueueSize: number;
  private readonly flushBatchSize: number;

  constructor(opts?: { maxQueueSize?: number; flushBatchSize?: number }) {
    this.maxQueueSize = opts?.maxQueueSize ?? 100;
    this.flushBatchSize = opts?.flushBatchSize ?? 10;
  }

  send(ws: IWebSocket, message: ServerMessage): void {
    if (ws.readyState !== WS_OPEN) {
      this.queues.delete(ws);
      return;
    }

    const queue = this.queues.get(ws) ?? [];

    if (queue.length >= this.maxQueueSize) {
      ws.send(
        JSON.stringify({
          type: 'OVERLOAD_WARNING',
          reason: 'Message queue full. Please reload.',
        }),
      );
      this.queues.set(ws, []);
      return;
    }

    queue.push(message);
    this.queues.set(ws, queue);
    this.flush(ws);
  }

  private flush(ws: IWebSocket): void {
    const queue = this.queues.get(ws);
    if (!queue || queue.length === 0) return;

    const batch = queue.splice(0, this.flushBatchSize);
    for (const msg of batch) {
      ws.send(JSON.stringify(msg));
    }
  }

  getQueueSize(ws: IWebSocket): number {
    return this.queues.get(ws)?.length ?? 0;
  }

  clearQueue(ws: IWebSocket): void {
    this.queues.delete(ws);
  }
}
