import { describe, it, expect } from 'vitest';
import { chatCloseDestination } from './closeChat';

describe('chatCloseDestination', () => {
  it('sends a phone /chat visit back to the previous in-app page', () => {
    expect(chatCloseDestination({
      isPhone: true,
      pathname: '/chat',
      previousPath: '/games',
    })).toBe('back');
  });

  it('sends a phone /chat visit home when nothing came before it', () => {
    expect(chatCloseDestination({
      isPhone: true,
      pathname: '/chat',
      previousPath: null,
    })).toBe('home');
    expect(chatCloseDestination({
      isPhone: true,
      pathname: '/chat',
      previousPath: '/chat',
    })).toBe('home');
  });

  it('only hides the panel for a drawer on another page or on desktop', () => {
    expect(chatCloseDestination({
      isPhone: true,
      pathname: '/games',
      previousPath: '/',
    })).toBe('stay');
    expect(chatCloseDestination({
      isPhone: false,
      pathname: '/chat',
      previousPath: '/games',
    })).toBe('stay');
  });
});
