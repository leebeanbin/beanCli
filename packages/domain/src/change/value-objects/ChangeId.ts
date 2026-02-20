import { randomUUID } from 'crypto';

export class ChangeId {
  private constructor(readonly value: string) {}

  static generate(): ChangeId {
    return new ChangeId(randomUUID());
  }

  static from(value: string): ChangeId {
    if (!value || value.trim().length === 0) {
      throw new Error('ChangeId cannot be empty');
    }
    return new ChangeId(value);
  }

  equals(other: ChangeId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
