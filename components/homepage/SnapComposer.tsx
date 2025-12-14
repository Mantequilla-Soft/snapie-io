import React, { useState, useRef } from 'react';
import { Box, Textarea, HStack, Button, Image, IconButton, Wrap, Spinner, Progress, Text, VStack } from '@chakra-ui/react';
import { useKeychain } from '@/contexts/KeychainContext';
import GiphySelector from './GiphySelector';
import ImageUploader from './ImageUploader';
import VideoUploader from './VideoUploader';
import AudioRecorder from './AudioRecorder';
import { IGif } from '@giphy/js-types';
import { CloseIcon } from '@chakra-ui/icons';
import { FaImage, FaVideo, FaMicrophone } from 'react-icons/fa';
import { MdGif } from 'react-icons/md';
import { Comment } from '@hiveio/dhive';
import { getLastSnapsContainer, uploadImageWithKeychain, signAndBroadcastWithKeychain } from '@/lib/hive/client-functions';

// SDK imports
import { snapieComposer, snapieVideoComposer } from '@/lib/utils/composerSdk';
import { 
    uploadVideoTo3Speak, 
    extractVideoThumbnail, 
    uploadToIPFS, 
    set3SpeakThumbnail,
    extractVideoIdFromEmbedUrl
} from '@snapie/operations/video';

// Type for tracking image upload state
interface UploadingImage {
    file: File;
    previewUrl: string;
    uploadedUrl: string | null;
    progress: number;
    error?: string;
}

interface SnapComposerProps {
    pa: string;
    pp: string;
    onNewComment: (newComment: Partial<Comment>) => void;
    post?: boolean;
    onClose: () => void;
}

