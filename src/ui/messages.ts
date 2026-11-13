import {
    ApiError,
    BadJsonError,
    BlockedResponseError,
    EmptyResponseError,
} from '../errors';

/**
 * Every user-facing string of the popup, in one place (the UI is Russian).
 * Centralizing them keeps views free of inline text and makes future
 * localization a single-file change.
 */
export const Messages = {
    // settings & validation
    settingsSaved: 'Настройки сохранены.',
    needApiKey: 'Сначала добавьте API-ключ в настройках (шестерёнка сверху).',
    needProfile:
        'Опишите коротко свой профиль — это нужно, чтобы оценить соответствие.',

    // check-flow statuses
    lookingForJob: 'Ищу вакансию на вкладке…',
    unsupportedSite:
        'Это не похоже на страницу LinkedIn, Layboard или hh.ru. Откройте вакансию и попробуйте снова.',
    noJobId:
        'Не удалось определить ID вакансии по адресу страницы. Откройте конкретную вакансию и повторите.',
    staleCache: 'Инструкции изменились с прошлой проверки — перепроверяю…',
    readingJob: 'Читаю вакансию на странице…',
    noDescription:
        'Не нашёл текст описания на этой странице. Откройте карточку вакансии целиком (не только список) и повторите.',
    askingModel: 'Спрашиваю Gemini…',

    // result card
    cachedPrefix: 'Результат из кэша · проверено ',
    checkedPrefix: 'Проверено ',
    unknownProject: 'Неизвестно',
    emptyListItem: '—',

    // history
    historyEmpty:
        'Пока нет сохранённых проверок. Откройте вакансию на LinkedIn, Layboard или hh и нажмите «Проверить эту вакансию».',
    historyNoMatch: 'Ничего не найдено. Измените поисковый запрос.',
    untitled: 'Без названия',
    staleBadge: 'инструкции изменились',
    prosLabel: 'Сильные стороны',
    consLabel: 'На что обратить внимание',
    openVacancy: 'Открыть вакансию ↗',
    deleteRecord: 'Удалить',
    defaultModelLabel: 'gemini',
    clearHistoryConfirm: (count: number) =>
        `Удалить все сохранённые проверки (${count})?`,
} as const;

/** Maps typed errors from the service layer to actionable user messages. */
export function describeError(err: unknown): string {
    if (err instanceof ApiError) {
        if (err.status === 401)
            return 'Ключ не принят. Проверьте, что он скопирован полностью, в настройках.';
        if (err.status === 429)
            return 'Слишком много запросов или закончился лимит — подождите немного и повторите.';
        if (err.status >= 500)
            return 'Сервис Gemini сейчас недоступен. Попробуйте ещё раз через минуту.';
        return `Gemini вернул ошибку (код ${err.status}).`;
    }
    if (err instanceof BadJsonError)
        return 'Не получилось разобрать ответ модели. Попробуйте ещё раз.';
    if (err instanceof BlockedResponseError) {
        return 'Ответ заблокирован фильтрами безопасности Gemini. Попробуйте переформулировать профиль.';
    }
    if (err instanceof EmptyResponseError)
        return 'Модель вернула пустой ответ. Попробуйте ещё раз.';
    if (err instanceof TypeError) return `${err.name}: ${err.message}`;
    return 'Что-то пошло не так. Попробуйте ещё раз.';
}
