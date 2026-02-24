import { TuiWsClient } from './TuiWsClient.js';
import type { IWsTransport, TuiWsCallbacks } from './TuiWsClient.js';

describe('TuiWsClient', () => {
  let transport: IWsTransport;
  let callbacks: TuiWsCallbacks;
  let openCb: () => void;
  let messageCb: (data: string) => void;
  let closeCb: () => void;

  beforeEach(() => {
    transport = {
      connect: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      onOpen: jest.fn((cb) => { openCb = cb; }),
      onMessage: jest.fn((cb) => { messageCb = cb; }),
      onClose: jest.fn((cb) => { closeCb = cb; }),
      onError: jest.fn(),
    };
    callbacks = {
      onChangeApplied: jest.fn(),
      onStreamEvent: jest.fn(),
      onOverloadWarning: jest.fn(),
      onConnected: jest.fn(),
      onDisconnected: jest.fn(),
    };
  });

  it('should subscribe to tables on connect', () => {
    const client = new TuiWsClient(transport, callbacks);
    client.connect('ws://localhost:3000/ws', ['state_orders']);

    openCb();

    expect(transport.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'SUBSCRIBE', tables: ['state_orders'] }),
    );
    expect(callbacks.onConnected).toHaveBeenCalled();
    expect(client.isConnected()).toBe(true);
  });

  it('should dispatch STREAM_EVENT messages', () => {
    const client = new TuiWsClient(transport, callbacks);
    client.connect('ws://localhost:3000/ws', []);
    openCb();

    messageCb(JSON.stringify({ type: 'STREAM_EVENT', entityType: 'order', count: 5 }));

    expect(callbacks.onStreamEvent).toHaveBeenCalled();
  });

  it('should ignore messages in PAUSED mode', () => {
    const client = new TuiWsClient(transport, callbacks);
    client.connect('ws://localhost:3000/ws', []);
    openCb();

    client.togglePause();
    expect(client.getMode()).toBe('PAUSED');

    messageCb(JSON.stringify({ type: 'STREAM_EVENT', entityType: 'order', count: 1 }));
    expect(callbacks.onStreamEvent).not.toHaveBeenCalled();
  });

  it('should toggle between LIVE and PAUSED', () => {
    const client = new TuiWsClient(transport, callbacks);
    expect(client.getMode()).toBe('LIVE');

    client.togglePause();
    expect(client.getMode()).toBe('PAUSED');

    client.togglePause();
    expect(client.getMode()).toBe('LIVE');
  });
});
