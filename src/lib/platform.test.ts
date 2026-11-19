import { describe, expect, it } from 'vitest';
import { isAppleMobile } from './platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('isAppleMobile', () => {
  it('iPhone を判定する', () => {
    expect(isAppleMobile(IPHONE, 'iPhone', 5)).toBe(true);
  });
  it('Mac として名乗る iPad を判定する', () => {
    expect(isAppleMobile(IPAD_DESKTOP_MODE, 'MacIntel', 5)).toBe(true);
  });
  it('本物の Mac と Windows は対象外', () => {
    expect(isAppleMobile(IPAD_DESKTOP_MODE, 'MacIntel', 0)).toBe(false);
    expect(isAppleMobile(WINDOWS_CHROME, 'Win32', 0)).toBe(false);
  });
});
