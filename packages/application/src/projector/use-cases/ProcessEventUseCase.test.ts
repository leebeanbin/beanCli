import { ProcessEventUseCase } from './ProcessEventUseCase.js';
import { EventDispatcher } from '../EventDispatcher.js';
import type {
  RawEvent, IHasher, IEventHandler, DbTransaction,
  IProjectorDb, IKafkaConsumer, IDlqPublisher,
} from '@tfsdc/domain';

describe('ProcessEventUseCase', () => {
  let useCase: ProcessEventUseCase;
  let mockDb: IProjectorDb;
  let mockKafka: IKafkaConsumer;
  let mockDlq: IDlqPublisher;
  let mockHandler: IEventHandler;
  let mockHasher: IHasher;
  let dispatcher: EventDispatcher;

  const event: RawEvent = {
    sourceTopic: 'ecom.orders',
    partition: 0,
    offset: 1,
    eventTimeMs: 1700000000000,
    entityType: 'order',
    canonicalId: 'ORD-001',
    payload: { status: 'CREATED' },
  };

  beforeEach(() => {
    mockHandler = {
      entityType: 'order',
      upsertState: jest.fn().mockResolvedValue(undefined),
    };

    dispatcher = new EventDispatcher();
    dispatcher.register(mockHandler);

    mockHasher = {
      hash: jest.fn().mockResolvedValue('hashed_id'),
      hashWithKeyId: jest.fn().mockResolvedValue('hashed_id'),
    };

    mockDb = {
      transaction: jest.fn(async (fn) => {
        const tx: DbTransaction = {
          query: jest.fn().mockResolvedValue({ rowCount: 1 }),
        };
        return fn(tx);
      }),
    };

    mockKafka = {
      subscribe: jest.fn(),
      poll: jest.fn(),
      commitOffset: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };

    mockDlq = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new ProcessEventUseCase(
      mockDb,
      dispatcher,
      mockHasher,
      mockKafka,
      mockDlq,
      'key-001',
    );
  });

  it('should process event: hash, insert events_raw, upsert state, commit', async () => {
    await useCase.execute(event);

    expect(mockHasher.hash).toHaveBeenCalledWith('order', 'ORD-001');
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockHandler.upsertState).toHaveBeenCalled();
    expect(mockKafka.commitOffset).toHaveBeenCalledWith(event);
    expect(useCase.metrics.processed).toBe(1);
  });

  it('should skip duplicate event (rowCount=0) and increment duplicateSkips', async () => {
    mockDb.transaction = jest.fn(async (fn) => {
      const tx: DbTransaction = {
        query: jest.fn().mockResolvedValue({ rowCount: 0 }),
      };
      return fn(tx);
    });

    useCase = new ProcessEventUseCase(mockDb, dispatcher, mockHasher, mockKafka, mockDlq, 'key-001');
    await useCase.execute(event);

    expect(mockHandler.upsertState).not.toHaveBeenCalled();
    expect(mockKafka.commitOffset).toHaveBeenCalledWith(event);
    expect(useCase.metrics.duplicateSkips).toBe(1);
  });

  it('should send to DLQ after 3 retries and commit offset', async () => {
    const dbError = new Error('DB connection error');
    mockDb.transaction = jest.fn().mockRejectedValue(dbError);

    useCase = new ProcessEventUseCase(mockDb, dispatcher, mockHasher, mockKafka, mockDlq, 'key-001');

    // Override sleep to avoid real delays
    (useCase as unknown as { sleep: () => Promise<void> }).sleep = () => Promise.resolve();

    await useCase.execute(event);

    expect(mockDb.transaction).toHaveBeenCalledTimes(3);
    expect(mockDlq.publish).toHaveBeenCalledWith(event, dbError);
    expect(mockKafka.commitOffset).toHaveBeenCalledWith(event);
    expect(useCase.metrics.dlqSent).toBe(1);
  });
});
