// ---------------------------------------------------------------------------
// Everything in this file runs only inside the extension popup, and only
// while the popup is open. Nothing here executes automatically on LinkedIn —
// the page is read exactly once, at the moment the user clicks the button,
// via chrome.scripting.executeScript scoped to the active tab (activeTab
// permission). There is no background polling, no persistent content
// script, and no request is ever sent to linkedin.com itself — only to
// generativelanguage.googleapis.com, with the user's own key.
//
// Кэш проверок: под ключом `check_<jobId>` хранится вердикт Gemini плюс
// метаданные (хэш профиля, модель, время). Если профиль и модель не менялись
// с прошлой проверки — результат показывается мгновенно из кэша; если
// менялись — «Проверить эту вакансию» автоматически запускает новую
// проверку. Кнопка «Проверить заново» игнорирует кэш всегда.
// ---------------------------------------------------------------------------

/**
 * @typedef {{ title: string, description: string, jobId: string, skills: string[] }} Job
 */

/**
 * @typedef {{ text: string }} Part
 */

/**
 * @typedef {Object} CheckRecord
 * @property {string} jobId
 * @property {'linkedin'|'hh'} site
 * @property {string} [url] — канонический URL вакансии (для ссылок из истории)
 * @property {string} title
 * @property {{ score: number, verdict: string, pros: string[], cons: string[] }} verdict
 * @property {string} model
 * @property {string} profileHash
 * @property {number} checkedAt
 */

