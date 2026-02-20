import { EventBus } from './EventBus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should emit and receive events', () => {
    const handler = jest.fn();
    bus.on('test', handler);
    bus.emit('test', { value: 42 });

    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should support multiple listeners', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.on('test', h1);
    bus.on('test', h2);
    bus.emit('test', 'data');

    expect(h1).toHaveBeenCalledWith('data');
    expect(h2).toHaveBeenCalledWith('data');
  });

  it('should unsubscribe with returned function', () => {
    const handler = jest.fn();
    const unsub = bus.on('test', handler);
    unsub();
    bus.emit('test', 'data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should clear all listeners', () => {
    const handler = jest.fn();
    bus.on('test', handler);
    bus.clear();
    bus.emit('test', 'data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove event listeners', () => {
    const handler = jest.fn();
    bus.on('test', handler);
    bus.off('test');
    bus.emit('test', 'data');

    expect(handler).not.toHaveBeenCalled();
  });
});
