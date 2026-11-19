import { describe, expect, it } from 'vitest';
import { parseHash, routeHref, ROUTES } from './route';

describe('parseHash', () => {
  it('空のハッシュはタイマー画面', () => {
    expect(parseHash('')).toBe('timer');
    expect(parseHash('#')).toBe('timer');
    expect(parseHash('#/')).toBe('timer');
  });

  it('各画面の名前を読み取る', () => {
    expect(parseHash('#/tasks')).toBe('tasks');
    expect(parseHash('#/records')).toBe('records');
    expect(parseHash('#/stats')).toBe('stats');
    expect(parseHash('#/settings')).toBe('settings');
  });

  it('後ろに続くパスやクエリは無視する', () => {
    expect(parseHash('#/records/2026-11-19')).toBe('records');
    expect(parseHash('#/stats?range=week')).toBe('stats');
  });

  it('知らない名前はタイマー画面', () => {
    expect(parseHash('#/unknown')).toBe('timer');
  });
});

describe('routeHref', () => {
  it('parseHash と往復できる', () => {
    for (const r of ROUTES) expect(parseHash(routeHref(r))).toBe(r);
  });
});
