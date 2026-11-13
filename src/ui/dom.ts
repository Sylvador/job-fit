/** An element whose value can be read/written (input or textarea). */
export type TextControl = HTMLInputElement | HTMLTextAreaElement;

/** Every popup element referenced by the views, looked up once. */
export interface PopupElements {
  settingsToggle: HTMLElement;
  settingsPanel: HTMLElement;
  apiKey: TextControl;
  model: TextControl;
  saveSettings: HTMLButtonElement;
  profile: TextControl;

  analyzeBtn: HTMLButtonElement;
  recheckBtn: HTMLButtonElement;
  status: HTMLElement;
  result: HTMLElement;
  scoreBadge: HTMLElement;
  scoreNum: HTMLElement;
  jobTitleLine: HTMLElement;
  verdict: HTMLElement;
  project: HTMLElement;
  prosList: HTMLUListElement;
  consList: HTMLUListElement;
  resultMeta: HTMLElement;

  mainView: HTMLElement;
  historyView: HTMLElement;
  historyToggle: HTMLElement;
  historySearch: TextControl;
  historySort: HTMLSelectElement;
  historyList: HTMLUListElement;
  historyEmpty: HTMLElement;
  clearHistory: HTMLButtonElement;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`popup.html is missing the element #${id}`);
  }
  return el as T;
}

/**
 * Single place that maps popup.html ids to typed elements. Fails fast with a
 * clear message when the markup and the script get out of sync.
 */
export function getPopupElements(): PopupElements {
  return {
    settingsToggle: requireElement('settingsToggle'),
    settingsPanel: requireElement('settingsPanel'),
    apiKey: requireElement('apiKey'),
    model: requireElement('model'),
    saveSettings: requireElement('saveSettings'),
    profile: requireElement('profile'),

    analyzeBtn: requireElement('analyzeBtn'),
    recheckBtn: requireElement('recheckBtn'),
    status: requireElement('status'),
    result: requireElement('result'),
    scoreBadge: requireElement('scoreBadge'),
    scoreNum: requireElement('scoreNum'),
    jobTitleLine: requireElement('jobTitleLine'),
    verdict: requireElement('verdict'),
    project: requireElement('project'),
    prosList: requireElement('prosList'),
    consList: requireElement('consList'),
    resultMeta: requireElement('resultMeta'),

    mainView: requireElement('mainView'),
    historyView: requireElement('historyView'),
    historyToggle: requireElement('historyToggle'),
    historySearch: requireElement('historySearch'),
    historySort: requireElement('historySort'),
    historyList: requireElement('historyList'),
    historyEmpty: requireElement('historyEmpty'),
    clearHistory: requireElement('clearHistory'),
  };
}
