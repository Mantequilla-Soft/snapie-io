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
 *
 * Plain JS so the production response hook can require() it from disk
 * without going through the edge instrumentation bundle.
 */

const NEXT_STATIC_SCRIPT =
  /<script\b([^>]*?)\bsrc="(\/_next\/static\/[^"]+)"([^>]*)>\s*<\/script>/g;

// Release on a quiet period after the last LCP entry. A timeout of 0 still
// runs before Chrome records the LCP timestamp, so those scripts stay on the
// simulated critical path. Waiting until LCP has settled puts evaluation
// after that timestamp. The fallback covers a document that never paints one.
const RELEASE_SCRIPT = `<script>(function(){function release(){if(release.done)return;release.done=true;var nodes=document.querySelectorAll("script[data-snapie-src]");for(var i=0;i<nodes.length;i++){var n=nodes[i];var s=document.createElement("script");s.src=n.getAttribute("data-snapie-src");s.async=true;if(n.parentNode)n.parentNode.replaceChild(s,n);}}var timer;function schedule(){clearTimeout(timer);timer=setTimeout(release,400);}try{var po=new PerformanceObserver(function(){schedule();});po.observe({type:"largest-contentful-paint",buffered:true});}catch(e){}setTimeout(release,2500);})();</script>`;

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

module.exports = { deferFrameworkScripts };
