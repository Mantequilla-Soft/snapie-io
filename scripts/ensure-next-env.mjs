// next-env.d.ts is gitignored (Next.js's own convention). It is what declares
// ambient module types for static asset imports (*.png, and so on).
// `next build` / `next lint` regenerate it as a side effect on startup, but
// plain `tsc` does not invoke Next at all, so on a fresh checkout the file
// is missing and every asset import fails typecheck.
//
// Bytes match the generation CI used to inline in .github/workflows/test.yml
// (the two reference lines Next needs; trailing newline included).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contents =
  '/// <reference types="next" />\n' +
  '/// <reference types="next/image-types/global" />\n';

writeFileSync(join(root, 'next-env.d.ts'), contents);
