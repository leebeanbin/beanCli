import { randomBytes } from 'crypto';
import type { IAuditWriter, IDbSession } from '../api/types.js';

export interface IKafkaNotifier {
  send(topic: string, messages: { value: string }[]): Promise<void>;
}

export class RotateKeyUseCase {
  constructor(
    private readonly db: IDbSession,
    private readonly kafkaNotifier: IKafkaNotifier,
    private readonly auditWriter: IAuditWriter,
  ) {}

  async execute(actor: string): Promise<string> {
    const newKeyId = `key-${Date.now()}`;
    const newKeyValue = randomBytes(32);

    await this.db.query('SELECT rotate_hmac_key($1, $2)', [newKeyId, newKeyValue]);

    await this.kafkaNotifier.send('tfsdc.internal.key-rotation', [
      { value: JSON.stringify({ newKeyId }) },
    ]);

    await this.auditWriter.write({
      category: 'SECURITY',
      actor,
      action: 'KEY_ROTATION',
      resource: `hmac_keys/${newKeyId}`,
      result: 'SUCCESS',
    });

    return newKeyId;
  }
}