const els = {
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.getElementById('settingsPanel'),
    apiKey: document.getElementById('apiKey'),
    model: document.getElementById('model'),
    saveSettings: document.getElementById('saveSettings'),
    profile: document.getElementById('profile'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    status: document.getElementById('status'),
    result: document.getElementById('result'),
    scoreBadge: document.getElementById('scoreBadge'),
    scoreNum: document.getElementById('scoreNum'),
    jobTitleLine: document.getElementById('jobTitleLine'),
    verdict: document.getElementById('verdict'),
    prosList: document.getElementById('prosList'),
    consList: document.getElementById('consList'),
    // повторная проверка
    recheckBtn: document.getElementById('recheckBtn'),
    resultMeta: document.getElementById('resultMeta'),
    // история
    historyToggle: document.getElementById('historyToggle'),
    mainView: document.getElementById('mainView'),
    historyView: document.getElementById('historyView'),
    historySearch: document.getElementById('historySearch'),
    historySort: document.getElementById('historySort'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    clearHistory: document.getElementById('clearHistory'),
};

const CHECK_KEY_PREFIX = 'check_';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MAX_JOB_CHARS = 6000;

let currentView = 'main';

/** @type {CheckRecord[]} */
let historyRecords = [];

function checkKey(site, jobId) {
    return `${CHECK_KEY_PREFIX}${site}_${jobId}`;
}

function siteName(url) {
    if (!url) return null;
    if (url.includes('linkedin.com')) return 'linkedin';
    if (url.includes('headhunter.ge') || url.includes('hh.ru')) return 'hh';
    return null;
}

async function getActiveTabInfo() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const site = siteName(tab?.url);
    if (!tab || !site) return { tab: null, site: null, jobId: null };
    return { tab, site, jobId: parseJobId(tab.url) };
}

function parseJobId(url) {
    let match;
    if (url.includes('linkedin.com')) {
        match = url.match(/[?&]currentJobId=(\d+)/);
        if (match) return match[1];
        match = url.match(/\/jobs\/view\/(\d+)/);
        return match ? match[1] : null;
    }
    if (url.includes('headhunter.ge') || url.includes('hh.ru')) {
        match = url.match(/\/vacancy\/(\d+)/);
        return match ? match[1] : null;
    }
    return null;
}

async function getCheckRecord(site, jobId) {
    const key = checkKey(site, jobId);
    return (await chrome.storage.local.get(key))?.[key] || null;
}

function buildJobUrl(site, tabUrl, jobId) {
    if (site === 'linkedin') return `https://www.linkedin.com/jobs/view/${jobId}`;
    if (site === 'hh') {
        try {
            return `${new URL(tabUrl).origin}/vacancy/${jobId}`;
        } catch (e) {
            return `https://hh.ru/vacancy/${jobId}`;
        }
    }
    return null;
}

function getEffectiveModel() {
    return (els.model.value || '').trim() || DEFAULT_MODEL;
}

function getAIUrl(model) {
    const m = (model || '').trim() || DEFAULT_MODEL;
    return `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
}

const responseSchema = {
    type: 'object',
    properties: {
        score: { type: 'integer', description: 'integer from 1 to 10' },
        verdict: { type: 'string', description: 'one short sentence in Russian' },
        pros: {
            type: 'array',
            items: { type: 'string' },
            description: 'array of up to 4 short strings in Russian',
        },
        cons: {
            type: 'array',
            items: { type: 'string' },
            description: 'array of up to 4 short strings in Russian',
        }
    },
    required: ['score', 'verdict', 'pros', 'cons']
};

init();

async function init() {
    const stored = await chrome.storage.local.get(null);
    if (stored.apiKey) els.apiKey.value = stored.apiKey;
    if (stored.model) els.model.value = stored.model;
    if (stored.profile) els.profile.value = stored.profile;

    // Open settings automatically the first time, when there's no key yet.
    if (!stored.apiKey) els.settingsPanel.classList.remove('hidden');

    els.settingsToggle.addEventListener('click', () => {
        if (currentView === 'history') switchView('main');
        els.settingsPanel.classList.toggle('hidden');
    });

    els.saveSettings.addEventListener('click', async () => {
        await chrome.storage.local.set({
            apiKey: els.apiKey.value.trim(),
            model: els.model.value,
        });
        setStatus('Настройки сохранены.', false);
        els.settingsPanel.classList.add('hidden');
    });

    let saveTimer;
    els.profile.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            chrome.storage.local.set({ profile: els.profile.value });
        }, 400);
    });

    els.analyzeBtn.addEventListener('click', () => onAnalyzeClick(false));
    els.recheckBtn.addEventListener('click', () => onAnalyzeClick(true));

    els.historyToggle.addEventListener('click', () => {
        switchView(currentView === 'history' ? 'main' : 'history');
    });
    els.historySearch.addEventListener('input', renderHistoryList);
    els.historySort.addEventListener('change', renderHistoryList);
    els.clearHistory.addEventListener('click', clearAllHistory);

    await renderCachedIfExists()
}

async function renderCachedIfExists() {
    const { site, jobId } = await getActiveTabInfo()
    if (!site || !jobId) return
    const cached = await getCheckRecord(site, jobId);
    if (!cached) return
    renderResult(cached, true);
    setStatus('', false);
}

// ---------------------------------------------------------------------------
// Анализ вакансии
// ---------------------------------------------------------------------------

/**
 * @param {boolean} force true — игнорировать кэш и проверить заново
 */
async function onAnalyzeClick(force = false) {
    els.result.classList.add('hidden');
    setStatus('', false);

    const apiKey = els.apiKey.value.trim();
    const profile = els.profile.value.trim();
    const model = getEffectiveModel();

    if (!apiKey) {
        setStatus('Сначала добавьте API-ключ в настройках (шестерёнка сверху).', true);
        els.settingsPanel.classList.remove('hidden');
        return;
    }
    if (!profile) {
        setStatus('Опишите коротко свой профиль — это нужно, чтобы оценить соответствие.', true);
        els.profile.focus();
        return;
    }

    els.analyzeBtn.disabled = true;
    try {
        setStatus('Ищу вакансию на вкладке…', false);
        const { tab, site, jobId } = await getActiveTabInfo();

        if (!tab || !site) {
            setStatus('Это не похоже на страницу LinkedIn или hh.ru. Откройте вакансию и попробуйте снова.', true);
            return;
        }
        if (!jobId) {
            setStatus('Не удалось определить ID вакансии по адресу страницы. Откройте конкретную вакансию и повторите.', true);
            return;
        }

        // Быстрый путь: результат уже в кэше и инструкции не менялись.
        if (!force) {
            const cached = await getCheckRecord(site, jobId);
            if (cached && cached.verdict
                && cached.profileHash === hashString(profile)
                && cached.model === model) {
                renderResult(cached, true);
                setStatus('', false);
                return;
            }
            if (cached) {
                setStatus('Инструкции изменились с прошлой проверки — перепроверяю…', false);
            }
        }

        setStatus('Читаю вакансию на странице…', false);
        const job = await scrapeJobFromTab(tab, jobId);

        if (!job.description) {
            setStatus('Не нашёл текст описания на этой странице. Откройте карточку вакансии целиком (не только список) и повторите.', true);
            return;
        }

        setStatus('Спрашиваю Gemini…', false);
        const verdict = await callGemini(apiKey, model, profile, job);

        /** @type {CheckRecord} */
        const record = {
            jobId,
            site,
            url: buildJobUrl(site, tab.url, jobId),
            title: job.title,
            verdict,
            model,
            profileHash: hashString(profile),
            checkedAt: Date.now(),
        };
        await chrome.storage.local.set({ [checkKey(site, jobId)]: record });

        renderResult(record, false);
        setStatus('', false);
    } catch (err) {
        setStatus(describeError(err), true);
    } finally {
        els.analyzeBtn.disabled = false;
    }
}

// Находит активную вкладку и вытаскивает jobId из URL, ничего не инжектируя.
async function getActiveLinkedInTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('linkedin.com') || !tab.url.includes('headhunter.ge') || !tab.url.includes('hh.ru')) {
        return { tab: null, jobId: null };
    }
    return { tab, jobId: parseJobId(tab.url) };
}

// Читает вакансию с текущей вкладки. Запускается один раз, по клику, в
// контексте страницы — ничего не инжектируется заранее.
async function scrapeJobFromTab(tab, jobId) {
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractJobData,
        args: [+jobId],
    });
    return {
        title: result?.title || '',
        description: result?.description || '',
        skills: Array.isArray(result?.skills) ? result.skills : [],
        jobId: String(jobId),
    };
}

// Runs inside the LinkedIn/hh page. Keep this self-contained (no outer
// references) since executeScript serializes it separately — константы и
// хелперы из popup.js сюда не попадают.
/**
 *
 * @param {number} jobId
 * @returns {Omit<Job, 'jobId'>}
 */
function extractJobData(jobId) {
    const isLinkedIn = location.hostname.includes('linkedin.com');

    const LINKEDIN_TITLE = [
        'div[data-display-contents=true] > p > a',
        '.job-details-jobs-unified-top-card__job-title h1',
        '.jobs-unified-top-card__job-title h1',
        'h1.t-24',
        'h1',
    ];

    const LINKEDIN_DESC = [
        `#JobDetails_AboutTheJob_${jobId} p > span`,
        '#job-details > div',
        '#job-details',
        '.jobs-box__html-content',
        'article',
    ];

    /**
     * @returns {string | undefined}
     */
    function findDescription() {
        let descriptionNode = firstMatchNode(isLinkedIn ? LINKEDIN_DESC : HH_DESC)
        if (descriptionNode) {
            return sanitizeMoreBtn(descriptionNode).innerText?.trim()
        }
        const aboutDivRes = [...document.querySelectorAll('div:has(> div > h2)').values().filter(n => {
            let r = n.childNodes.values().filter(n2 => n2.textContent === 'About the job')
            return [...r].length === 1
        })]
        if (aboutDivRes.length === 0) {
            throw new Error('no job description found')
        }
        if (aboutDivRes.length > 1) {
            throw new Error("couldn't narrow results down to job description")
        }
        /**
         * @type {HTMLDivElement}
         */
        const aboutDiv = aboutDivRes[0]
        for (let i = 0; i < aboutDiv.childNodes.length - 1; i++) {
            const n = aboutDiv.childNodes[i]
            if (n.textContent === 'About the job') {
                descriptionNode = aboutDiv.childNodes[i + 1]
                return sanitizeMoreBtn(descriptionNode).innerText?.trim()
            }
        }
    }

    /**
     * @param {HTMLElement} n
     * @returns {HTMLElement}
     */
    function sanitizeMoreBtn(n) {
        /**
         * @type {HTMLElement}
         */
        const clone = n.cloneNode(true);

        const buttons = clone.querySelectorAll('button');

        for (const btn of buttons) {
            if (btn.textContent?.trim().toLowerCase() === '… more') {
                btn.remove();
            }
        }

        return clone;
    }


    const HH_TITLE = ['[data-qa="vacancy-title"]'];
    const HH_DESC = ['[data-qa="vacancy-description"]'];
    const HH_SKILLS = '[data-qa="skills-element"]';

    /**
     * 
     * @param {HTMLElement} selectors 
     * @returns {HTMLElement}
     */
    function firstMatchNode(selectors) {
        for (const sel of selectors) {
            try {
                /**
                 * @type {HTMLElement | null}
                 */
                const el = document.querySelector(sel);
                const text = el?.innerText ? el.innerText.trim() : '';
                if (text) return el;
            } catch (e) {
                // invalid/unsupported selector on this page state — try the next one
            }
        }
    }

    const title = firstMatchNode(isLinkedIn ? LINKEDIN_TITLE : HH_TITLE)?.innerText?.trim()
        || (isLinkedIn
            ? document.title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim()
            // TODO: сверьте с реальным форматом <title> на tbilisi.headhunter.ge
            : document.title.replace(/\s*[—–|]\s*(Вакансия|Vacancy)\b.*$/i, '').trim());

    /** @type {Omit<Job, 'jobId'>} */
    const job = {
        title,
        description: findDescription(),
    };

    if (!isLinkedIn) {
        const skills = [...document.querySelectorAll(HH_SKILLS)]
            .map((el) => el.textContent.trim())
            .filter(Boolean);
        if (skills.length) job.skills = skills;
    }

    return job;
}

