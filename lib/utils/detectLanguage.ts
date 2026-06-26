import { franc } from 'franc-min';

// ISO 639-3 → ISO 639-1 for all languages franc-min can identify
const ISO3_TO_ISO1: Record<string, string> = {
    eng: 'en', spa: 'es', fra: 'fr', deu: 'de', por: 'pt',
    ita: 'it', rus: 'ru', nld: 'nl', pol: 'pl', tur: 'tr',
    ron: 'ro', hun: 'hu', ces: 'cs', swe: 'sv', dan: 'da',
    nob: 'no', fin: 'fi', jpn: 'ja', kor: 'ko', cmn: 'zh',
    ara: 'ar', hin: 'hi', ben: 'bn', vie: 'vi', tha: 'th',
    ind: 'id', msa: 'ms', tgl: 'tl', ukr: 'uk', cat: 'ca',
    hrv: 'hr', srp: 'sr', bul: 'bg', slk: 'sk', lit: 'lt',
    lav: 'lv', est: 'et', ell: 'el', heb: 'he', fas: 'fa',
};

// Strip markdown/URLs so franc sees only prose, not formatting noise
function stripMarkdown(text: string): string {
    return text
        .replace(/https?:\/\/\S+/g, '')       // URLs
        .replace(/!\[.*?\]\(.*?\)/g, '')       // image markdown
        .replace(/\[.*?\]\(.*?\)/g, '')        // links
        .replace(/[#*_`~>]/g, ' ')            // markdown symbols
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Detect the language of a piece of text.
 * Returns an ISO 639-1 code (e.g. 'en', 'es') or null if the text is
 * too short / ambiguous for a confident result.
 */
export function detectLang(text: string): string | null {
    const clean = stripMarkdown(text);
    if (clean.length < 20) return null;
    const code = franc(clean);
    if (code === 'und') return null;
    return ISO3_TO_ISO1[code] ?? null;
}
