import { notFound } from 'next/navigation';
import TestSanitizeDemo from './TestSanitizeDemo';

// Dev-only sanitizer check page. Staging/production builds use NODE_ENV
// production, so this must 404 rather than stay a public indexable 200.
export default function TestSanitizePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <TestSanitizeDemo />;
}