// ---------------------------------------------------------------------------
// История проверок
// ---------------------------------------------------------------------------

async function switchView(view) {
    currentView = view;
    els.mainView.classList.toggle('hidden', view === 'history');
    els.historyView.classList.toggle('hidden', view !== 'history');
    els.historyToggle.classList.toggle('is-active', view === 'history');
    if (view === 'history') {
        await loadHistoryRecords();
        renderHistoryList();
    }
}

async function loadHistoryRecords() {
    const all = await chrome.storage.local.get(null);
    historyRecords = [];

    for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(CHECK_KEY_PREFIX)) continue;
        if (!value || typeof value !== 'object' || !value.verdict) continue;

        // Записи до добавления hh (ключ `check_<jobId>`, без сайта):
        // помечаем как linkedin и переносим на новый формат ключа.
        if (!value.site) {
            value.site = 'linkedin';
            const newKey = checkKey(value.site, value.jobId);
            if (newKey !== key) {
                await chrome.storage.local.set({ [newKey]: value });
                await chrome.storage.local.remove(key);
            }
        }
        historyRecords.push(value);
    }
}

function renderHistoryList() {
    const query = els.historySearch.value.trim().toLowerCase();
    const sortBy = els.historySort.value;

    const items = historyRecords
        .filter(r => !query || (r.title || '').toLowerCase().includes(query));

    items.sort((a, b) => sortBy === 'score'
        ? (scoreOf(b) - scoreOf(a)) || (b.checkedAt - a.checkedAt)
        : b.checkedAt - a.checkedAt);

    els.historyList.innerHTML = '';
    items.forEach(r => els.historyList.appendChild(buildHistoryItem(r)));

    els.historyEmpty.classList.toggle('hidden', items.length !== 0);
    if (items.length === 0) {
        els.historyEmpty.textContent = historyRecords.length === 0
            ? 'Пока нет сохранённых проверок. Откройте вакансию на LinkedIn или hh и нажмите «Проверить эту вакансию».'
            : 'Ничего не найдено. Измените поисковый запрос.';
    }
    els.clearHistory.classList.toggle('hidden', historyRecords.length === 0);
}

