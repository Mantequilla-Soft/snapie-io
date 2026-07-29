import { S as StorageAdapter } from './client-C8OuYUK4.js';
export { c as Channel, C as ChatClient, b as ChatClientOptions, g as ChatPreferences, a as ChatService, d as Conversation, D as DmDeliveryInfo, f as DmStatusInfo, M as Message, e as MessagesResult, T as TypingStatusInfo, U as UnreadSnapshot } from './client-C8OuYUK4.js';

type Handler = () => void | Promise<void>;
/**
 * Manages a single setInterval that fans out to multiple subscribers.
 * Starting the first subscription starts the timer; removing the last stops it.
 */
declare class PollingManager {
    private timer;
    private handlers;
    private interval;
    constructor(intervalMs: number);
    subscribe(handler: Handler): () => void;
    private tick;
    destroy(): void;
}

/** Default adapter — uses localStorage when available, falls back to in-memory. */
declare function createDefaultStorage(): StorageAdapter;

declare function isImageUrl(url: string): boolean;
/**
 * Extract image URLs embedded in a message's content string.
 * Snapie sends images by embedding the URL as plain text in `message.content`.
 * Use this to detect and render inline images.
 *
 * @example
 * const images = extractImageUrls(message.content);
 * images.forEach(url => console.log(<img src={url} />));
 */
declare function extractImageUrls(content: string): string[];

export { PollingManager, StorageAdapter, createDefaultStorage, extractImageUrls, isImageUrl };
