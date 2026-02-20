import { WsConnectionManager, WS_OPEN } from './WsConnectionManager.js';
import type { IWebSocket } from './WsConnectionManager.js';
import type { ServerMessage } from '../types.js';

function createMockWs(readyState = WS_OPEN): IWebSocket {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState,
    send: jest.fn(),
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
    }),
    _trigger: (event: string, ...args: unknown[]) => {
      listeners[event]?.forEach((fn) => fn(...args));
    },
  } as unknown as IWebSocket & { _trigger: (event: string, ...args: unknown[]) => void };
}

describe('WsConnectionManager', () => {
  let manager: WsConnectionManager;

  beforeEach(() => {
    manager = new WsConnectionManager();
  });

  it('should register and broadcast to WebSocket subscribers', () => {
    const ws = createMockWs();
    manager.register(ws, ['state_orders']);

    const msg: ServerMessage = { type: 'STREAM_EVENT', entityType: 'order', count: 1 };
    manager.broadcast('state_orders', msg);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('should not broadcast to unrelated tables', () => {
    const ws = createMockWs();
    manager.register(ws, ['state_orders']);

    manager.broadcast('state_payments', { type: 'PONG' });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should handle SUBSCRIBE message', () => {
    const ws = createMockWs();
    manager.handleMessage(ws, JSON.stringify({ type: 'SUBSCRIBE', tables: ['state_orders'] }));

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'SUBSCRIBED', tables: ['state_orders'] }),
    );
  });

  it('should handle PING message', () => {
    const ws = createMockWs();
    manager.handleMessage(ws, JSON.stringify({ type: 'PING' }));

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'PONG' }));
  });

  it('should handle invalid message', () => {
    const ws = createMockWs();
    manager.handleMessage(ws, 'not-json');

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }),
    );
  });

  it('should count connections', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    manager.register(ws1, ['state_orders']);
    manager.register(ws2, ['state_orders', 'state_payments']);

    expect(manager.getConnectionCount()).toBe(2);
  });

  it('should broadcast to SSE subscribers', () => {
    const callback = jest.fn();
    manager.registerSse('client-1', ['state_orders'], callback);

    const msg: ServerMessage = { type: 'PONG' };
    manager.broadcast('state_orders', msg);

    expect(callback).toHaveBeenCalledWith(msg);
  });

  it('should unregister SSE subscribers', () => {
    const callback = jest.fn();
    manager.registerSse('client-1', ['state_orders'], callback);
    manager.unregisterSse('client-1');

    manager.broadcast('state_orders', { type: 'PONG' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('should remove dead sockets on broadcast', () => {
    const ws = createMockWs(3); // CLOSED
    manager.register(ws, ['state_orders']);

    manager.broadcast('state_orders', { type: 'PONG' });

    expect(ws.send).not.toHaveBeenCalled();
  });
});
