/**
 * @snapie/operations/limits - 3Speak upload limits
 *
 * 3Speak caps uploads for free (non-Pro) accounts: 1 video and 3 shorts per
 * rolling 24 hours on embed.3speak.tv, and 2 audio uploads of at most 15
 * minutes each on audio.3speak.tv. Pro and warm-up accounts are exempt.
 *
 * A refused upload comes back as 429 (`daily_upload_limit`,
 * `daily_audio_limit`) or 413 (`audio_too_long`) with a JSON body. This module
 * turns those bodies into an {@link UploadLimitError}, builds a message with
 * the next slot in the viewer's own time zone, and reads the read-only quota
 * endpoints so an app can warn before the user picks a file.
 *
 * Never retry or fall back to another upload path on these errors: the
 * server refuses every path for the same owner.
 */

export const EMBED_SERVICE_BASE = 'https://embed.3speak.tv';
export const AUDIO_SERVICE_BASE = 'https://audio.3speak.tv';

export type UploadLimitKind = 'video' | 'short' | 'audio';

export type UploadLimitCode = 'daily_upload_limit' | 'daily_audio_limit' | 'audio_too_long';

const LIMIT_CODES: readonly string[] = ['daily_upload_limit', 'daily_audio_limit', 'audio_too_long'];

/**
 * A refused upload, parsed from the server's 429/413 body. Refusals are told
 * apart by `code`, not by status: audio.3speak.tv also sends a plain
 * per-minute 429 with no `code`, which is not a limit refusal.
 */
export interface UploadLimitInfo {
    code: UploadLimitCode;
    kind: UploadLimitKind;
    /** HTTP status of the refusal (429 or 413). */
    status: number;
    /** The server's plain-English explanation. */
    message: string;
    /** Where the user can get 3Speak Pro. */
    upgradeUrl: string | null;
    limit: number | null;
    used: number | null;
    /** ISO time when the next upload slot frees up. */
    nextAt: string | null;
    retryAfterSeconds: number | null;
    /** audio_too_long: the longest a free account may upload. */
    maxSeconds: number | null;
    /** audio_too_long: the file's length as the server measured it. */
    duration: number | null;
}

/** Thrown by the upload helpers when 3Speak refuses an upload for its limits. */
export class UploadLimitError extends Error {
    readonly isUploadLimitError = true as const;
    readonly info: UploadLimitInfo;

    constructor(info: UploadLimitInfo) {
        super(formatUploadLimitMessage(info));
        this.name = 'UploadLimitError';
        this.info = info;
    }
}

/**
 * Duck-typed so it holds across bundles: the video, audio and limits entry
 * points each carry their own copy of the class.
 */
