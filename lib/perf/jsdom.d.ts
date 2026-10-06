declare module 'jsdom' {
  interface JSDOMWindow extends Window {
    setTimeout: typeof setTimeout;
    Event: typeof Event;
  }
  export class JSDOM {
    window: JSDOMWindow;
    constructor(html?: string, options?: { runScripts?: 'dangerously' | 'outside-only' });
    getInternalVMContext(): import('node:vm').Context;
  }
}
