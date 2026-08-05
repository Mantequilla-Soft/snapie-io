'use client';
import { Box, Input, Tag, TagLabel, TagCloseButton, Wrap, WrapItem } from '@chakra-ui/react';
import { useState, type KeyboardEvent } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';

/** Matches the lowercase, no-# form stored in json_metadata.tags (see
 *  lib/hive/mutedTags.ts) — so muting "#ScrobbleLife" actually matches a
 *  post tagged "scrobblelife". */
function normalizeTag(raw: string): string {
    return raw.trim().replace(/^#/, '').toLowerCase();
}

/** Chip input for the Settings page's "Muted tags" section — type a tag,
 *  press Enter/comma to add it, click × (or Backspace on an empty input) to
 *  remove one. Mirrors the interest-topic chip display already on this page,
 *  just for exclusion instead of inclusion. */
export default function MutedTagsInput() {
    const { settings, update } = useUserSettings();
    const [draft, setDraft] = useState('');

    const addTag = (raw: string) => {
        const tag = normalizeTag(raw);
        if (!tag || settings.mutedTags.includes(tag)) return;
        update({ mutedTags: [...settings.mutedTags, tag] });
    };

    const removeTag = (tag: string) => {
        update({ mutedTags: settings.mutedTags.filter(t => t !== tag) });
    };

    const commitDraft = () => {
        if (!draft.trim()) return;
        addTag(draft);
        setDraft('');
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commitDraft();
        } else if (e.key === 'Backspace' && draft === '' && settings.mutedTags.length > 0) {
            removeTag(settings.mutedTags[settings.mutedTags.length - 1]);
        }
    };

    return (
        <Box>
            {settings.mutedTags.length > 0 && (
                <Wrap spacing={2} mb={3}>
                    {settings.mutedTags.map(tag => (
                        <WrapItem key={tag}>
                            <Tag size="md" borderRadius="full" colorScheme="red" variant="subtle">
                                <TagLabel>#{tag}</TagLabel>
                                <TagCloseButton onClick={() => removeTag(tag)} aria-label={`Unmute #${tag}`} />
                            </Tag>
                        </WrapItem>
                    ))}
                </Wrap>
            )}

            <Input
                placeholder="Type a tag and press Enter…"
                size="sm"
                borderRadius="10px"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitDraft}
            />
        </Box>
    );
}
