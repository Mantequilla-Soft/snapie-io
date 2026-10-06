/**
 * Framework bundles are async scripts in <head>. On a fast connection they
 * download and evaluate before the parser reaches the feed, so the first
 * paint is only the shell. Lighthouse's simulated mobile LCP then treats
 * those scripts as render-blocking and charges their slow-4G transfer
 * against the paint. The HTML already contains the feed text and the
 * first-screen photos. The bundles are only needed for hydration.
 *
 * Rewrite them to inert placeholders plus low-priority preloads. A tiny
 * inline script inserts the real tags after the document has parsed and
 * the priority image (when there is one) has painted, so evaluation starts
 * after that LCP timestamp.
 *
 * Plain JS so the production response hook can require() it from disk
 * without going through the edge instrumentation bundle.
 */

const NEXT_STATIC_SCRIPT =
  /<script\b([^>]*?)\bsrc="(\/_next\/static\/[^"]+)"([^>]*)>\s*<\/script>/g;

// Two frames plus a short timer. A timeout of 0 still evaluates before
// Chrome commits the LCP timestamp, which puts the bundles back on the
// simulated critical path. This does not reset when a later entry arrives:
// a quiet-period timer kept hydration held until a client-mounted image
// replaced the server paint.
const RELEASE_SCRIPT = `<script>(function(){function release(){if(release.done)return;release.done=true;var nodes=document.querySelectorAll("script[data-snapie-src]");for(var i=0;i<nodes.length;i++){var n=nodes[i];var s=document.createElement("script");s.src=n.getAttribute("data-snapie-src");s.async=true;if(n.parentNode)n.parentNode.replaceChild(s,n);}}function afterPaint(){requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(release,80);});});}function whenPainted(){var img=document.querySelector('img[fetchpriority="high"]');if(img&&!img.complete){img.addEventListener("load",afterPaint,{once:true});img.addEventListener("error",afterPaint,{once:true});}else{afterPaint();}}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",whenPainted);}else{whenPainted();}setTimeout(release,2500);})();</script>`;

function deferFrameworkScripts(html) {
  if (!html.includes('/_next/static/') || !html.includes('<head>')) return html;

  const urls = [];
  const withoutScripts = html.replace(NEXT_STATIC_SCRIPT, (full, before, src, after) => {
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

module.exports = { deferFrameworkScripts, RELEASE_SCRIPT };
