import { S as StorageAdapter } from './client-Bztyx_3e.mjs';
export { c as Channel, C as ChatClient, b as ChatClientOptions, g as ChatPreferences, a as ChatService, d as Conversation, D as DmDeliveryInfo, f as DmStatusInfo, M as Message, e as MessagesResult, T as TypingStatusInfo } from './client-Bztyx_3e.mjs';

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

export { PollingManager, StorageAdapter, createDefaultStorage };
