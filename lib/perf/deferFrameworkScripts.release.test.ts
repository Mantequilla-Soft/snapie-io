import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { RELEASE_SCRIPT } from './deferFrameworkScripts.js';

const RELEASE_CODE = RELEASE_SCRIPT.replace(/^<script>/, '').replace(/<\/script>$/, '');

function page() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><script type="application/json" data-snapie-src="/_next/static/chunks/app.js"></script><img id="lcp" fetchpriority="high"></body></html>',
    { runScripts: 'dangerously' },
  );
  const { window } = dom;
  const img = window.document.getElementById('lcp') as HTMLImageElement;
  Object.defineProperty(window.document, 'readyState', { configurable: true, get: () => 'complete' });
  Object.defineProperty(img, 'complete', { configurable: true, get: () => false });
  window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0) as unknown as number;
  vm.runInContext(RELEASE_CODE, dom.getInternalVMContext());
  return { window, img };
}

function released(window: JSDOM['window']) {
  return window.document.querySelector('script[src="/_next/static/chunks/app.js"]');
}

describe('framework script release', () => {
  it('releases scripts when the priority image errors', async () => {
    const { window, img } = page();
    img.dispatchEvent(new window.Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(released(window)).toBeTruthy();
  });

  it('releases scripts from the 2500ms safety timer when the image never settles', async () => {
    const { window } = page();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(released(window)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 2300));
    expect(released(window)).toBeTruthy();
  });
});