function scoreOf(record) {
    return Math.max(1, Math.min(10, Math.round(Number(record?.verdict?.score) || 0)));
}

function buildHistoryItem(record) {
    const score = scoreOf(record);
    const tier = score >= 8 ? 'hs-good' : score >= 5 ? 'hs-mid' : 'hs-low';

    const li = document.createElement('li');
    li.className = 'history-item';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'history-item-head';

    const scoreEl = document.createElement('span');
    scoreEl.className = `history-score ${tier}`;
    scoreEl.textContent = String(score);

    const textWrap = document.createElement('span');
    textWrap.className = 'history-head-text';

    const titleEl = document.createElement('span');
    titleEl.className = 'history-title';
    const title = record.title || 'Без названия';
    titleEl.textContent = title;
    titleEl.title = title;

    const metaEl = document.createElement('span');
    metaEl.className = 'history-meta';
    const dateEl = document.createElement('span');
    dateEl.textContent = `${formatDateTime(record.checkedAt)} · ${record.model || 'gemini'}`;
    metaEl.appendChild(dateEl);
    if (record.profileHash !== hashString(els.profile.value.trim())
        || record.model !== getEffectiveModel()) {
        const staleEl = document.createElement('span');
        staleEl.className = 'history-stale';
        staleEl.textContent = 'инструкции изменились';
        metaEl.appendChild(staleEl);
    }

    const chevron = document.createElement('span');
    chevron.className = 'history-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';

    textWrap.append(titleEl, metaEl);
    head.append(scoreEl, textWrap, chevron);

    const details = document.createElement('div');
    details.className = 'history-details hidden';

    const verdictEl = document.createElement('p');
    verdictEl.className = 'history-verdict';
    verdictEl.textContent = record.verdict.verdict || '';
    details.appendChild(verdictEl);

    const cols = document.createElement('div');
    cols.className = 'history-cols';
    cols.appendChild(buildMiniCol('Сильные стороны', record.verdict.pros));
    cols.appendChild(buildMiniCol('На что обратить внимание', record.verdict.cons));
    details.appendChild(cols);

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    const link = document.createElement('a');
    link.className = 'history-link';
    link.href = record.url
        || (record.site === 'hh'
            ? `https://hh.ru/vacancy/${record.jobId}`
            : `https://www.linkedin.com/jobs/view/${record.jobId}`);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Открыть вакансию ↗';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'history-delete';
    del.textContent = 'Удалить';
    del.addEventListener('click', () => deleteHistoryRecord(record));

    actions.append(link, del);
    details.appendChild(actions);

    head.addEventListener('click', () => {
        const willOpen = details.classList.contains('hidden');
        details.classList.toggle('hidden', !willOpen);
        li.classList.toggle('open', willOpen);
        head.setAttribute('aria-expanded', String(willOpen));
    });

    li.append(head, details);
    return li;
}

