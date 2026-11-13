import type { CheckRecord } from './types';

/**
 * Pure helpers with no dependencies — trivially testable and reusable
 * by both the controllers and the views.
 */

/**
 * Short deterministic hash (djb2, base 36). Used to detect profile changes
 * without storing a copy of the profile inside every check record.
 */
export function hashString(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = (h * 33 + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
}

/** Clamps a verdict score into the 1..10 range used for display. */
export function scoreOf(
    record: Pick<CheckRecord, 'verdict'> | null | undefined
): number {
    const score = Number(record?.verdict?.score) || 0;
    return Math.max(1, Math.min(10, Math.round(score)));
}

/**
 * Human-friendly Russian date: 'сегодня в 14:05', 'вчера в 09:00',
 * or '03.07.26, 14:05' for anything older.
 */
export function formatDateTime(ts: number | undefined): string {
    if (!ts) return '—';
    const date = new Date(ts);
    const now = new Date();
    const time = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    });

    if (date.toDateString() === now.toDateString()) return `сегодня в ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString())
        return `вчера в ${time}`;

    const day = date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    });
    return `${day}, ${time}`;
}
