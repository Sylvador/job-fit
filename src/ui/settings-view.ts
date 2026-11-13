import { DEFAULT_MODEL, PROFILE_AUTOSAVE_DELAY_MS } from '../config';
import type { PopupElements } from './dom';

/** Settings previously persisted in chrome.storage.local. */
export interface PersistedSettings {
    apiKey?: string;
    model?: string;
    profile?: string;
}

export interface SettingsViewCallbacks {
    /** "Сохранить" clicked: persist the trimmed API key and the raw model. */
    onSave(apiKey: string, model: string): Promise<void> | void;
    /** Profile textarea changed (already debounced by this view). */
    onProfileInput(profile: string): void;
}

/**
 * Owns the settings panel: opening/closing, reading field values and the
 * debounced autosave of the profile. Contains no persistence logic itself —
 * everything is reported through the injected callbacks.
 */
export class SettingsView {
    private saveTimer: number | undefined;

    constructor(
        private readonly els: PopupElements,
        private readonly callbacks: SettingsViewCallbacks
    ) {}

    /** Restores persisted values into the form fields. */
    applyStored(settings: PersistedSettings): void {
        if (settings.apiKey) this.els.apiKey.value = settings.apiKey;
        if (settings.model) this.els.model.value = settings.model;
        if (settings.profile) this.els.profile.value = settings.profile;
    }

    bind(): void {
        this.els.settingsToggle.addEventListener('click', () => this.toggle());
        this.els.saveSettings.addEventListener(
            'click',
            () => void this.commit()
        );
        this.els.profile.addEventListener('input', () =>
            this.scheduleProfileSave()
        );
    }

    toggle(): void {
        this.els.settingsPanel.classList.toggle('hidden');
    }

    open(): void {
        this.els.settingsPanel.classList.remove('hidden');
    }

    close(): void {
        this.els.settingsPanel.classList.add('hidden');
    }

    /** Current API key, trimmed. */
    get apiKey(): string {
        return this.els.apiKey.value.trim();
    }

    /** Raw model field value (persisted as-is). */
    get model(): string {
        return this.els.model.value;
    }

    /** Raw profile textarea value. */
    get profile(): string {
        return this.els.profile.value;
    }

    /** Model with fallback to the default when the field is blank. */
    get effectiveModel(): string {
        return this.model.trim() || DEFAULT_MODEL;
    }

    focusProfile(): void {
        this.els.profile.focus();
    }

    private async commit(): Promise<void> {
        await this.callbacks.onSave(this.apiKey, this.model);
    }

    private scheduleProfileSave(): void {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.callbacks.onProfileInput(this.els.profile.value);
        }, PROFILE_AUTOSAVE_DELAY_MS);
    }
}