export function isUploadLimitError(error: unknown): error is UploadLimitError {
    return !!error
        && typeof error === 'object'
        && (error as { isUploadLimitError?: unknown }).isUploadLimitError === true
        && typeof (error as { info?: unknown }).info === 'object';
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/**
 * Parse a refusal body. Returns null for anything that is not one of the
 * limit codes (a plain rate limit, a server error, a missing body), so the
 * caller keeps its normal error handling for those.
 */
export function parseUploadLimit(
    status: number,
    body: unknown,
    retryAfterHeader?: string | null,
): UploadLimitInfo | null {
    if (status !== 429 && status !== 413) return null;
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const code = typeof b.code === 'string' ? b.code : '';
    if (!LIMIT_CODES.includes(code)) return null;

    const kind: UploadLimitKind = code === 'daily_upload_limit'
        ? (b.kind === 'short' ? 'short' : 'video')
        : 'audio';
    const header = retryAfterHeader != null && /^\d+$/.test(retryAfterHeader.trim())
        ? Number(retryAfterHeader.trim())
        : null;

    return {
        code: code as UploadLimitCode,
        kind,
        status,
        message: str(b.message) ?? str(b.error) ?? 'Upload limit reached. 3Speak Pro removes this limit.',
        upgradeUrl: str(b.upgrade_url),
        limit: num(b.limit),
        used: num(b.used),
        nextAt: str(b.next_at),
        retryAfterSeconds: num(b.retry_after_seconds) ?? header,
        maxSeconds: num(b.max_seconds),
        duration: num(b.duration),
    };
}

/** Read a fetch Response; null when it is not a limit refusal. Does not consume `response`. */
export async function readUploadLimit(response: Response): Promise<UploadLimitInfo | null> {
    if (response.status !== 429 && response.status !== 413) return null;
    try {
        const body = await response.clone().json();
        return parseUploadLimit(response.status, body, response.headers.get('Retry-After'));
    } catch {
        return null;
    }
}

/**
 * Map a tus-js-client error (DetailedError) to a limit refusal. The TUS
 * create request is refused with the same 429 body as the token route.
 */
export function uploadLimitFromTusError(error: unknown): UploadLimitInfo | null {
    const res = (error as { originalResponse?: { getStatus?: () => number; getBody?: () => string; getHeader?: (h: string) => string | undefined } } | null)?.originalResponse;
    if (!res || typeof res.getStatus !== 'function') return null;
    const status = res.getStatus();
    if (status !== 429 && status !== 413) return null;
    try {
        const body = JSON.parse(res.getBody?.() || '');
        return parseUploadLimit(status, body, res.getHeader?.('Retry-After') ?? null);
    } catch {
        return null;
    }
}

export interface FormatOptions {
    /** BCP 47 locale for the date; the browser default when omitted. */
    locale?: string;
    /** IANA time zone; the viewer's own when omitted. */
    timeZone?: string;
}

/** "Fri, Nov 21, 2:32 PM" in the viewer's time zone, or null for a bad date. */
export function formatNextSlot(nextAt: string | null, opts: FormatOptions = {}): string | null {
    if (!nextAt) return null;
    const date = new Date(nextAt);
    if (Number.isNaN(date.getTime())) return null;
    try {
        return date.toLocaleString(opts.locale, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: opts.timeZone,
        });
    } catch {
        return null;
    }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "15 minutes", "1 minute 30 seconds", "45 seconds" (same wording as the server). */
export function formatLength(seconds: number): string {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m === 0) return plural(s, 'second');
    return s ? `${plural(m, 'minute')} ${plural(s, 'second')}` : plural(m, 'minute');
}

/** "22:05" for a duration in seconds. */
function clock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const NOUN: Record<UploadLimitKind, [string, string]> = {
    video: ['video', 'videos'],
    short: ['short', 'shorts'],
    audio: ['audio file', 'audio files'],
};

/**
 * The text to show for a refusal. Built from code, limit and next_at so the
 * time is in the viewer's own zone; falls back to the server's `message`
 * when a field is missing.
 */
export function formatUploadLimitMessage(info: UploadLimitInfo, opts: FormatOptions = {}): string {
    const pro = '3Speak Pro removes this limit.';
    if (info.code === 'audio_too_long') {
        if (info.maxSeconds == null) return info.message;
        const length = info.duration != null ? ` This file is ${clock(info.duration)} long.` : '';
        return `Free accounts can upload audio up to ${formatLength(info.maxSeconds)} long.${length} ${pro}`;
    }
    const when = formatNextSlot(info.nextAt, opts);
    if (info.limit == null || info.limit <= 0 || !when) return info.message;
    const [one, many] = NOUN[info.kind];
    const next = info.kind === 'audio' ? 'audio upload' : `${one} upload`;
    return `Free accounts can upload ${info.limit} ${info.limit === 1 ? one : many} per 24 hours. `
        + `Your next ${next} is possible on ${when}. ${pro}`;
}

/** The Pro page for `owner`, for notices built from a quota (which has no upgrade_url). */
export function defaultUpgradeUrl(owner: string): string {
    return `https://3speak.tv/wallet/${encodeURIComponent(owner.trim().replace(/^@/, '').toLowerCase())}#pro`;
}

// ---------------------------------------------------------------------------
// Quota endpoints (read-only). Any error means "no limit known".
// ---------------------------------------------------------------------------

export interface KindQuota {
    /** null = unlimited (exempt, or limits disabled). */
    limit: number | null;
    used: number | null;
    remaining: number | null;
    /** When the next slot frees up; null when nothing is counted or no limit applies. */
    next_at: string | null;
}

export interface AudioKindQuota extends KindQuota {
    max_seconds: number | null;
}

export interface VideoQuota {
    enabled: boolean;
    exempt: boolean;
    reason: string | null;
    video: KindQuota;
    short: KindQuota;
}

export interface AudioQuota {
    enabled: boolean;
    exempt: boolean;
    reason: string | null;
    audio: AudioKindQuota;
}