export default function SnapComposer ({ pa, pp, onNewComment, post = false, onClose }: SnapComposerProps) {
    const { user } = useKeychain();

    const postBodyRef = useRef<HTMLTextAreaElement>(null);
    const [uploadingImages, setUploadingImages] = useState<UploadingImage[]>([]);
    const [selectedGif, setSelectedGif] = useState<IGif | null>(null);
    const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
    const [videoUploadProgress, setVideoUploadProgress] = useState<number>(0);
    const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(null);
    const [thumbnailProcessing, setThumbnailProcessing] = useState<boolean>(false);
    const [audioEmbedUrl, setAudioEmbedUrl] = useState<string | null>(null);
    const [isAudioRecorderOpen, setAudioRecorderOpen] = useState(false);
    const [isGiphyModalOpen, setGiphyModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const buttonText = post ? "Reply" : "Post";
    const hasMedia = uploadingImages.length > 0 || selectedGif !== null;
    const hasVideo = selectedVideo !== null;
    const hasAudio = audioEmbedUrl !== null;
    
    // Check if any images are still uploading
    const imagesStillUploading = uploadingImages.some(img => img.uploadedUrl === null && !img.error);
    const isDisabled = !user || isLoading || imagesStillUploading;

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
                if (thumbnailBlob.status === 'fulfilled' && thumbnailBlob.value && user) {
                    try {
                        // Try Hive first (with user's signature via Aioha), fallback to IPFS
                        let thumbnailUrl: string;
                        try {
                            const thumbnailFile = new File([thumbnailBlob.value], `${file.name}_thumb.jpg`, { type: 'image/jpeg' });
                            thumbnailUrl = await uploadImageWithKeychain(thumbnailFile, user);
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
            alert('Failed to upload video. Please try again.');;
            setSelectedVideo(null);
            setVideoUploadProgress(0);
        } finally {
            setThumbnailProcessing(false);
        }
    }

    // Handle image selection - upload immediately
    async function handleImageSelection(files: File[]) {
        if (!user) {
            alert('You must be logged in to upload images.');
            return;
        }

        // Create initial state for each file
        const newImages: UploadingImage[] = files.map(file => ({
            file,
            previewUrl: URL.createObjectURL(file),
            uploadedUrl: null,
            progress: 0,
        }));

        // Add to state immediately (show previews)
        setUploadingImages(prev => [...prev, ...newImages]);

        // Start uploads for each file
        const startIndex = uploadingImages.length;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageIndex = startIndex + i;
            
            try {
                console.log(`📷 Starting upload for image ${i + 1}:`, file.name);
                
                const url = await uploadImageWithKeychain(file, user, {
                    onProgress: (progress) => {
                        setUploadingImages(prev => prev.map((img, idx) => 
                            idx === imageIndex ? { ...img, progress } : img
                        ));
                    }
                });
                
                console.log(`✅ Image ${i + 1} uploaded:`, url);
                
                // Update with uploaded URL
                setUploadingImages(prev => prev.map((img, idx) => 
                    idx === imageIndex ? { ...img, uploadedUrl: url, progress: 100 } : img
                ));
            } catch (error) {
                console.error(`❌ Error uploading image ${i + 1}:`, error);
                
                // Mark as failed
                setUploadingImages(prev => prev.map((img, idx) => 
                    idx === imageIndex ? { ...img, error: error instanceof Error ? error.message : 'Upload failed', progress: 0 } : img
                ));
            }
        }
    }

    // Remove an image (cleanup preview URL)
    function removeImage(index: number) {
        setUploadingImages(prev => {
            const img = prev[index];
            if (img?.previewUrl) {
                URL.revokeObjectURL(img.previewUrl);
            }
            return prev.filter((_, i) => i !== index);
        });
    }

    async function handleComment() {
        if (!user) {
            alert('You must be logged in to post.');
            return;
        }
        
        let bodyText = postBodyRef.current?.value || '';

        if (!bodyText.trim() && uploadingImages.length === 0 && !selectedGif && !selectedVideo && !audioEmbedUrl) {
            alert('Please enter some text, upload an image, select a gif, upload a video, or record audio before posting.');
            return;
        }

        setIsLoading(true);

        try {
            // Images are already uploaded - just collect the URLs
            const imageUrls = uploadingImages
                .filter(img => img.uploadedUrl !== null)
                .map(img => img.uploadedUrl as string);

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

            // Broadcast with Keychain
            const commentResponse = await signAndBroadcastWithKeychain(
                user,
                result.operations,
                'posting'
            );
            
            if (commentResponse.success) {
                // Cleanup preview URLs
                uploadingImages.forEach(img => {
                    if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
                });
                
                // Reset form
                postBodyRef.current!.value = '';
                setUploadingImages([]);
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
                isDisabled={!user || isLoading}
                onKeyDown={handleKeyDown} // Attach the keydown handler
            />
            <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
                <HStack flexShrink={1} minW={0}>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} as="label" variant="ghost" isDisabled={!user || isLoading || hasVideo || hasAudio} size={{ base: 'sm', md: 'md' }}>
                        <FaImage size={22} />
                        <ImageUploader onUpload={handleImageSelection} />
                    </Button>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} variant="ghost" onClick={() => setGiphyModalOpen(!isGiphyModalOpen)} isDisabled={!user || isLoading || hasVideo || hasAudio} size={{ base: 'sm', md: 'md' }}>
                        <MdGif size={48} />
                    </Button>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} as="label" variant="ghost" isDisabled={!user || isLoading || hasMedia || videoUploadProgress > 0 || hasAudio} size={{ base: 'sm', md: 'md' }}>
                        <FaVideo size={22} />
                        <VideoUploader onUpload={handleVideoSelection} />
                    </Button>
                    <Button _hover={{ border: 'tb1' }} _active={{ border: 'tb1' }} variant="ghost" onClick={() => setAudioRecorderOpen(true)} isDisabled={!user || isLoading || hasMedia || hasVideo || hasAudio} size={{ base: 'sm', md: 'md' }}>
                        <FaMicrophone size={22} />
                    </Button>
                </HStack>
                <Button variant="solid" colorScheme="primary" onClick={handleComment} isDisabled={isDisabled || Boolean(selectedVideo && !videoEmbedUrl)} flexShrink={0} size={{ base: 'sm', md: 'md' }}>
                    {isLoading ? <Spinner size="sm" /> : imagesStillUploading ? "Uploading..." : (!user ? "Log in to post" : buttonText)}
                </Button>
            </HStack>
            <Wrap spacing={4}>
                {uploadingImages.map((image, index) => (
                    <Box key={index} position="relative" minW="100px">
                        <Image alt="" src={image.previewUrl} boxSize="100px" borderRadius="base" objectFit="cover" />
                        <IconButton
                            aria-label="Remove image"
                            icon={<CloseIcon />}
                            size="xs"
                            position="absolute"
                            top="0"
                            right="0"
                            onClick={() => removeImage(index)}
                            isDisabled={isLoading}
                        />
                        {image.error ? (
                            <Text fontSize="xs" color="red.400" mt={1}>❌ {image.error}</Text>
                        ) : image.uploadedUrl ? (
                            <Text fontSize="xs" color="green.400" mt={1}>✓ Ready</Text>
                        ) : (
                            <Progress value={image.progress} size="xs" colorScheme="blue" mt={2} />
                        )}
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
