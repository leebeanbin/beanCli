import { EntityIdHash } from './EntityIdHash.js';

describe('EntityIdHash', () => {
  it('should create from a valid hash string', () => {
    const hash = EntityIdHash.from('abc123def');
    expect(hash.value).toBe('abc123def');
  });

  it('should throw on empty string', () => {
    expect(() => EntityIdHash.from('')).toThrow('cannot be empty');
  });

  it('should throw on whitespace-only string', () => {
    expect(() => EntityIdHash.from('   ')).toThrow('cannot be empty');
  });

  it('should compare equality correctly', () => {
    const a = EntityIdHash.from('same');
    const b = EntityIdHash.from('same');
    const c = EntityIdHash.from('different');

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('toString returns the value', () => {
    const hash = EntityIdHash.from('hashval');
    expect(hash.toString()).toBe('hashval');
  });
});