interface QuotaRequest {
    apiKey: string;
    owner: string;
    baseUrl?: string;
    /** Give up after this long (default 5 s) and report "no limit known". */
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

async function getJson(url: string, headers: Record<string, string>, req: QuotaRequest): Promise<unknown | null> {
    const doFetch = req.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
    if (!doFetch || !req.apiKey || !req.owner) return null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), req.timeoutMs ?? 5000) : null;
    try {
        const res = await doFetch(url, { headers, signal: controller?.signal });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

const isKindQuota = (v: unknown): v is KindQuota =>
    !!v && typeof v === 'object' && 'remaining' in (v as object);

/** GET {embed}/uploads/quota?owner=. Null on any error or unexpected shape. */
export async function fetchVideoQuota(req: QuotaRequest): Promise<VideoQuota | null> {
    const base = req.baseUrl ?? EMBED_SERVICE_BASE;
    const owner = req.owner.trim().replace(/^@/, '');
    const data = await getJson(
        `${base}/uploads/quota?owner=${encodeURIComponent(owner)}`,
        { 'X-API-Key': req.apiKey },
        { ...req, owner },
    ) as VideoQuota | null;
    if (!data || typeof data.enabled !== 'boolean' || !isKindQuota(data.video) || !isKindQuota(data.short)) return null;
    return data;
}

/** GET {audio}/api/audio/quota with X-User. Null on any error or unexpected shape. */
export async function fetchAudioQuota(req: QuotaRequest): Promise<AudioQuota | null> {
    const base = req.baseUrl ?? AUDIO_SERVICE_BASE;
    const owner = req.owner.trim().replace(/^@/, '');
    const data = await getJson(
        `${base}/api/audio/quota`,
        { 'X-API-Key': req.apiKey, 'X-User': owner },
        { ...req, owner },
    ) as AudioQuota | null;
    if (!data || typeof data.enabled !== 'boolean' || !isKindQuota(data.audio)) return null;
    return data;
}

/** Does this quota say the limits apply to the owner at all? */
export function quotaApplies(quota: VideoQuota | AudioQuota | null): boolean {
    return !!quota && quota.enabled && !quota.exempt;
}

/**
 * A notice for an owner whose quota is used up, shaped like a server
 * refusal so the app renders both the same way. Null when uploads are open
 * or nothing is known.
 */
export function blockedByQuota(
    quota: VideoQuota | AudioQuota | null,
    kind: UploadLimitKind,
    owner: string,
): UploadLimitInfo | null {
    if (!quotaApplies(quota)) return null;
    const k: KindQuota | undefined = kind === 'audio'
        ? (quota as AudioQuota).audio
        : (quota as VideoQuota)[kind];
    if (!k || k.remaining !== 0 || k.limit == null) return null;
    // A slot has freed up since the quota was read: let the upload try.
    if (k.next_at && Date.parse(k.next_at) <= Date.now()) return null;
    const [one, many] = NOUN[kind];
    const code: UploadLimitCode = kind === 'audio' ? 'daily_audio_limit' : 'daily_upload_limit';
    return {
        code,
        kind,
        status: 429,
        message: `Free accounts can upload ${k.limit} ${k.limit === 1 ? one : many} per 24 hours. 3Speak Pro removes this limit.`,
        upgradeUrl: defaultUpgradeUrl(owner),
        limit: k.limit,
        used: num(k.used),
        nextAt: k.next_at,
        retryAfterSeconds: null,
        maxSeconds: null,
        duration: null,
    };
}

/** The longest audio a free owner may upload, or null when no cap applies or nothing is known. */
export function audioMaxSeconds(quota: AudioQuota | null): number | null {
    if (!quotaApplies(quota)) return null;
    return num(quota!.audio.max_seconds);
}

/** The server lets a file run this far past the cap (a 15:00.4 file is still "15 minutes"). */
export const AUDIO_DURATION_GRACE_SECONDS = 1;

/** A pre-upload notice for audio that is too long, shaped like the server's 413. */
export function audioTooLong(durationSec: number, maxSeconds: number | null, owner: string): UploadLimitInfo | null {
    if (maxSeconds == null || !(durationSec > maxSeconds + AUDIO_DURATION_GRACE_SECONDS)) return null;
    return {
        code: 'audio_too_long',
        kind: 'audio',
        status: 413,
        message: `Free accounts can upload audio up to ${formatLength(maxSeconds)} long. 3Speak Pro removes this limit.`,
        upgradeUrl: defaultUpgradeUrl(owner),
        limit: null,
        used: null,
        nextAt: null,
        retryAfterSeconds: null,
        maxSeconds,
        duration: durationSec,
    };
}
