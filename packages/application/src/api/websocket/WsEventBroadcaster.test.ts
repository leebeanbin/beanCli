import { WsEventBroadcaster } from './WsEventBroadcaster.js';
import { WS_OPEN } from './WsConnectionManager.js';
import type { IWebSocket } from './WsConnectionManager.js';
import type { ServerMessage } from '../types.js';

function createMockWs(readyState = WS_OPEN): IWebSocket {
  return {
    readyState,
    send: jest.fn(),
    on: jest.fn(),
  };
}

describe('WsEventBroadcaster', () => {
  it('should send messages to an open WebSocket', () => {
    const broadcaster = new WsEventBroadcaster();
    const ws = createMockWs();
    const msg: ServerMessage = { type: 'PONG' };

    broadcaster.send(ws, msg);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('should send OVERLOAD_WARNING when queue is full', () => {
    const broadcaster = new WsEventBroadcaster({ maxQueueSize: 3, flushBatchSize: 0 });
    const ws = createMockWs();

    // Override flush to prevent draining
    (broadcaster as unknown as { flush: () => void }).flush = () => {};

    for (let i = 0; i < 4; i++) {
      broadcaster.send(ws, { type: 'PONG' });
    }

    const calls = (ws.send as jest.Mock).mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(JSON.parse(lastCall)).toEqual({
      type: 'OVERLOAD_WARNING',
      reason: 'Message queue full. Please reload.',
    });
  });

  it('should not send to closed WebSocket', () => {
    const broadcaster = new WsEventBroadcaster();
    const ws = createMockWs(3); // CLOSED

    broadcaster.send(ws, { type: 'PONG' });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should track queue size', () => {
    const broadcaster = new WsEventBroadcaster({ maxQueueSize: 100, flushBatchSize: 0 });
    const ws = createMockWs();

    (broadcaster as unknown as { flush: () => void }).flush = () => {};

    broadcaster.send(ws, { type: 'PONG' });
    broadcaster.send(ws, { type: 'PONG' });

    expect(broadcaster.getQueueSize(ws)).toBe(2);
  });
});
