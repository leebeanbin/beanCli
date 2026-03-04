import { EventDispatcher } from './EventDispatcher.js';
import type { IEventHandler } from '@tfsdc/domain';

describe('EventDispatcher', () => {
  let dispatcher: EventDispatcher;

  const mockHandler: IEventHandler = {
    entityType: 'order',
    upsertState: jest.fn(),
  };

  beforeEach(() => {
    dispatcher = new EventDispatcher();
  });

  it('should register and resolve a handler', () => {
    dispatcher.register(mockHandler);

    const resolved = dispatcher.resolve('order');
    expect(resolved).toBe(mockHandler);
  });

  it('should throw for unregistered entity type', () => {
    expect(() => dispatcher.resolve('unknown')).toThrow(
      'No handler registered for entity type: unknown',
    );
  });

  it('should list registered types', () => {
    const paymentHandler: IEventHandler = {
      entityType: 'payment',
      upsertState: jest.fn(),
    };

    dispatcher.register(mockHandler);
    dispatcher.register(paymentHandler);

    expect(dispatcher.registeredTypes()).toEqual(['order', 'payment']);
  });
});
