export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Loaded from disk so the edge instrumentation bundle never parses Node
  // builtins. process.cwd() is the app root under `next start`.
  // SNAPIE_DEFER_FRAMEWORK_SCRIPTS=1 holds framework scripts. Unset is off.
  const load = eval('require') as NodeRequire;
  const { installDeferredScriptResponse } = load(
    process.cwd() + '/lib/perf/installDeferredScriptResponse.js',
  );
  installDeferredScriptResponse();
}
