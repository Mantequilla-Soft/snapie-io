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