function buildMiniCol(label, items) {
    const wrap = document.createElement('div');
    const labelEl = document.createElement('p');
    labelEl.className = 'history-col-label';
    labelEl.textContent = label;
    const ul = document.createElement('ul');
    ul.className = 'history-list-mini';
    const list = (items || []).slice(0, 4);
    if (list.length === 0) list.push('—');
    list.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
    });
    wrap.append(labelEl, ul);
    return wrap;
}


async function deleteHistoryRecord(record) {
    await chrome.storage.local.remove(checkKey(record.site, record.jobId));
    historyRecords = historyRecords.filter(r => r !== record);
    renderHistoryList();
}

async function clearAllHistory() {
    if (!historyRecords.length) return;
    if (!confirm(`Удалить все сохранённые проверки (${historyRecords.length})?`)) return;
    await chrome.storage.local.remove(historyRecords.map(r => checkKey(r.site, r.jobId)));
    historyRecords = [];
    renderHistoryList();
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

// Короткий детерминированный хэш, чтобы не хранить копию профиля в каждой записи.
function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h * 33) + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
}

function formatDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = d.toDateString();
    if (day === now.toDateString()) return `сегодня в ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (day === yesterday.toDateString()) return `вчера в ${time}`;
    return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}, ${time}`;
}

function truncate(text) {
    if (text.length <= MAX_JOB_CHARS) return text;
    const head = text.slice(0, 4200);
    const tail = text.slice(-1400);
    return `${head}\n\n[…средняя часть описания сокращена…]\n\n${tail}`;
}

