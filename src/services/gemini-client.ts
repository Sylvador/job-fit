import { DEFAULT_MODEL, GEMINI_API_BASE } from '../config.js';
import {
    ApiError,
    BadJsonError,
    BlockedResponseError,
    EmptyResponseError,
} from '../errors';
import type { Job, TextPart, Verdict } from '../types';

/** Structured-output contract enforced by the model. */
const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        score: { type: 'integer', description: 'integer from 1 to 10' },
        verdict: {
            type: 'string',
            description: 'one short sentence in russian',
        },
        project: {
            type: 'string',
            description: 'short description of a project in russian, if exists',
        },
        pros: {
            type: 'array',
            items: { type: 'string' },
            description: 'array of up to 4 short strings in Russian',
        },
        cons: {
            type: 'array',
            items: { type: 'string' },
            description: 'array of up to 4 short strings in Russian',
        },
    },
    required: ['score', 'verdict', 'pros', 'cons'],
} as const;

const SYSTEM_INSTRUCTION = [
    'You are a pragmatic career advisor helping a candidate quickly judge whether',
    'a specific job posting is worth their time to apply to.',
    'Base the score strictly on fit between the candidate profile and the requirements',
    'responsibilities in the posting — not on how prestigious or well-known the company is.',
].join(' ');

export interface GeminiSettings {
    apiKey: string;
    /** Model id; falls back to DEFAULT_MODEL when blank. */
    model?: string;
}

type FetchLike = typeof fetch;

interface GeminiContentPart {
    text?: string;
}

/** Shape of a generateContent response (only the fields we read). */
interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: GeminiContentPart[] } }>;
    promptFeedback?: { blockReason?: string };
}

/**
 * Client for the Gemini generateContent API with structured (JSON) output.
 *
 * It knows nothing about Chrome, the DOM or caching — its single job is to
 * turn (job, profile) into a Verdict or a typed error. The fetch
 * implementation is injectable, which makes the client testable without
 * network access (Dependency Inversion).
 */
export class GeminiClient {
    constructor(
        private readonly settings: GeminiSettings,
        private readonly fetchImpl: FetchLike = (input, init) =>
            fetch(input, init)
    ) {}

    async analyzeJob(job: Job, profile: string): Promise<Verdict> {
        const response = await this.fetchImpl(this.endpoint(), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-goog-api-key': this.settings.apiKey,
            },
            body: JSON.stringify({
                contents: [{ parts: this.buildParts(job, profile) }],
                systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                generationConfig: {
                    response_mime_type: 'application/json',
                    response_schema: RESPONSE_SCHEMA,
                },
            }),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new ApiError(response.status, body);
        }

        return parseVerdict(await response.json());
    }

    private endpoint(): string {
        const model = this.settings.model?.trim() || DEFAULT_MODEL;
        return `${GEMINI_API_BASE}/${model}:generateContent`;
    }

    private buildParts(job: Job, profile: string): TextPart[] {
        const parts: TextPart[] = [
            { text: `Профиль кандидата:\n${profile}` },
            { text: `Вакансия «${job.title}»:\n${job.description}` },
        ];
        if (job.skills?.length) {
            parts.push({
                text: `Ключевые навыки вакансии: ${job.skills.join(', ')}`,
            });
        }
        return parts;
    }
}

/** Extracts and parses the JSON verdict from a generateContent response. */
function parseVerdict(data: GeminiResponse): Verdict {
    const raw = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim()
        .replace(/^```json\s*|\s*```$/g, '');

    if (!raw) {
        // Safety filters manifest as promptFeedback.blockReason plus empty
        // candidates — distinguish that from a genuinely empty answer.
        const blockReason = data?.promptFeedback?.blockReason;
        if (blockReason) throw new BlockedResponseError(blockReason);
        throw new EmptyResponseError();
    }

    try {
        return JSON.parse(raw) as Verdict;
    } catch {
        throw new BadJsonError();
    }
}
