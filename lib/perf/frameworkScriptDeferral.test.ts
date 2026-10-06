import { afterEach, describe, expect, it } from 'vitest';
import { frameworkScriptDeferralEnabled } from './installDeferredScriptResponse.js';

describe('framework script deferral flag', () => {
  const previous = process.env.SNAPIE_DEFER_FRAMEWORK_SCRIPTS;

  afterEach(() => {
    if (previous === undefined) delete process.env.SNAPIE_DEFER_FRAMEWORK_SCRIPTS;
    else process.env.SNAPIE_DEFER_FRAMEWORK_SCRIPTS = previous;
  });

  it('stays off unless SNAPIE_DEFER_FRAMEWORK_SCRIPTS is exactly 1', () => {
    delete process.env.SNAPIE_DEFER_FRAMEWORK_SCRIPTS;
    expect(frameworkScriptDeferralEnabled()).toBe(false);
    for (const value of ['', '0', 'false', 'true', 'yes', 'on']) {
      process.env.SNAPIE_DEFER_FRAMEWORK_SCRIPTS = value;
      expect(frameworkScriptDeferralEnabled(), value).toBe(false);
    }
    process.env.SNAPIE_DEFER_FRAMEWORK_SCRIPTS = '1';
    expect(frameworkScriptDeferralEnabled()).toBe(true);
  });
});
