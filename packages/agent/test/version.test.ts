import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/version.js';

describe('version', () => {
  it('버전은 리터럴 0.1.0 이 아니다 — 빌드 시점 값에서 온다', () => {
    expect(VERSION).not.toBe('0.1.0');
  });

  it('버전은 유효한 문자열이다', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});