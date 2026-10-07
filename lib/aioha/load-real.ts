// Dynamic imports of the real packages. This module is the only app code that
// should reference them. next.config redirects every other app import of
// `@aioha/aioha` and `@aioha/react-ui` to the facades, and leaves imports whose
// issuer is this directory (and node_modules) on the real packages.
export function loadRealAioha() {
  return import('@aioha/aioha');
}

export function loadRealAiohaReactUi() {
  return import('@aioha/react-ui');
}
