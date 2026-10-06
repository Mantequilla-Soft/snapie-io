import { describe, expect, it } from 'vitest';
import markdownRenderer from './MarkdownRenderer';
import { IMAGE_PROXY_PATH } from '@/lib/images/feedImageSrc';

const PAREN_URL = 'https://images.hive.blog/DQmerj5ka4MkkXwTr5atPeNe3eVVwXWA2LGogbTWDHz9h9y/Screenshot%20(88).jpg';

describe('markdownRenderer image srcs', () => {
    it('routes markdown and html images through the proxy, including parentheses', () => {
        const html = markdownRenderer(
            `![peakd](https://files.peakd.com/file/a.jpg)\n\n<img src="https://i.ecency.com/x.jpg">\n\n![](${PAREN_URL})`,
        );
        expect(html).toContain(`${IMAGE_PROXY_PATH}?url=`);
        expect(html).toContain(encodeURIComponent('https://files.peakd.com/file/a.jpg'));
        expect(html).toContain(encodeURIComponent('https://i.ecency.com/x.jpg'));
        expect(html).toContain(encodeURIComponent(PAREN_URL));
        expect(html).not.toContain('src="https://files.peakd.com');
        expect(html).not.toContain('src="https://i.ecency.com');
        expect(html).not.toContain('images.hive.blog/0x0/');
        expect(html).not.toContain('Screenshot%20(88');
    });

    it('routes hivemoji images through the proxy', () => {
        const html = markdownRenderer(':wave:', { defaultEmojiOwner: 'alice' });
        expect(html).toContain('hivemoji');
        expect(html).toContain(`${IMAGE_PROXY_PATH}?url=`);
        expect(html).not.toContain('src="https://hivemoji.hivelytics.io');
    });
});
