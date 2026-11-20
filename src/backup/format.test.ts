import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  backupSignature,
  buildBackup,
  dayToMarkdown,
  ImportError,
  oldBackupFiles,
  parseBackup,
  sessionsToCsv,
  type BackupData,
} from './format';
import { DEFAULT_PRESETS, DEFAULT_SETTINGS, type Project, type Session, type Task } from '../db/types';
import { toIsoLocal } from '../lib/time';

const at = (d: number, h: number, m = 0) => toIsoLocal(new Date(2026, 10, d, h, m));
const project: Project = { id: 'p1', name: 'イラスト練習', color: '#2a78d6', archived: false, deleted: false, createdAt: '', updatedAt: '' };
const task = (id: string, title: string, projectId: string | null, extra: Partial<Task> = {}): Task => ({
  id, projectId, title, estimatedMin: null, repeat: null, dueDate: null, note: '', done: false, doneAt: null, deleted: false,
  createdAt: '', updatedAt: '', ...extra,
});
let n = 0;
const session = (taskId: string | null, startAt: string, endAt: string, min: number, extra: Partial<Session> = {}): Session => ({
  id: `s${n++}`, taskId, type: 'timer', startAt, endAt, durationSec: min * 60, completed: true, note: '', deleted: false,
  createdAt: '', updatedAt: '', ...extra,
});

const tasks = [task('t1', '手のデッサン', 'p1'), task('t2', '模写', 'p1'), task('t3', 'Excel関数', null), task('t4', '消した', 'p1', { deleted: true })];
const sessions = [
  session('t1', at(20, 20), at(20, 20, 25), 25, { note: '指の関節が難しい' }),
  session('t2', at(20, 20, 30), at(20, 21, 45), 75, { type: 'stopwatch' }),
  session('t3', at(20, 22), at(20, 22, 30), 30, { type: 'manual', note: 'カンマ, と "引用"' }),
  session(null, at(21, 1), at(21, 1, 20), 20), // 日付の区切り 4 時なら 11/20 の分
  session('t4', at(19, 9), at(19, 9, 10), 10),
  session('t1', at(18, 9), at(18, 9, 10), 10, { deleted: true }),
];

const data: BackupData = { projects: [project], tasks, sessions, presets: [], settings: DEFAULT_SETTINGS };

describe('JSON の書き出しと読み込み', () => {
  it('書き出したものをそのまま読み込める（削除済みも含めて全データ）', () => {
    const file = buildBackup(data, '2026-11-20T23:00:00.000+09:00');
    const back = parseBackup(JSON.stringify(file));
    expect(back).toEqual(data);
  });

  it('このアプリのファイルでない・形が違うものは読み込まない', () => {
    expect(() => parseBackup('{')).toThrow(ImportError);
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 3, data: {} }))).toThrow('このアプリで書き出した');
    expect(() => parseBackup(JSON.stringify({ app: 'work-timer', version: 2, data: {} }))).toThrow('version 2');
    const broken = buildBackup({ ...data, sessions: [{ id: 'x' } as unknown as Session] }, '');
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('記録の 1 件目');
  });

  it('足りない設定は初期値で補う', () => {
    const file = buildBackup({ ...data, presets: DEFAULT_PRESETS.map((p, i) => ({ ...p, id: `p${i}`, deleted: false, createdAt: '', updatedAt: '' })) }, '');
    const raw = JSON.parse(JSON.stringify(file));
    raw.data.settings = { volume: 30 };
    expect(parseBackup(JSON.stringify(raw)).settings).toEqual({ ...DEFAULT_SETTINGS, volume: 30 });
  });

  it('最後にバックアップした日時だけが違うなら、中身は同じとみなす', () => {
    const a = backupSignature(data);
    expect(backupSignature({ ...data, settings: { ...data.settings, lastBackupAt: '2026-11-20T10:00:00.000+09:00' } })).toBe(a);
    expect(backupSignature({ ...data, settings: { ...data.settings, volume: 10 } })).not.toBe(a);
  });
});

describe('バックアップのファイル名と古いファイルの削除', () => {
  it('1 日 1 つのファイル名', () => {
    expect(backupFileName(new Date(2026, 10, 20, 23, 59))).toBe('worklog-backup-2026-11-20.json');
  });

  it('30 日より前のバックアップだけ消す。ほかのファイルは消さない', () => {
    const names = [
      'worklog-backup-2026-11-20.json',
      'worklog-backup-2026-10-21.json', // ちょうど 30 日前 → 残す
      'worklog-backup-2026-10-20.json', // 31 日前 → 消す
      'worklog-backup-2025-01-01.json',
      'worklog-backup-2026-10-01.json.bak',
      'メモ.txt',
      'my-worklog-backup-2026-01-01.json',
    ];
    expect(oldBackupFiles(names, new Date(2026, 10, 20, 12))).toEqual(['worklog-backup-2026-10-20.json', 'worklog-backup-2025-01-01.json']);
  });
});

describe('CSV', () => {
  it('指定期間の記録を BOM 付きで。日付は日付の区切り時刻で決める。カンマや引用符を含むメモも崩れない', () => {
    const csv = sessionsToCsv({ sessions, tasks, projects: [project], from: '2026-11-20', to: '2026-11-20', boundaryHour: 4 });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      '日付,開始,終了,分,プロジェクト,タスク,種別,メモ',
      '2026-11-20,20:00,20:25,25,イラスト練習,手のデッサン,タイマー,指の関節が難しい',
      '2026-11-20,20:30,21:45,75,イラスト練習,模写,ストップウォッチ,',
      '2026-11-20,22:00,22:30,30,,Excel関数,手動,"カンマ, と ""引用"""',
      '2026-11-20,01:00,01:20,20,,未分類,タイマー,',
      '',
    ]);
  });

  it('削除済みタスクの記録も出す（削除済みの記録は出さない）', () => {
    const csv = sessionsToCsv({ sessions, tasks, projects: [project], from: '2026-11-18', to: '2026-11-19', boundaryHour: 4 });
    expect(csv.slice(1).split('\r\n')[1]).toBe('2026-11-19,09:00,09:10,10,,削除済みタスク,タイマー,');
    expect(csv.slice(1).split('\r\n')).toHaveLength(3);
  });
});

describe('Markdown', () => {
  it('指定日の作業ログ（要件書の例の形）', () => {
    const md = dayToMarkdown({ sessions: sessions.slice(0, 3), tasks, projects: [project], day: '2026-11-20', boundaryHour: 4 });
    expect(md).toBe(
      [
        '## 作業ログ 2026-11-20（合計 2時間10分）',
        '',
        '- 20:00–20:25 イラスト練習 / 手のデッサン（25分）メモ：指の関節が難しい',
        '- 20:30–21:45 イラスト練習 / 模写（75分）',
        '- 22:00–22:30 Excel関数（30分）メモ：カンマ, と "引用"',
        '',
      ].join('\n'),
    );
  });

  it('記録がない日', () => {
    expect(dayToMarkdown({ sessions: [], tasks, projects: [project], day: '2026-11-22', boundaryHour: 4 })).toBe('## 作業ログ 2026-11-22（合計 0分）\n\n- 記録なし\n');
  });
});
