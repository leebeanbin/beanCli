export class KafkaOffset {
  constructor(
    readonly topic: string,
    readonly partition: number,
    readonly offset: number,
  ) {}

  equals(other: KafkaOffset): boolean {
    return (
      this.topic === other.topic &&
      this.partition === other.partition &&
      this.offset === other.offset
    );
  }

  toString(): string {
    return `${this.topic}:${this.partition}:${this.offset}`;
  }
}
