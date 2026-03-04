import { WsEventManager } from './useWsEvents.js';

class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sentMessages: string[] = [];

  close() {
    this.onclose?.();
  }
  send(data: string) {
    this.sentMessages.push(data);
  }
  triggerOpen() {
    this.onopen?.();
  }
  triggerMessage(data: string) {
    this.onmessage?.({ data });
  }
}

describe('WsEventManager', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = jest.fn(() => mockWs);
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).WebSocket;
  });

  it('connect() + onopen triggers SUBSCRIBE message', () => {
    const manager = new WsEventManager();
    manager.connect('ws://localhost:3000/ws', ['state_users', 'state_orders']);
    mockWs.triggerOpen();

    expect(mockWs.sentMessages).toHaveLength(1);
    const parsed = JSON.parse(mockWs.sentMessages[0]) as { type: string; tables: string[] };
    expect(parsed.type).toBe('SUBSCRIBE');
    expect(parsed.tables).toEqual(['state_users', 'state_orders']);
    expect(manager.isConnected()).toBe(true);
  });

  it('onMessage callback is called when message received', () => {
    const manager = new WsEventManager();
    manager.connect('ws://localhost:3000/ws', ['state_users']);
    mockWs.triggerOpen();

    const received: unknown[] = [];
    manager.onMessage((msg) => received.push(msg));

    mockWs.triggerMessage(JSON.stringify({ type: 'PONG' }));
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('PONG');
  });

  it('unsubscribe stops future callbacks', () => {
    const manager = new WsEventManager();
    manager.connect('ws://localhost:3000/ws', ['state_users']);
    mockWs.triggerOpen();

    const received: unknown[] = [];
    const unsub = manager.onMessage((msg) => received.push(msg));

    mockWs.triggerMessage(JSON.stringify({ type: 'PONG' }));
    expect(received).toHaveLength(1);

    unsub();
    mockWs.triggerMessage(JSON.stringify({ type: 'PONG' }));
    expect(received).toHaveLength(1); // still 1 — no new call
  });

  it('disconnect() calls close() and isConnected() returns false', () => {
    const manager = new WsEventManager();
    manager.connect('ws://localhost:3000/ws', ['state_users']);
    mockWs.triggerOpen();
    expect(manager.isConnected()).toBe(true);

    manager.disconnect();
    expect(manager.isConnected()).toBe(false);
  });

  it('connect() is no-op when globalThis.WebSocket is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).WebSocket;
    const manager = new WsEventManager();
    expect(() => manager.connect('ws://localhost:3000/ws', ['state_users'])).not.toThrow();
    expect(manager.isConnected()).toBe(false);
  });
});
