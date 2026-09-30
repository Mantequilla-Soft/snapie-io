import { describe, it, expect } from 'vitest';
import { shouldShowChatAuthGate } from '@/lib/chat/authGate';

describe('shouldShowChatAuthGate', () => {
  it('keeps the composer when the same Hive user still has a chat session', () => {
    expect(shouldShowChatAuthGate('sablephalanx', true)).toBe(false);
  });

  it('asks Keychain to connect when the Hive user has no usable session', () => {
    expect(shouldShowChatAuthGate('sablephalanx', false)).toBe(true);
  });

  it('asks the user to log in when Hive is logged out, even if a token remains', () => {
    expect(shouldShowChatAuthGate(null, true)).toBe(true);
    expect(shouldShowChatAuthGate(undefined, false)).toBe(true);
    expect(shouldShowChatAuthGate('', true)).toBe(true);
  });
});
