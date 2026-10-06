export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installDeferredScriptResponse } = await import('./lib/perf/installDeferredScriptResponse');
  installDeferredScriptResponse();
}
