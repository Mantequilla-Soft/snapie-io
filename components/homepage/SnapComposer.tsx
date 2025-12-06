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
import { getLastSnapsContainer, uploadImageWithUserSignature } from '@/lib/hive/client-functions';

// SDK imports
import { snapieComposer, snapieVideoComposer } from '@/lib/utils/composerSdk';
import { 
    uploadVideoTo3Speak, 
    extractVideoThumbnail, 
    uploadToIPFS, 
    set3SpeakThumbnail,
    extractVideoIdFromEmbedUrl
} from '@snapie/operations/video';

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

    // Handle video selection and start upload immediately using SDK
    async function handleVideoSelection(file: File) {
        setSelectedVideo(file);
        setVideoUploadProgress(1);
        setThumbnailProcessing(true);
        
        const apiKey = process.env.NEXT_PUBLIC_3SPEAK_API_KEY || '';
        if (!apiKey) {
            alert('3Speak API key not configured');
            setSelectedVideo(null);
            setVideoUploadProgress(0);
            setThumbnailProcessing(false);
            return;
        }

        console.log('🎬 Starting video upload for:', file.name);
        
        try {
            // Upload video and extract thumbnail in parallel using SDK
            const [videoResult, thumbnailBlob] = await Promise.allSettled([
                uploadVideoTo3Speak(file, {
                    apiKey,
                    owner: user || '',
                    appName: 'snapie',
                    onProgress: (progress) => setVideoUploadProgress(progress)
                }),
                extractVideoThumbnail(file).catch(() => null)
            ]);

            if (videoResult.status === 'fulfilled') {
                setVideoEmbedUrl(videoResult.value.embedUrl);
                console.log('✅ Video uploaded:', videoResult.value.embedUrl);
                
                // Try to upload and set thumbnail
                if (thumbnailBlob.status === 'fulfilled' && thumbnailBlob.value) {
                    try {
                        // Try Hive first (with user's signature), fallback to IPFS
                        let thumbnailUrl: string;
                        try {
                            const thumbnailFile = new File([thumbnailBlob.value], `${file.name}_thumb.jpg`, { type: 'image/jpeg' });
                            thumbnailUrl = await uploadImageWithUserSignature(thumbnailFile, aioha, user || '');
                        } catch {
                            thumbnailUrl = await uploadToIPFS(thumbnailBlob.value);
                        }
                        
                        // Set thumbnail via 3Speak API
                        if (videoResult.value.videoId) {
                            await set3SpeakThumbnail(videoResult.value.videoId, thumbnailUrl, apiKey);
                            console.log('✅ Thumbnail set:', thumbnailUrl);
                        }
                    } catch (error) {
                        console.warn('⚠️ Thumbnail failed (video still works):', error);
                    }
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
        
        let bodyText = postBodyRef.current?.value || '';

        if (!bodyText.trim() && images.length === 0 && !selectedGif && !selectedVideo && !audioEmbedUrl) {
            alert('Please enter some text, upload an image, select a gif, upload a video, or record audio before posting.');
            return;
        }

        setIsLoading(true);
        setUploadProgress([]);

        try {
            // Upload images first (using user's signature)
            let imageUrls: string[] = [];
            if (images.length > 0) {
                // Initialize progress tracking
                setUploadProgress(new Array(images.length).fill(0));
                
                const uploadedImages = await Promise.all(images.map(async (image, index) => {
                    try {
                        return await uploadImageWithUserSignature(image, aioha, user || '', {
                            index,
                            setUploadProgress
                        });
                    } catch (error) {
                        console.error('Error uploading image:', error);
                        return null;
                    }
                }));
                imageUrls = uploadedImages.filter((url: string | null): url is string => url !== null);
            }

            // Resolve parent permlink for snaps
            let parentPermlink = pp;
            if (pp === "snaps") { 
                parentPermlink = (await getLastSnapsContainer()).permlink;
            }

            // Use the appropriate composer (with or without beneficiaries)
            const composer = videoEmbedUrl ? snapieVideoComposer : snapieComposer;
            
            // Build operations using SDK
            const result = composer.build({
                author: user,
                body: bodyText,
                parentAuthor: pa,
                parentPermlink,
                images: imageUrls,
                gifUrl: selectedGif?.images.downsized_medium.url,
                videoEmbedUrl: videoEmbedUrl || undefined,
                audioEmbedUrl: audioEmbedUrl || undefined,
            });

            // Broadcast with Aioha
            const commentResponse = await aioha.signAndBroadcastTx(
                result.operations, 
                KeyTypes.Posting
            );
            
            if (commentResponse.success) {
                // Reset form
                postBodyRef.current!.value = '';
                setImages([]);
                setSelectedGif(null);
                setSelectedVideo(null);
                setVideoEmbedUrl(null);
                setVideoUploadProgress(0);
                setThumbnailProcessing(false);
                setAudioEmbedUrl(null);

                const newComment: Partial<Comment> = {
                    author: user, 
                    permlink: result.permlink,
                    body: result.body,
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
