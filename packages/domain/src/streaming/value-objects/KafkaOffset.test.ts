import { KafkaOffset } from './KafkaOffset.js';

describe('KafkaOffset', () => {
  it('should store topic, partition, and offset', () => {
    const offset = new KafkaOffset('ecom.orders', 2, 42);
    expect(offset.topic).toBe('ecom.orders');
    expect(offset.partition).toBe(2);
    expect(offset.offset).toBe(42);
  });

  it('should compare equality correctly', () => {
    const a = new KafkaOffset('t', 0, 1);
    const b = new KafkaOffset('t', 0, 1);
    const c = new KafkaOffset('t', 0, 2);

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('toString returns topic:partition:offset', () => {
    const offset = new KafkaOffset('ecom.orders', 1, 100);
    expect(offset.toString()).toBe('ecom.orders:1:100');
  });
});
