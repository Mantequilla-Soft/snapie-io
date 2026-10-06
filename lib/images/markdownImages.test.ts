import { describe, expect, it } from 'vitest';
import { IMAGE_PROXY_PATH } from './feedImageSrc';
import {
    encodeMarkdownImageParentheses,
    extractMarkdownImages,
    rewriteHtmlImageSrcs,
} from './markdownImages';

const PAREN_URL = 'https://images.hive.blog/DQmerj5ka4MkkXwTr5atPeNe3eVVwXWA2LGogbTWDHz9h9y/Screenshot%20(88).jpg';

describe('extractMarkdownImages', () => {
    it('keeps a destination that contains parentheses', () => {
        const images = extractMarkdownImages(`![shot](${PAREN_URL})`);
        expect(images).toHaveLength(1);
        expect(images[0].url).toBe(PAREN_URL);
        expect(images[0].url.endsWith('.jpg')).toBe(true);
    });

    it('reads more than one image on a line', () => {
        const images = extractMarkdownImages('![a](https://files.peakd.com/a.jpg) ![b](https://i.ecency.com/b.jpg)');
        expect(images.map((img) => img.url)).toEqual([
            'https://files.peakd.com/a.jpg',
            'https://i.ecency.com/b.jpg',
        ]);
    });
});

describe('encodeMarkdownImageParentheses', () => {
    it('percent-encodes parentheses so a first-paren regex keeps the filename', () => {
        const encoded = encodeMarkdownImageParentheses(`note ![shot](${PAREN_URL}) tail`);
        const captured = /!\[.*?\]\((.*?)\)/.exec(encoded);
        expect(captured?.[1]).toBe(PAREN_URL.replace(/\(/g, '%28').replace(/\)/g, '%29'));
        expect(captured?.[1].endsWith('.jpg')).toBe(true);
        expect(encoded.startsWith('note ')).toBe(true);
        expect(encoded.endsWith(' tail')).toBe(true);
    });

    it('leaves a url without parentheses unchanged', () => {
        const line = '![a](https://files.peakd.com/a.jpg)';
        expect(encodeMarkdownImageParentheses(line)).toBe(line);
    });
});

describe('rewriteHtmlImageSrcs', () => {
    it('sends remote img srcs through the same-origin proxy', () => {
        const html = rewriteHtmlImageSrcs(
            '<p><img alt="x" src="https://files.peakd.com/file/a.jpg"></p>'
            + '<img src="https://i.ytimg.com/vi/abc/sddefault.jpg">'
            + '<img src="https://media0.giphy.com/media/abc/giphy.gif">',
        );
        expect(html).toContain(`${IMAGE_PROXY_PATH}?url=`);
        expect(html).toContain(encodeURIComponent('https://files.peakd.com/file/a.jpg'));
        expect(html).toContain(encodeURIComponent('https://i.ytimg.com/vi/abc/sddefault.jpg'));
        expect(html).toContain(encodeURIComponent('https://media0.giphy.com/media/abc/giphy.gif'));
        expect(html).not.toContain('src="https://files.peakd.com');
        expect(html).not.toContain('images.hive.blog/0x0/');
    });

    it('does not proxy a same-origin path or a private host', () => {
        const html = rewriteHtmlImageSrcs('<img src="/badges/excited.png"><img src="http://127.0.0.1/a.jpg">');
        expect(html).toContain('src="/badges/excited.png"');
        expect(html).toContain('src="http://127.0.0.1/a.jpg"');
        expect(html).not.toContain(IMAGE_PROXY_PATH);
    });

    it('does not wrap an already-proxied src a second time', () => {
        const once = rewriteHtmlImageSrcs('<img src="https://images.3speak.tv/a.webp">');
        expect(rewriteHtmlImageSrcs(once)).toBe(once);
    });
});
