import type { IEventHandler } from '@tfsdc/domain';

export class EventDispatcher {
  private readonly handlers = new Map<string, IEventHandler>();

  register(handler: IEventHandler): void {
    this.handlers.set(handler.entityType, handler);
  }

  resolve(entityType: string): IEventHandler {
    const handler = this.handlers.get(entityType);
    if (!handler) {
      throw new Error(`No handler registered for entity type: ${entityType}`);
    }
    return handler;
  }

  registeredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
