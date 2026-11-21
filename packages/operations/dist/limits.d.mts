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
declare const EMBED_SERVICE_BASE = "https://embed.3speak.tv";
declare const AUDIO_SERVICE_BASE = "https://audio.3speak.tv";
type UploadLimitKind = 'video' | 'short' | 'audio';
type UploadLimitCode = 'daily_upload_limit' | 'daily_audio_limit' | 'audio_too_long';
/**
 * A refused upload, parsed from the server's 429/413 body. Refusals are told
 * apart by `code`, not by status: audio.3speak.tv also sends a plain
 * per-minute 429 with no `code`, which is not a limit refusal.
 */
interface UploadLimitInfo {
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
declare class UploadLimitError extends Error {
    readonly isUploadLimitError: true;
    readonly info: UploadLimitInfo;
    constructor(info: UploadLimitInfo);
}
/**
 * Duck-typed so it holds across bundles: the video, audio and limits entry
 * points each carry their own copy of the class.
 */
declare function isUploadLimitError(error: unknown): error is UploadLimitError;
/**
 * Parse a refusal body. Returns null for anything that is not one of the
 * limit codes (a plain rate limit, a server error, a missing body), so the
 * caller keeps its normal error handling for those.
 */
declare function parseUploadLimit(status: number, body: unknown, retryAfterHeader?: string | null): UploadLimitInfo | null;
/** Read a fetch Response; null when it is not a limit refusal. Does not consume `response`. */
declare function readUploadLimit(response: Response): Promise<UploadLimitInfo | null>;
/**
 * Map a tus-js-client error (DetailedError) to a limit refusal. The TUS
 * create request is refused with the same 429 body as the token route.
 */
declare function uploadLimitFromTusError(error: unknown): UploadLimitInfo | null;
interface FormatOptions {
    /** BCP 47 locale for the date; the browser default when omitted. */
    locale?: string;
    /** IANA time zone; the viewer's own when omitted. */
    timeZone?: string;
}
/** "Fri, Nov 21, 2:32 PM" in the viewer's time zone, or null for a bad date. */
declare function formatNextSlot(nextAt: string | null, opts?: FormatOptions): string | null;
/** "15 minutes", "1 minute 30 seconds", "45 seconds" (same wording as the server). */
declare function formatLength(seconds: number): string;
/**
 * The text to show for a refusal. Built from code, limit and next_at so the
 * time is in the viewer's own zone; falls back to the server's `message`
 * when a field is missing.
 */
declare function formatUploadLimitMessage(info: UploadLimitInfo, opts?: FormatOptions): string;
/** The Pro page for `owner`, for notices built from a quota (which has no upgrade_url). */
declare function defaultUpgradeUrl(owner: string): string;
interface KindQuota {
    /** null = unlimited (exempt, or limits disabled). */
    limit: number | null;
    used: number | null;
    remaining: number | null;
    /** When the next slot frees up; null when nothing is counted or no limit applies. */
    next_at: string | null;
}
interface AudioKindQuota extends KindQuota {
    max_seconds: number | null;
}
interface VideoQuota {
    enabled: boolean;
    exempt: boolean;
    reason: string | null;
    video: KindQuota;
    short: KindQuota;
}
interface AudioQuota {
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
/** GET {embed}/uploads/quota?owner=. Null on any error or unexpected shape. */
declare function fetchVideoQuota(req: QuotaRequest): Promise<VideoQuota | null>;
/** GET {audio}/api/audio/quota with X-User. Null on any error or unexpected shape. */
declare function fetchAudioQuota(req: QuotaRequest): Promise<AudioQuota | null>;
/** Does this quota say the limits apply to the owner at all? */
declare function quotaApplies(quota: VideoQuota | AudioQuota | null): boolean;
/**
 * A notice for an owner whose quota is used up, shaped like a server
 * refusal so the app renders both the same way. Null when uploads are open
 * or nothing is known.
 */
declare function blockedByQuota(quota: VideoQuota | AudioQuota | null, kind: UploadLimitKind, owner: string): UploadLimitInfo | null;
/** The longest audio a free owner may upload, or null when no cap applies or nothing is known. */
declare function audioMaxSeconds(quota: AudioQuota | null): number | null;
/** The server lets a file run this far past the cap (a 15:00.4 file is still "15 minutes"). */
declare const AUDIO_DURATION_GRACE_SECONDS = 1;
/** A pre-upload notice for audio that is too long, shaped like the server's 413. */
declare function audioTooLong(durationSec: number, maxSeconds: number | null, owner: string): UploadLimitInfo | null;

export { AUDIO_DURATION_GRACE_SECONDS, AUDIO_SERVICE_BASE, type AudioKindQuota, type AudioQuota, EMBED_SERVICE_BASE, type FormatOptions, type KindQuota, type UploadLimitCode, UploadLimitError, type UploadLimitInfo, type UploadLimitKind, type VideoQuota, audioMaxSeconds, audioTooLong, blockedByQuota, defaultUpgradeUrl, fetchAudioQuota, fetchVideoQuota, formatLength, formatNextSlot, formatUploadLimitMessage, isUploadLimitError, parseUploadLimit, quotaApplies, readUploadLimit, uploadLimitFromTusError };
