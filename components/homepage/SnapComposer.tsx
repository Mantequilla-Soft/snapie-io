import React, { useState, useRef } from 'react';
import { Box, Textarea, HStack, Button, Image, IconButton, Wrap, Spinner, Progress, Text, VStack } from '@chakra-ui/react';
import { useAioha } from '@aioha/react-ui';
import { KeyTypes } from '@aioha/aioha';
import GiphySelector from './GiphySelector';
import ImageUploader from './ImageUploader';
import VideoUploader from './VideoUploader';
import AudioRecorder from './AudioRecorder';
import { IGif } from '@giphy/js-types';
import { CloseIcon } from '@chakra-ui/icons';
import { FaImage, FaVideo, FaMicrophone } from 'react-icons/fa';
import { MdGif } from 'react-icons/md';
import { Comment } from '@hiveio/dhive';
import { getFileSignature, getLastSnapsContainer, uploadImage } from '@/lib/hive/client-functions';
import * as tus from 'tus-js-client';

interface SnapComposerProps {
    pa: string;
    pp: string;
    onNewComment: (newComment: Partial<Comment>) => void;
    post?: boolean;
    onClose: () => void;
}

export default function SnapComposer ({ pa, pp, onNewComment, post = false, onClose }: SnapComposerProps) {
    const { user, aioha } = useAioha();

    const postBodyRef = useRef<HTMLTextAreaElement>(null);
    const [images, setImages] = useState<File[]>([]);
    const [selectedGif, setSelectedGif] = useState<IGif | null>(null);
    const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
    const [videoUploadProgress, setVideoUploadProgress] = useState<number>(0);
    const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(null);
    const [thumbnailProcessing, setThumbnailProcessing] = useState<boolean>(false);
    const [audioEmbedUrl, setAudioEmbedUrl] = useState<string | null>(null);
    const [isAudioRecorderOpen, setAudioRecorderOpen] = useState(false);
    const [isGiphyModalOpen, setGiphyModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number[]>([]);

    const buttonText = post ? "Reply" : "Post";
    const hasMedia = images.length > 0 || selectedGif !== null;
    const hasVideo = selectedVideo !== null;
    const hasAudio = audioEmbedUrl !== null;
    const isDisabled = !user || isLoading;

    // Function to extract hashtags from text
    function extractHashtags(text: string): string[] {
        const hashtagRegex = /#(\w+)/g;
        const matches = text.match(hashtagRegex) || [];
        return matches.map(hashtag => hashtag.slice(1)); // Remove the '#' symbol
    }

    // Extract thumbnail from video file
    async function extractThumbnail(file: File): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');

            video.src = url;
            video.crossOrigin = 'anonymous';
            video.muted = true; // Safe autoplay on mobile

            video.addEventListener('loadeddata', () => {
                // Seek to 0.5 seconds for a good thumbnail frame
                video.currentTime = 0.5;
            });

            video.addEventListener('seeked', () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }
                
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create thumbnail blob'));
                        }
                        URL.revokeObjectURL(url);
                    },
                    'image/jpeg',
                    0.9
                );
            });

            video.addEventListener('error', (e) => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load video'));
            });

            // Load the video
            video.load();
        });
    }

    // Upload thumbnail directly to 3Speak IPFS supernode (bulletproof!)
    async function uploadThumbnailToIPFS(thumbnailBlob: Blob): Promise<string> {
        const formData = new FormData();
        formData.append('file', thumbnailBlob);
        
        const response = await fetch('http://65.21.201.94:5002/api/v0/add', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`IPFS upload failed: ${response.status} - ${response.statusText}`);
        }

        const responseText = await response.text();
        
        // IPFS returns NDJSON (newline-delimited JSON)
        const lines = responseText.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const result = JSON.parse(lastLine);
        
        const ipfsHash = result.Hash;
        const ipfsUrl = `https://ipfs.3speak.tv/ipfs/${ipfsHash}`;
        
        return ipfsUrl;
    }

    // Extract and upload thumbnail
    async function extractAndUploadThumbnail(file: File): Promise<string> {
        console.log('🎯 Starting thumbnail extraction for:', file.name);
        
        try {
            const thumbnailBlob = await extractThumbnail(file);
            console.log('📸 Thumbnail extracted, size:', thumbnailBlob.size, 'bytes');
            
            // Try Hive first, fallback to Imgur
            try {
                const thumbnailFile = new File([thumbnailBlob], `${file.name}_thumbnail.jpg`, { 
                    type: 'image/jpeg' 
                });
                
                console.log('📝 Trying Hive image upload...');
                const signature = await getFileSignature(thumbnailFile);
                const imageUrl = await uploadImage(thumbnailFile, signature);
                console.log('✅ Thumbnail uploaded to Hive:', imageUrl);
                return imageUrl;
            } catch (hiveError) {
                console.log('⚠️ Hive upload failed, trying 3Speak IPFS fallback...');
                const ipfsUrl = await uploadThumbnailToIPFS(thumbnailBlob);
                console.log('✅ Thumbnail uploaded to 3Speak IPFS:', ipfsUrl);
                return ipfsUrl;
            }
        } catch (error) {
            console.error('❌ Thumbnail processing failed:', error);
            throw error;
        }
    }

    // Extract video ID from embed URL (just the permlink part)
    function extractVideoId(embedUrl: string): string | null {
        try {
            const url = new URL(embedUrl);
            const videoParam = url.searchParams.get('v'); // Gets "meno/i2znmy5h"
            if (videoParam) {
                const parts = videoParam.split('/');
                return parts[1]; // Return just "i2znmy5h" (the permlink)
            }
            return null;
        } catch (error) {
            console.error('Failed to extract video ID:', error);
            return null;
        }
    }

    // Set thumbnail for 3Speak video
    async function setVideoThumbnail(videoId: string, thumbnailUrl: string): Promise<void> {
        const apiKey = process.env.NEXT_PUBLIC_3SPEAK_API_KEY || '';
        if (!apiKey) {
            throw new Error('3Speak API key not configured');
        }

        const response = await fetch(`https://embed.3speak.tv/video/${videoId}/thumbnail`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                thumbnail_url: thumbnailUrl
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to set thumbnail: ${response.status} - ${response.statusText}`);
        }
    }

    // Upload video to 3Speak using TUS protocol
    async function uploadVideoToThreeSpeak(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const apiKey = process.env.NEXT_PUBLIC_3SPEAK_API_KEY || '';
            if (!apiKey || apiKey === '') {
                reject(new Error('3Speak API key not configured'));
                return;
            }

            let embedUrl: string | null = null;

            const upload = new tus.Upload(file, {
                endpoint: 'https://embed.3speak.tv/uploads',
                retryDelays: [0, 3000, 5000, 10000, 20000],
                metadata: {
                    filename: file.name,
                    owner: user || '',
                    frontend_app: 'snapie',
                    short: 'true'
                },
                headers: {
                    'X-API-Key': apiKey
                },
                onError: (error) => {
                    console.error('Video upload failed:', error);
                    setSelectedVideo(null);
                    setVideoUploadProgress(0);
                    reject(error);
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = (bytesUploaded / bytesTotal) * 100;
                    setVideoUploadProgress(Math.round(percentage));
                },
                onAfterResponse: (req, res) => {
                    const url = res.getHeader('X-Embed-URL');
                    if (url) {
                        embedUrl = url;
                    }
                },
                onSuccess: () => {
                    if (embedUrl) {
                        resolve(embedUrl);
                    } else {
                        reject(new Error('Failed to get embed URL from server'));
                    }
                }
            });

            upload.start();
        });
    }

    // Handle video selection and start upload immediately
    async function handleVideoSelection(file: File) {
        setSelectedVideo(file);
        setVideoUploadProgress(1); // Show it's starting
        setThumbnailProcessing(true);
        
        console.log('🎬 Starting video upload and thumbnail processing for:', file.name);
        
        try {
            // Run video upload and thumbnail processing in parallel
            console.log('📤 Starting parallel operations...');
            const [videoResult, thumbnailResult] = await Promise.allSettled([
                uploadVideoToThreeSpeak(file),
                extractAndUploadThumbnail(file)
            ]);

            console.log('📋 Results:', { 
                video: videoResult.status, 
                thumbnail: thumbnailResult.status 
            });

            if (videoResult.status === 'fulfilled') {
                setVideoEmbedUrl(videoResult.value);
                console.log('✅ Video uploaded successfully:', videoResult.value);
                
                // If thumbnail also succeeded, set it via 3Speak API
                if (thumbnailResult.status === 'fulfilled') {
                    console.log('🖼️ Thumbnail uploaded successfully:', thumbnailResult.value);
                    try {
                        const videoId = extractVideoId(videoResult.value);
                        console.log('🆔 Extracted video ID:', videoId);
                        if (videoId) {
                            await setVideoThumbnail(videoId, thumbnailResult.value);
                            console.log('✅ Thumbnail set successfully via 3Speak API');
                        } else {
                            console.error('❌ Could not extract video ID from:', videoResult.value);
                        }
                    } catch (error) {
                        console.warn('⚠️ Failed to set thumbnail (video still works):', error);
                    }
                } else {
                    console.warn('⚠️ Thumbnail processing failed (video still works):', thumbnailResult.reason);
                }
            } else {
                throw videoResult.reason;
            }
        } catch (error) {
            console.error('❌ Video upload failed:', error);
            alert('Failed to upload video. Please try again.');
            setSelectedVideo(null);
            setVideoUploadProgress(0);
        } finally {
            setThumbnailProcessing(false);
        }
    }

    async function handleComment() {
        if (!user) {
            alert('You must be logged in to post.');
            return;
        }
        
        let commentBody = postBodyRef.current?.value || '';

        if (!commentBody.trim() && images.length === 0 && !selectedGif && !selectedVideo && !audioEmbedUrl) {
            alert('Please enter some text, upload an image, select a gif, upload a video, or record audio before posting.');
            return; // Do not proceed
        }

        setIsLoading(true);
        setUploadProgress([]);

        const permlink = new Date()
            .toISOString()
            .replace(/[^a-zA-Z0-9]/g, "")
            .toLowerCase();

        // Add video embed URL if available
        if (videoEmbedUrl) {
            // Just add the URL, parser will handle iframe formatting and mode parameter
            commentBody += `\n\n${videoEmbedUrl}`;
        }

        // Add audio embed URL if available
        if (audioEmbedUrl) {
            commentBody += `\n\n${audioEmbedUrl}`;
        }

        let validUrls: string[] = [];    
        if (images.length > 0) {
            const uploadedImages = await Promise.all(images.map(async (image, index) => {
                const signature = await getFileSignature(image);
                try {
                    const uploadUrl = await uploadImage(image, signature, index, setUploadProgress);
                    return uploadUrl;
                } catch (error) {
                    console.error('Error uploading image:', error);
                    return null;
                }
            }));

            validUrls = uploadedImages.filter((url): url is string => url !== null);

            if (validUrls.length > 0) {
                const imageMarkup = validUrls.map((url: string | null) => `![image](${url?.toString() || ''})`).join('\n');
                commentBody += `\n\n${imageMarkup}`;
            }
        }

        if (selectedGif) {
            commentBody += `\n\n![gif](${selectedGif.images.downsized_medium.url})`;
        }

        if (commentBody) {
            let snapsTags: string[] = [];
            try {
                // Add existing `snaps` tag logic
                if (pp === "snaps") { 
                    pp = (await getLastSnapsContainer()).permlink;
                    snapsTags = [process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || "", "snaps"];
                }

                // Extract hashtags from the comment body and add to `snapsTags`
                const hashtags = extractHashtags(commentBody);
                snapsTags = [...new Set([...snapsTags, ...hashtags])]; // Add hashtags without duplicates

                let commentResponse;

                // If video upload, use beneficiaries (10% to @snapie)
                if (videoEmbedUrl) {
                    const commentOp = [
                        'comment',
                        {
                            parent_author: pa,
                            parent_permlink: pp,
                            author: user,
                            permlink: permlink,
                            title: '',
                            body: commentBody,
                            json_metadata: JSON.stringify({ app: 'mycommunity', tags: snapsTags, images: validUrls })
                        }
                    ] as const;

                    const optionsOp = [
                        'comment_options',
                        {
                            author: user,
                            permlink: permlink,
                            max_accepted_payout: '1000000.000 HBD',
                            percent_hbd: 10000,
                            allow_votes: true,
                            allow_curation_rewards: true,
                            extensions: [
                                [
                                    0,
                                    {
                                        beneficiaries: [
                                            {
                                                account: 'snapie',
                                                weight: 1000 // 10%
                                            }
                                        ]
                                    }
                                ]
                            ]
                        }
                    ] as const;

                    commentResponse = await aioha.signAndBroadcastTx([commentOp, optionsOp], KeyTypes.Posting);
                } else {
                    // Regular post without beneficiaries
                    commentResponse = await aioha.comment(pa, pp, permlink, '', commentBody, { app: 'mycommunity', tags: snapsTags, images: validUrls });
                }
                
                if (commentResponse.success) {
                    postBodyRef.current!.value = '';
                    setImages([]);
                    setSelectedGif(null);
                    setSelectedVideo(null);
                    setVideoEmbedUrl(null);
                    setVideoUploadProgress(0);
                    setThumbnailProcessing(false);

                    const newComment: Partial<Comment> = {
                        author: user, 
                        permlink: permlink,
                        body: commentBody,
                    };

                    onNewComment(newComment); 
                    onClose();
                } else {
                    alert('Failed to post. Please try again.');
                }
            } catch (error) {
                alert('Error posting: ' + error);
            } finally {
                setIsLoading(false);
                setUploadProgress([]);
            }
        }
    }

    // Detect Ctrl+Enter and submit
    function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (event.ctrlKey && event.key === 'Enter') {
            handleComment();
        }
    }

    return (
        <Box bg="muted" p={4} mb={1} borderRadius="base" border="tb1">
            <Textarea
                placeholder={!user ? "Please log in to post..." : "What's happening?"}
                bg="background"
                border="tb1"
                borderRadius={'base'}
                mb={3}
                ref={postBodyRef}
                _placeholder={{ color: 'text' }}
                isDisabled={isDisabled}
                onKeyDown={handleKeyDown} // Attach the keydown handler
            />
            <HStack justify="space-between" mb={3}>
                <HStack>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} as="label" variant="ghost" isDisabled={isDisabled || hasVideo || hasAudio}>
                        <FaImage size={22} />
                        <ImageUploader images={images} onUpload={setImages} onRemove={(index) => setImages(prevImages => prevImages.filter((_, i) => i !== index))} />
                    </Button>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} variant="ghost" onClick={() => setGiphyModalOpen(!isGiphyModalOpen)} isDisabled={isDisabled || hasVideo || hasAudio}>
                        <MdGif size={48} />
                    </Button>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} as="label" variant="ghost" isDisabled={isDisabled || hasMedia || videoUploadProgress > 0 || hasAudio}>
                        <FaVideo size={22} />
                        <VideoUploader onUpload={handleVideoSelection} />
                    </Button>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} variant="ghost" onClick={() => setAudioRecorderOpen(true)} isDisabled={isDisabled || hasMedia || hasVideo || hasAudio}>
                        <FaMicrophone size={22} />
                    </Button>
                </HStack>
                <Button variant="solid" colorScheme="primary" onClick={handleComment} isDisabled={isDisabled || Boolean(selectedVideo && !videoEmbedUrl)}>
                    {isLoading ? <Spinner size="sm" /> : (!user ? "Log in to post" : buttonText)}
                </Button>
            </HStack>
            <Wrap spacing={4}>
                {images.map((image, index) => (
                    <Box key={index} position="relative">
                        <Image alt="" src={URL.createObjectURL(image)} boxSize="100px" borderRadius="base" />
                        <IconButton
                            aria-label="Remove image"
                            icon={<CloseIcon />}
                            size="xs"
                            position="absolute"
                            top="0"
                            right="0"
                            onClick={() => setImages(prevImages => prevImages.filter((_, i) => i !== index))}
                            isDisabled={isLoading}
                        />
                        <Progress value={uploadProgress[index]} size="xs" colorScheme="green" mt={2} />
                    </Box>
                ))}
                {selectedGif && (
                    <Box key={selectedGif.id} position="relative">
                        <Image alt="" src={selectedGif.images.downsized_medium.url} boxSize="100px" borderRadius="base" />
                        <IconButton
                            aria-label="Remove GIF"
                            icon={<CloseIcon />}
                            size="xs"
                            position="absolute"
                            top="0"
                            right="0"
                            onClick={() => setSelectedGif(null)}
                            isDisabled={isLoading}
                        />
                    </Box>
                )}
                {selectedVideo && (
                    <Box position="relative" bg="muted" p={3} borderRadius="base" border="1px solid" borderColor="gray.600" minW="250px">
                        <VStack align="start" spacing={2}>
                            <HStack justify="space-between" w="100%">
                                <Text fontSize="sm" fontWeight="bold" color="text">📹 {selectedVideo.name}</Text>
                                <IconButton
                                    aria-label="Remove video"
                                    icon={<CloseIcon />}
                                    size="xs"
                                    onClick={() => {
                                        setSelectedVideo(null);
                                        setVideoEmbedUrl(null);
                                        setVideoUploadProgress(0);
                                    }}
                                    isDisabled={isLoading}
                                />
                            </HStack>
                            <Text fontSize="xs" color="gray.400">
                                {(selectedVideo.size / (1024 * 1024)).toFixed(2)} MB
                            </Text>
                            {videoUploadProgress > 0 && (
                                <Box w="100%">
                                    <Progress value={videoUploadProgress} size="sm" colorScheme="blue" />
                                    <Text fontSize="xs" mt={1} color="text">{videoUploadProgress}% uploaded</Text>
                                    {thumbnailProcessing && (
                                        <Text fontSize="xs" color="blue.400">Generating thumbnail...</Text>
                                    )}
                                </Box>
                            )}
                        </VStack>
                    </Box>
                )}
                {audioEmbedUrl && (
                    <Box position="relative" bg="muted" p={3} borderRadius="base" border="1px solid" borderColor="gray.600" minW="250px">
                        <VStack align="start" spacing={2}>
                            <HStack justify="space-between" w="100%">
                                <Text fontSize="sm" fontWeight="bold" color="text">🎤 Audio Snap</Text>
                                <IconButton
                                    aria-label="Remove audio"
                                    icon={<CloseIcon />}
                                    size="xs"
                                    onClick={() => setAudioEmbedUrl(null)}
                                    isDisabled={isLoading}
                                />
                            </HStack>
                            <Text fontSize="xs" color="green.400">✓ Ready to post</Text>
                        </VStack>
                    </Box>
                )}
            </Wrap>
            {isGiphyModalOpen && (
                <GiphySelector
                    apiKey={process.env.GIPHY_API_KEY || 'qXGQXTPKyNJByTFZpW7Kb0tEFeB90faV'}
                    onSelect={(gif, e) => {
                        e.preventDefault();
                        setSelectedGif(gif);
                        setGiphyModalOpen(false);
                    }}
                />
            )}
            {user && (
                <AudioRecorder
                    isOpen={isAudioRecorderOpen}
                    onClose={() => setAudioRecorderOpen(false)}
                    onAudioRecorded={(playUrl) => setAudioEmbedUrl(playUrl)}
                    username={user}
                />
            )}
        </Box>
    );
}
