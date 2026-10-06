// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { hasViewerSessionMarker, notifyViewerSession, VIEWER_SESSION_EVENT } from './viewerSession';

function clearCookies() {
  document.cookie.split(';').forEach((part) => {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  });
}

describe('hasViewerSessionMarker', () => {
  beforeEach(() => {
    clearCookies();
    localStorage.clear();
  });

  it('is false when nothing is stored', () => {
    expect(hasViewerSessionMarker()).toBe(false);
  });

  it('is true when the readable Snapie csrf cookie is set', () => {
    document.cookie = 'snapieauth_csrf=abc';
    expect(hasViewerSessionMarker()).toBe(true);
  });

  it('is true when a Hive username cookie is set', () => {
    document.cookie = 'hive_username=tester';
    expect(hasViewerSessionMarker()).toBe(true);
  });

  it('is true when hiveuser is in localStorage', () => {
    localStorage.setItem('hiveuser', '{"name":"tester"}');
    expect(hasViewerSessionMarker()).toBe(true);
  });

  it('ignores unrelated cookies', () => {
    document.cookie = 'other=snapieauth_csrf';
    expect(hasViewerSessionMarker()).toBe(false);
  });
});

describe('notifyViewerSession', () => {
  it('dispatches the session event', () => {
    let fired = 0;
    const onSession = () => { fired += 1; };
    window.addEventListener(VIEWER_SESSION_EVENT, onSession);
    notifyViewerSession();
    window.removeEventListener(VIEWER_SESSION_EVENT, onSession);
    expect(fired).toBe(1);
  });
});
