import { describe, it, expect } from 'vitest';
import { isPrivateNetworkUrl, parseMediaContent, separateContent, snapTextForMarkdown } from './snapUtils';

describe('isPrivateNetworkUrl', () => {
    it('flags RFC1918 private ranges', () => {
        expect(isPrivateNetworkUrl('http://192.168.0.180/photo.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://10.0.0.5/photo.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://172.16.4.1/photo.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://172.31.255.254/photo.jpg')).toBe(true);
    });

    it('does not flag the 172.32.x.x range (outside RFC1918)', () => {
        expect(isPrivateNetworkUrl('http://172.32.0.1/photo.jpg')).toBe(false);
    });

    it('flags loopback and link-local addresses', () => {
        expect(isPrivateNetworkUrl('http://127.0.0.1/x.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://localhost/x.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://169.254.1.1/x.jpg')).toBe(true);
        expect(isPrivateNetworkUrl('http://[::1]/x.jpg')).toBe(true);
    });

    it('flags mDNS .local hostnames', () => {
        expect(isPrivateNetworkUrl('http://my-nas.local/photo.jpg')).toBe(true);
    });

    it('does not flag ordinary public URLs', () => {
        expect(isPrivateNetworkUrl('https://images.hive.blog/u/meno/avatar/sm')).toBe(false);
        expect(isPrivateNetworkUrl('https://files.peakd.com/file/peakd-hive/x.jpg')).toBe(false);
    });

    it('treats an unparseable URL as not private (leaves it to other validation)', () => {
        expect(isPrivateNetworkUrl('not a url')).toBe(false);
    });
});

describe('parseMediaContent private-network filtering', () => {
    it('drops a markdown image pointing at a private LAN address', () => {
        const items = parseMediaContent('![photo](http://192.168.0.180/wordpress/uploads/x.jpg)');
        expect(items).toHaveLength(0);
    });

    it('keeps a markdown image pointing at a public host', () => {
        const items = parseMediaContent('![photo](https://images.hive.blog/u/meno/avatar/sm)');
        expect(items).toHaveLength(1);
        expect(items[0].type).toBe('image');
    });

    it('keeps a filename that contains parentheses', () => {
        const url = 'https://images.hive.blog/DQmerj5ka4MkkXwTr5atPeNe3eVVwXWA2LGogbTWDHz9h9y/Screenshot%20(88).jpg';
        const items = parseMediaContent(`![shot](${url})`);
        expect(items).toHaveLength(1);
        expect(items[0].type).toBe('image');
        const captured = /!\[.*?\]\((.*?)\)/.exec(items[0].content);
        expect(captured?.[1].endsWith('.jpg')).toBe(true);
        expect(captured?.[1]).toContain('Screenshot%20%2888%29.jpg');
        const { media, text } = separateContent(`hello\n![shot](${url})`);
        expect(text).toBe('hello');
        expect(media).toContain('Screenshot%20%2888%29.jpg');
    });

    it('drops a raw iframe pointing at a private LAN address', () => {
        const items = parseMediaContent('<iframe src="http://192.168.1.1/admin"></iframe>');
        expect(items).toHaveLength(0);
    });
});

describe('snapTextForMarkdown', () => {
    it('keeps the words and drops a hive post url that renders as a card', () => {
        const text = snapTextForMarkdown(
            'See https://hive.blog/@alice/hello-world for context\n![pic](https://images.hive.blog/x.jpg)'
        );
        expect(text).toContain('See');
        expect(text).toContain('for context');
        expect(text).not.toContain('hive.blog/@alice');
        expect(text).not.toContain('![');
    });
});
