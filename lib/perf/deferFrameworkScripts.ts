/**
 * Framework bundles are async scripts in <head>. On a fast connection they
 * download and evaluate before first paint, so Lighthouse's simulated
 * mobile LCP treats them as render-blocking and charges their slow-4G
 * transfer against the paint. The HTML already contains the feed text (and
 * the first card's image, when it has one). These scripts are only needed
 * for hydration.
 *
 * Rewrite them to inert placeholders plus low-priority preloads. A tiny
 * inline script swaps the real tags in after the first paint, so evaluation
 * starts after LCP while the bytes still overlap the document download.
 */

const NEXT_STATIC_SCRIPT =
  /<script\b([^>]*?)\bsrc="(\/\_next\/static\/[^"]+)"([^>]*)>\s*<\/script>/g;

const RELEASE_SCRIPT = `<script>(function(){function release(){var nodes=document.querySelectorAll("script[data-snapie-src]");for(var i=0;i<nodes.length;i++){var n=nodes[i];var s=document.createElement("script");s.src=n.getAttribute("data-snapie-src");s.async=true;if(n.parentNode)n.parentNode.replaceChild(s,n);}}if(typeof requestAnimationFrame==="function"){requestAnimationFrame(function(){setTimeout(release,0);});}else{setTimeout(release,0);}})();</script>`;

export function deferFrameworkScripts(html: string): string {
  if (!html.includes('/_next/static/') || !html.includes('<head>')) return html;

  const urls: string[] = [];
  const withoutScripts = html.replace(NEXT_STATIC_SCRIPT, (full, before: string, src: string, after: string) => {
    if (/noModule/i.test(before) || /noModule/i.test(after)) return full;
    urls.push(src);
    return `<script type="application/json" data-snapie-src="${src}"></script>`;
  });
  if (urls.length === 0) return html;

  const preloads = urls
    .map((url) => `<link rel="preload" as="script" fetchpriority="low" href="${url}"/>`)
    .join('');

  let out = withoutScripts.replace(
    /<link\b[^>]*\brel="preload"[^>]*\bas="script"[^>]*>/g,
    (tag) => {
      const href = /href="([^"]+)"/.exec(tag);
      return href && urls.includes(href[1]) ? '' : tag;
    },
  );
  out = out.replace('<head>', `<head>${preloads}`);
  if (out.includes('</body>')) {
    out = out.replace('</body>', `${RELEASE_SCRIPT}</body>`);
  } else {
    out += RELEASE_SCRIPT;
  }
  return out;
}
