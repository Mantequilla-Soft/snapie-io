import { describe, it, expect } from 'vitest';
import { snapieComposer, snapieVideoComposer } from './composerSdk';

// Regression test: appName silently regressed to a leftover placeholder
// ('mycommunity') for months, which meant every snap/video post broadcast
// under the wrong app identity — both for cross-frontend attribution (what
// PeakD/Ecency/hive.blog show as "posted via") and, more concretely, for
// Snapie Points: award verification requires json_metadata.app to start with
// "snapie" (see lib/points/hiveVerify.ts isSnapieApp), so every snap silently
// failed to earn points with no error anywhere. Locking the real appName
// down here so a future edit to composerSdk.ts can't regress it unnoticed.

function jsonMetadataOf(operations: unknown[]): Record<string, unknown> {
    const [, payload] = operations[0] as [string, { json_metadata: string }];
    return JSON.parse(payload.json_metadata);
}

describe('snapieComposer app attribution', () => {
    it('tags snaps with an app name Snapie Points verification will accept', () => {
        const result = snapieComposer.build({
            author: 'alice',
            body: 'hello hive',
            parentAuthor: 'peak.snaps',
            parentPermlink: 'snaps-container',
        });
        const metadata = jsonMetadataOf(result.operations);
        expect(String(metadata.app).toLowerCase().startsWith('snapie')).toBe(true);
    });

    it('tags video snaps with an app name Snapie Points verification will accept', () => {
        const result = snapieVideoComposer.build({
            author: 'alice',
            body: 'check out this video',
            parentAuthor: 'peak.snaps',
            parentPermlink: 'snaps-container',
        });
        const metadata = jsonMetadataOf(result.operations);
        expect(String(metadata.app).toLowerCase().startsWith('snapie')).toBe(true);
    });
});

// Regression test for the OpenAttribute markers (see
// internal-docs/open-attribute-snapie-setup.md and lib/utils/openAttribute.ts)
// — every caller passes these through `metadata`, and createComposer's build()
// core just spreads that object into the final json_metadata (see
// packages/operations/src/core.ts). This guards that plumbing specifically:
// a future change to how `metadata` gets merged could silently drop a caller-
// supplied key without any of the callers themselves changing at all.
describe('snapieComposer OpenAttribute markers', () => {
    it('includes a caller-supplied snapie.snap marker in the final json_metadata', () => {
        const result = snapieComposer.build({
            author: 'alice',
            body: 'a brand new snap',
            parentAuthor: 'peak.snaps',
            parentPermlink: 'snaps-container',
            metadata: { 'snapie.snap': {} },
        });
        const metadata = jsonMetadataOf(result.operations);
        expect(metadata['snapie.snap']).toEqual({});
        expect(metadata['snapie.reply']).toBeUndefined();
    });

    it('includes a caller-supplied snapie.reply marker in the final json_metadata', () => {
        const result = snapieComposer.build({
            author: 'alice',
            body: 'replying to something',
            parentAuthor: 'bob',
            parentPermlink: 'some-snap',
            metadata: { 'snapie.reply': {} },
        });
        const metadata = jsonMetadataOf(result.operations);
        expect(metadata['snapie.reply']).toEqual({});
        expect(metadata['snapie.snap']).toBeUndefined();
    });

    it('keeps the OpenAttribute marker alongside other metadata (e.g. decentmemes)', () => {
        const result = snapieComposer.build({
            author: 'alice',
            body: 'a meme snap',
            parentAuthor: 'peak.snaps',
            parentPermlink: 'snaps-container',
            metadata: {
                'snapie.snap': {},
                decentmemes: { v: 2, templateIds: ['abc'], frontend: 'snapie' },
            },
        });
        const metadata = jsonMetadataOf(result.operations);
        expect(metadata['snapie.snap']).toEqual({});
        expect(metadata.decentmemes).toEqual({ v: 2, templateIds: ['abc'], frontend: 'snapie' });
    });
});
