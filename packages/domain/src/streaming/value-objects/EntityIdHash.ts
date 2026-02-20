export class EntityIdHash {
  private constructor(readonly value: string) {}

  static from(hash: string): EntityIdHash {
    if (!hash || hash.trim().length === 0) {
      throw new Error('EntityIdHash cannot be empty');
    }
    return new EntityIdHash(hash);
  }

  equals(other: EntityIdHash): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
