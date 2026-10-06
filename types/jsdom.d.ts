declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { runScripts?: string });
    readonly window: Window & typeof globalThis;
    getInternalVMContext(): import('node:vm').Context;
  }
}
