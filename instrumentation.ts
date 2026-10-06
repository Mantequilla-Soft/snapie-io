export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Loaded from disk so the edge instrumentation bundle never parses Node
  // builtins. process.cwd() is the app root under `next start`.
  // SNAPIE_DEFER_FRAMEWORK_SCRIPTS=1 holds framework scripts on every
  // document. Unset still holds them when the HTML already has a priority image.
  const load = eval('require') as NodeRequire;
  const { installDeferredScriptResponse } = load(
    process.cwd() + '/lib/perf/installDeferredScriptResponse.js',
  );
  installDeferredScriptResponse();
}