class ApiError extends Error {
    constructor(status, body) {
        super(`api_error_${status}`);
        this.status = status;
        this.body = body;
    }
}

/**
 * 
 * @param {string} apiKey 
 * @param {string} model 
 * @param {string} profile 
 * @param {Job} job 
 * @returns {Promise<CheckRecord['verdict']>}
 */
async function callGemini(apiKey, model, profile, job) {
    const system = [
        'You are a pragmatic career advisor helping a candidate quickly judge whether',
        'a specific job posting is worth their time to apply to.',
        'Base the score strictly on fit between the candidate profile and the requirements',
        'responsibilities in the posting — not on how prestigious or well-known the company is.',
    ].join(' ');

    /**
     * @type {Part[]}
     */
    const parts = [
        partFromText(`Профиль кандидата:\n${profile}`),
        partFromText(`Вакансия «${job.title}»:\n${truncate(job.description)}`)
    ]

    if (job.skills?.length) {
        parts.push(partFromText(`Ключевые навыки вакансии: ${job.skills.join(', ')}`))
    }

    const resp = await fetch(getAIUrl(model), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{
                parts,
            }],
            systemInstruction: { parts: [{ text: system }] },
            generationConfig: {
                response_mime_type: 'application/json',
                response_schema: responseSchema,
            },
        }),
    });

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new ApiError(resp.status, body);
    }

    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || '')
        .join('')
        .trim()
        .replace(/^```json\s*|\s*```$/g, '');

    if (!raw) {
        // важно: Gemini при срабатывании safety-фильтров возвращает
        // promptFeedback.blockReason и пустой candidates
        const block = data?.promptFeedback?.blockReason;
        throw new Error(block ? 'blocked_' + block : 'empty_response');
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error('bad_json');
    }
}

function renderResult(record, fromCache) {
    const verdict = record.verdict || {};
    const score = scoreOf(record);
    const tier = score >= 8 ? 'good' : score >= 5 ? 'mid' : 'low';

    els.scoreBadge.className = `score-badge ${tier}`;
    els.scoreNum.textContent = String(score);
    els.jobTitleLine.textContent = record.title || '';
    els.verdict.textContent = verdict.verdict || '';

    fillList(els.prosList, verdict.pros);
    fillList(els.consList, verdict.cons);

    els.resultMeta.textContent = (fromCache ? 'Результат из кэша · проверено ' : 'Проверено ')
        + formatDateTime(record.checkedAt);

    els.result.classList.remove('hidden');
}

function fillList(ul, items) {
    ul.innerHTML = '';
    (items || []).slice(0, 4).forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
    });
    if (!items || items.length === 0) {
        const li = document.createElement('li');
        li.textContent = '—';
        ul.appendChild(li);
    }
}

function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.classList.toggle('error', !!isError);
}

function describeError(err) {
    if (err instanceof ApiError) {
        if (err.status === 401) return 'Ключ не принят. Проверьте, что он скопирован полностью, в настройках.';
        if (err.status === 429) return 'Слишком много запросов или закончился лимит — подождите немного и повторите.';
        if (err.status >= 500) return 'Сервис Gemini сейчас недоступен. Попробуйте ещё раз через минуту.';
        return `Gemini вернул ошибку (код ${err.status}).`;
    }
    if (err.message === 'bad_json') return 'Не получилось разобрать ответ модели. Попробуйте ещё раз.';
    if (err.message.startsWith('blocked_')) {
        return 'Ответ заблокирован фильтрами безопасности Gemini. Попробуйте переформулировать профиль.';
    }
    if (err.message === 'empty_response') return 'Модель вернула пустой ответ. Попробуйте ещё раз.';
    if (err instanceof TypeError) return `${err.name}: ${err.message}`;
    // if (err instanceof TypeError) return 'Не получилось соединиться с generativelanguage.googleapis.com. Проверьте интернет-соединение.';
    return 'Что-то пошло не так. Попробуйте ещё раз.';
}

/**
 * 
 * @param {string} text 
 * @returns {Part}
 */
function partFromText(text) {
    return {
        text
    }
}