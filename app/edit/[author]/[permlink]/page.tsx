'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Flex, Spinner, useToast } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useAioha } from '@aioha/react-ui';
import { getPost, commentWithKeychain } from '@/lib/hive/client-functions';
import { prepareImageArray } from '@/lib/utils/composeUtils';
import type { Beneficiary as BeneficiaryInputType } from '@/components/compose/BeneficiariesInput';

const Editor = dynamic(() => import('@/app/compose/Editor'), { ssr: false });

export default function EditPostPage() {
    const params = useParams<{ author: string; permlink: string }>();
    const author = decodeURIComponent(params.author);
    const permlink = decodeURIComponent(params.permlink);

    const { user } = useAioha();
    const router = useRouter();
    const toast = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [markdown, setMarkdown] = useState('');
    const [title, setTitle] = useState('');
    const [hashtags, setHashtags] = useState<string[]>([]);
    const [hashtagInput, setHashtagInput] = useState('');
    const [beneficiaries, setBeneficiaries] = useState<BeneficiaryInputType[]>([
        { account: 'snapie', weight: 300 },
    ]);

    // Raw metadata fields we'll preserve on save
    const [parentAuthor, setParentAuthor] = useState('');
    const [parentPermlink, setParentPermlink] = useState('');
    const [existingMetadata, setExistingMetadata] = useState<Record<string, unknown>>({});

    useEffect(() => {
        async function load() {
            try {
                const post = await getPost(author, permlink);
                if (!post) throw new Error('Post not found');

                // Guard: only the author can edit
                const username = typeof user === 'string' ? user : (user as any)?.username || '';
                if (username && username !== post.author) {
                    toast({ title: 'Unauthorized', description: 'You can only edit your own posts.', status: 'error', duration: 4000 });
                    router.replace(`/@${post.author}/${permlink}`);
                    return;
                }

                setTitle(post.title);
                setMarkdown(post.body);
                setParentAuthor(post.parent_author);
                setParentPermlink(post.parent_permlink);

                try {
                    const meta = JSON.parse(post.json_metadata || '{}');
                    setExistingMetadata(meta);
                    if (Array.isArray(meta.tags) && meta.tags.length > 0) {
                        setHashtags(meta.tags);
                    }
                } catch { /* ignore parse errors */ }
            } catch {
                toast({ title: 'Failed to load post', status: 'error', duration: 4000 });
            } finally {
                setIsLoading(false);
            }
        }
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [author, permlink]);

    async function handleSubmit() {
        const username = typeof user === 'string' ? user : (user as any)?.username || '';
        if (!username) {
            toast({ title: 'Not logged in', status: 'error', duration: 3000 });
            return;
        }

        setIsSubmitting(true);
        try {
            const imageArray = prepareImageArray(markdown, null);
            const updatedMetadata = {
                ...existingMetadata,
                tags: hashtags,
                image: imageArray,
                app: 'snapie.io',
            };

            const response = await commentWithKeychain({
                data: {
                    username,
                    parent_username: parentAuthor,
                    parent_perm: parentPermlink,
                    permlink,
                    title,
                    body: markdown,
                    json_metadata: JSON.stringify(updatedMetadata),
                    comment_options: '',
                },
            });

            if (response?.success) {
                toast({ title: 'Post updated!', status: 'success', duration: 3000 });
                setTimeout(() => router.push(`/@${username}/${permlink}`), 1500);
            } else {
                throw new Error((response as any)?.error || 'Update failed');
            }
        } catch (error: any) {
            toast({ title: 'Update failed', description: error?.message || String(error), status: 'error', duration: 6000 });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
                <Spinner size="xl" color="primary" />
            </Box>
        );
    }

    return (
        <Flex
            width="100%"
            height={{ base: 'calc(100vh - 80px)', md: '100vh' }}
            bg="background"
            justify="center"
            p="1"
            direction="column"
            overflow="hidden"
        >
            <Flex
                flex="1"
                border="1px solid"
                borderColor="border"
                borderRadius="base"
                justify="center"
                p="1"
                overflow="hidden"
            >
                <Editor
                    markdown={markdown}
                    setMarkdown={setMarkdown}
                    title={title}
                    setTitle={setTitle}
                    hashtagInput={hashtagInput}
                    setHashtagInput={setHashtagInput}
                    hashtags={hashtags}
                    setHashtags={setHashtags}
                    beneficiaries={beneficiaries}
                    setBeneficiaries={setBeneficiaries}
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
                />
            </Flex>
        </Flex>
    );
}
