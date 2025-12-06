'use client';
import { uploadImageWithUserSignature } from '@/lib/hive/client-functions';
import { FC, useRef, useState, useCallback, useEffect } from "react";
import { Box, Flex, Button, useToast, Textarea, IconButton, HStack, Menu, MenuButton, MenuList, MenuItem, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, Input, Tag, TagLabel, TagCloseButton, Wrap, WrapItem, useBreakpointValue, Text } from '@chakra-ui/react';
import { FaImage, FaEye, FaCode, FaBold, FaItalic, FaLink, FaListUl, FaListOl, FaQuoteLeft, FaUnderline, FaStrikethrough, FaHeading, FaChevronDown, FaTable, FaEyeSlash, FaSmile, FaCloudUploadAlt } from 'react-icons/fa';
import { MdGif } from 'react-icons/md';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { processSpoilers } from '@/lib/utils/SpoilerRenderer';
import GiphySelector from '@/components/homepage/GiphySelector';
import { IGif } from '@giphy/js-types';
import { useDropzone } from 'react-dropzone';
import { compressImage } from '@/lib/utils/composeUtils';
import BeneficiariesInput, { Beneficiary } from '@/components/compose/BeneficiariesInput';
import { useAioha } from '@aioha/react-ui';

// SDK import for markdown editing utilities
import { useEditorToolbar, ALL_COMMON_EMOJIS } from '@snapie/composer/react';

// Preview Content Component with Spoiler Support
const PreviewContent: FC<{ markdown: string }> = ({ markdown }) => {
    const [spoilerStates, setSpoilerStates] = useState<{[key: string]: boolean}>({});

    const toggleSpoiler = (id: string) => {
        setSpoilerStates(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    // Process spoilers before rendering
    const processMarkdown = (text: string) => {
        // Handle spoilers first
        let processed = text.replace(
            />!\s*\[([^\]]+)\]\s*([\s\S]*?)(?=\n(?!>)|\n\n|$)/gm,
            (match, title, content) => {
                const spoilerId = `spoiler-${Math.random().toString(36).substr(2, 9)}`;
                return `<div class="spoiler-container" data-title="${title}" data-content="${content.trim()}" data-id="${spoilerId}"></div>`;
            }
        );

        return processed;
    };

    const processedMarkdown = processMarkdown(markdown);
    const renderedHtml = markdownRenderer(processedMarkdown);

    // Handle spoiler rendering after component mounts/updates
    useEffect(() => {
        const spoilerContainers = document.querySelectorAll('.spoiler-container');
        spoilerContainers.forEach((container) => {
            const element = container as HTMLElement;
            const title = element.getAttribute('data-title') || '';
            const content = element.getAttribute('data-content') || '';
            const id = element.getAttribute('data-id') || '';
            const isRevealed = spoilerStates[id];

            // Create spoiler component
            const spoilerHtml = `
                <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 8px 0; background-color: #f8fafc;">
                    <button 
                        onclick="this.parentElement.nextElementSibling?.style.display === 'none' ? (this.parentElement.nextElementSibling.style.display = 'block', this.textContent = 'Hide Spoiler: ${title}') : (this.parentElement.nextElementSibling.style.display = 'none', this.textContent = 'Show Spoiler: ${title}')"
                        style="background: #fff; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 14px;"
                    >
                        ${isRevealed ? 'Hide' : 'Show'} Spoiler: ${title}
                    </button>
                </div>
                <div style="display: ${isRevealed ? 'block' : 'none'}; margin-top: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
                    ${markdownRenderer(content)}
                </div>
            `;

            element.innerHTML = spoilerHtml;
        });
    }, [markdown, spoilerStates]);

    return (
        <Box 
            dangerouslySetInnerHTML={{ 
                __html: renderedHtml
            }}
            sx={{
                // Base text styling
                color: 'inherit',
                fontSize: '16px',
                lineHeight: '1.6',
                '& > *': {
                    marginBottom: '16px'
                },
                // Headings
                'h1': {
                    fontSize: '2em',
                    fontWeight: 'bold',
                    marginBottom: '0.5em',
                    marginTop: '0.5em'
                },
                'h2': {
                    fontSize: '1.5em',
                    fontWeight: 'bold',
                    marginBottom: '0.5em',
                    marginTop: '0.5em'
                },
                'h3': {
                    fontSize: '1.25em',
                    fontWeight: 'bold',
                    marginBottom: '0.5em',
                    marginTop: '0.5em'
                },
                // Paragraphs
                'p': {
                    marginBottom: '1em',
                    lineHeight: '1.6'
                },
                // Bold and italic
                'strong, b': {
                    fontWeight: 'bold'
                },
                'em, i': {
                    fontStyle: 'italic'
                },
                // Underline
                'u': {
                    textDecoration: 'underline'
                },
                // Links
                'a': {
                    color: '#3182ce',
                    textDecoration: 'underline',
                    '&:hover': {
                        color: '#2c5aa0'
                    }
                },
                // Code blocks
                'pre': {
                    backgroundColor: '#f6f8fa',
                    border: '1px solid #e1e4e8',
                    borderRadius: '6px',
                    padding: '16px',
                    overflow: 'auto',
                    fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '14px',
                    lineHeight: '1.45'
                },
                'code': {
                    backgroundColor: '#f6f8fa',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '85%'
                },
                // Lists
                'ul': {
                    paddingLeft: '2em',
                    marginBottom: '16px',
                    listStyleType: 'disc',
                    marginLeft: '1em'
                },
                'ol': {
                    paddingLeft: '2em',
                    marginBottom: '16px',
                    listStyleType: 'decimal',
                    marginLeft: '1em'
                },
                'li': {
                    marginBottom: '4px',
                    display: 'list-item'
                },
                // Blockquotes
                'blockquote': {
                    borderLeft: '4px solid #ddd',
                    paddingLeft: '16px',
                    marginLeft: '0',
                    marginRight: '0',
                    marginTop: '16px',
                    marginBottom: '16px',
                    fontStyle: 'italic',
                    color: '#666',
                    backgroundColor: '#f9f9f9',
                    padding: '12px 16px'
                },
                'blockquote p': {
                    margin: '0'
                },
                // Images
                'img': {
                    maxWidth: '100%',
                    height: 'auto',
                    borderRadius: '8px',
                    marginTop: '1em',
                    marginBottom: '1em'
                }
            }}
        />
    );
};

interface EditorProps {
  markdown: string;
  setMarkdown: (markdown: string) => void;
  title: string;
  setTitle: (title: string) => void;
  hashtagInput: string;
  setHashtagInput: (input: string) => void;
  hashtags: string[];
  setHashtags: (hashtags: string[]) => void;
  beneficiaries: Beneficiary[];
  setBeneficiaries: (beneficiaries: Beneficiary[]) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

const Editor: FC<EditorProps> = ({ markdown, setMarkdown, title, setTitle, hashtagInput, setHashtagInput, hashtags, setHashtags, beneficiaries, setBeneficiaries, onSubmit, isSubmitting = false }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const toast = useToast();
    const isMobile = useBreakpointValue({ base: true, sm: false }, { ssr: false });
    const [viewMode, setViewMode] = useState<'editor' | 'preview' | 'split'>(isMobile ? 'editor' : 'split');
    const [spoilerStates, setSpoilerStates] = useState<{[key: string]: boolean}>({});
    const [isGiphyModalOpen, setGiphyModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Aioha for image signing
    const { aioha, user } = useAioha();

    // Use SDK toolbar hook for markdown editing
    const toolbar = useEditorToolbar(textareaRef, markdown, setMarkdown);

    // Hashtag handlers
    const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { key } = e;
        if (key === " " && hashtagInput.trim()) {
            e.preventDefault(); // Prevent space from being added
            setHashtags([...hashtags, hashtagInput.trim()]);
            setHashtagInput("");
        } else if (key === "Backspace" && !hashtagInput && hashtags.length) {
            setHashtags(hashtags.slice(0, -1));
        }
    };

    const removeHashtag = (index: number) => {
        setHashtags(hashtags.filter((_, i) => i !== index));
    };
    
    // Handle mobile changes - switch to editor if mobile and currently in split
    useEffect(() => {
        if (isMobile && viewMode === 'split') {
            setViewMode('editor');
        }
    }, [isMobile, viewMode]);

    // Handle drag & drop image uploads
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (!user || !aioha) {
            toast({
                title: "Not Logged In",
                description: "Please log in to upload images",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        
        for (const file of acceptedFiles) {
            try {
                setIsUploading(true);
                
                toast({
                    title: "Compressing and uploading...",
                    description: `Processing ${file.name}`,
                    status: "info",
                    duration: 2000,
                    isClosable: true,
                });

                // Compress image before upload
                const compressedFile = await compressImage(file);
                
                // Upload using user's own signature
                const url = await uploadImageWithUserSignature(compressedFile, aioha, user);
                
                // Insert image using SDK
                toolbar.image(url, file.name);

                toast({
                    title: "Success!",
                    description: `${file.name} uploaded successfully`,
                    status: "success",
                    duration: 2000,
                    isClosable: true,
                });
            } catch (error) {
                console.error('Upload error:', error);
                toast({
                    title: "Upload Failed",
                    description: error instanceof Error ? error.message : `Failed to upload ${file.name}`,
                    status: "error",
                    duration: 3000,
                    isClosable: true,
                });
            } finally {
                setIsUploading(false);
            }
        }
    }, [markdown, setMarkdown, toast, toolbar, user, aioha]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
        },
        noClick: true, // Don't open file picker on click
        noKeyboard: true,
    });

    // Custom image upload handler - uses user's posting key via Aioha
    const handleImageUpload = useCallback(async (file: File): Promise<string> => {
        if (!user || !aioha) {
            throw new Error('Please log in to upload images');
        }
        
        try {
            // Upload using user's own signature (no shared app key needed)
            const uploadUrl = await uploadImageWithUserSignature(file, aioha, user);
            return uploadUrl;
        } catch (error) {
            console.error('Image upload failed:', error);
            toast({
                title: "Upload Failed",
                description: error instanceof Error ? error.message : "Failed to upload image. Please try again.",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            throw error;
        }
    }, [toast, user, aioha]);

    // Toolbar actions using SDK
    const handleBold = () => toolbar.bold();
    const handleItalic = () => toolbar.italic();
    const handleUnderline = () => toolbar.underline();
    const handleStrikethrough = () => toolbar.strikethrough();
    const handleLink = () => toolbar.link();
    const handleBulletList = () => toolbar.bulletList();
    const handleNumberedList = () => toolbar.numberedList();
    const handleQuote = () => toolbar.blockquote();
    const handleCodeBlock = () => toolbar.codeBlock();
    const handleTable = () => toolbar.table(2, 2);
    const handleSpoiler = () => toolbar.spoiler('Hidden Spoiler Text');
    
    // Header actions using SDK
    const handleHeader1 = () => toolbar.header(1);
    const handleHeader2 = () => toolbar.header(2);
    const handleHeader3 = () => toolbar.header(3);
    const handleHeader4 = () => toolbar.header(4);
    const handleHeader5 = () => toolbar.header(5);
    const handleHeader6 = () => toolbar.header(6);

    // Handle emoji selection using SDK
    const handleEmojiClick = (emoji: string) => {
        toolbar.emoji(emoji);
    };

    // Handle image upload
    const handleImageClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                if (!user || !aioha) {
                    toast({
                        title: "Not Logged In",
                        description: "Please log in to upload images.",
                        status: "error",
                        duration: 3000,
                        isClosable: true,
                    });
                    return;
                }
                
                try {
                    toast({
                        title: "Compressing and uploading...",
                        description: "Please wait while we process your image.",
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                    });
                    
                    // Compress image
                    const compressedFile = await compressImage(file);
                    
                    // Upload with user's signature
                    const url = await uploadImageWithUserSignature(compressedFile, aioha, user);
                    
                    // Insert using SDK
                    toolbar.image(url, file.name);

                    toast({
                        title: "Success!",
                        description: "Image uploaded successfully.",
                        status: "success",
                        duration: 2000,
                        isClosable: true,
                    });
                } catch (error) {
                    console.error('Image upload failed:', error);
                    toast({
                        title: "Upload Failed",
                        description: error instanceof Error ? error.message : "Failed to upload image",
                        status: "error",
                        duration: 3000,
                        isClosable: true,
                    });
                }
            }
        };
        input.click();
    };

    return (
        <Box h="100%" w="100%">
            {/* View Mode Controls */}
            <Flex mb={2} gap={2} justify="center" align="center">
                <Button
                    leftIcon={<FaCode />}
                    size="sm"
                    variant={viewMode === 'editor' ? 'solid' : 'outline'}
                    onClick={() => setViewMode('editor')}
                >
                    Editor
                </Button>
                {!isMobile && (
                    <Button
                        leftIcon={<FaEye />}
                        size="sm"
                        variant={viewMode === 'split' ? 'solid' : 'outline'}
                        onClick={() => setViewMode('split')}
                    >
                        Split
                    </Button>
                )}
                <Button
                    leftIcon={<FaEye />}
                    size="sm"
                    variant={viewMode === 'preview' ? 'solid' : 'outline'}
                    onClick={() => setViewMode('preview')}
                >
                    Preview
                </Button>
            </Flex>

            {/* Editor Content */}
            <Flex h="calc(100% - 50px)" gap={2}>
                {/* Left Panel - Editor Side */}
                {(viewMode === 'editor' || viewMode === 'split') && (
                    <Box 
                        flex={viewMode === 'split' ? 1 : 'auto'} 
                        h="100%"
                        display="flex"
                        flexDirection="column"
                        gap={2}
                        overflowY="auto"
                        pr={2}
                    >
                        {/* Title Input */}
                        <Box
                            border="1px solid"
                            borderColor="border"
                            borderRadius="md"
                            bg="background"
                        >
                            <Input
                                placeholder="Enter post title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                size="md"
                                border="none"
                                borderRadius="md"
                                fontWeight="semibold"
                                fontSize="lg"
                                px={3}
                                py={2}
                                bg="background"
                                color="text"
                                _focus={{ boxShadow: 'none', borderColor: 'primary' }}
                                _placeholder={{ color: 'gray.500' }}
                            />
                        </Box>
                        
                        {/* Markdown Editor Panel */}
                        <Box 
                            h="100%"
                            border="1px solid"
                            borderColor="border"
                            borderRadius="md"
                            display="flex"
                            flexDirection="column"
                            bg="background"
                    >
                        <Box 
                            bg="secondary" 
                            px={3} 
                            py={2} 
                            borderBottom="1px solid" 
                            borderColor="border"
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            flexWrap="wrap"
                        >
                            {/* Header Dropdown */}
                            <Menu>
                                <MenuButton
                                    as={Button}
                                    size="xs"
                                    variant="ghost"
                                    rightIcon={<FaChevronDown />}
                                    minW="auto"
                                    px={2}
                                    fontSize="sm"
                                    fontWeight="bold"
                                    color="white"
                                >
                                    H
                                </MenuButton>
                                <MenuList bg="secondary" borderColor="border">
                                    <MenuItem onClick={handleHeader1} fontSize="xl" fontWeight="bold" bg="secondary" color="text" _hover={{ bg: "muted" }}>
                                        H1 - Large Heading
                                    </MenuItem>
                                    <MenuItem onClick={handleHeader2} fontSize="lg" fontWeight="bold" bg="secondary" color="text" _hover={{ bg: "muted" }}>
                                        H2 - Medium Heading
                                    </MenuItem>
                                    <MenuItem onClick={handleHeader3} fontSize="md" fontWeight="bold" bg="secondary" color="text" _hover={{ bg: "muted" }}>
                                        H3 - Small Heading
                                    </MenuItem>
                                    <MenuItem onClick={handleHeader4} fontSize="sm" fontWeight="bold" bg="secondary" color="text" _hover={{ bg: "muted" }}>
                                        H4 - Extra Small
                                    </MenuItem>
                                    <MenuItem onClick={handleHeader5} fontSize="xs" fontWeight="bold" bg="secondary" color="text" _hover={{ bg: "muted" }}>
                                        H5 - Tiny
                                    </MenuItem>
                                    <MenuItem onClick={handleHeader6} fontSize="xs" fontWeight="normal" bg="secondary" color="text" _hover={{ bg: "muted" }}>
                                        H6 - Minimal
                                    </MenuItem>
                                </MenuList>
                            </Menu>
                            
                            <IconButton
                                aria-label="Bold"
                                icon={<FaBold />}
                                size="xs"
                                variant="ghost"
                                onClick={handleBold}
                                color="white"
                            />
                            <IconButton
                                aria-label="Italic"
                                icon={<FaItalic />}
                                size="xs"
                                variant="ghost"
                                onClick={handleItalic}
                                color="white"
                            />
                            <IconButton
                                aria-label="Underline"
                                icon={<FaUnderline />}
                                size="xs"
                                variant="ghost"
                                onClick={handleUnderline}
                                color="white"
                            />
                            <IconButton
                                aria-label="Strikethrough"
                                icon={<FaStrikethrough />}
                                size="xs"
                                variant="ghost"
                                onClick={handleStrikethrough}
                                color="white"
                            />
                            <IconButton
                                aria-label="Link"
                                icon={<FaLink />}
                                size="xs"
                                variant="ghost"
                                onClick={handleLink}
                                color="white"
                            />
                            <IconButton
                                aria-label="Bullet List"
                                icon={<FaListUl />}
                                size="xs"
                                variant="ghost"
                                onClick={handleBulletList}
                                color="white"
                            />
                            <IconButton
                                aria-label="Numbered List"
                                icon={<FaListOl />}
                                size="xs"
                                variant="ghost"
                                onClick={handleNumberedList}
                                color="white"
                            />
                            <IconButton
                                aria-label="Quote"
                                icon={<FaQuoteLeft />}
                                size="xs"
                                variant="ghost"
                                onClick={handleQuote}
                                color="white"
                            />
                            <IconButton
                                aria-label="Code Block"
                                icon={<FaCode />}
                                size="xs"
                                variant="ghost"
                                onClick={handleCodeBlock}
                                color="white"
                            />
                            <IconButton
                                aria-label="Table"
                                icon={<FaTable />}
                                size="xs"
                                variant="ghost"
                                onClick={handleTable}
                                color="white"
                            />
                            <IconButton
                                aria-label="Spoiler"
                                icon={<FaEyeSlash />}
                                size="xs"
                                variant="ghost"
                                onClick={handleSpoiler}
                                color="white"
                            />
                            {/* Emoji Picker */}
                            <Menu>
                                <MenuButton
                                    as={IconButton}
                                    aria-label="Emoji"
                                    icon={<FaSmile />}
                                    size="xs"
                                    variant="ghost"
                                    color="white"
                                />
                                <MenuList maxH="200px" overflowY="auto" display="grid" gridTemplateColumns="repeat(6, 1fr)" gap={1} p={2} bg="secondary" borderColor="border">
                                    {ALL_COMMON_EMOJIS.map((emoji, index) => (
                                        <MenuItem
                                            key={index}
                                            onClick={() => handleEmojiClick(emoji)}
                                            minH="32px"
                                            w="32px"
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                            fontSize="lg"
                                            p={1}
                                        >
                                            {emoji}
                                        </MenuItem>
                                    ))}
                                </MenuList>
                            </Menu>
                            {/* Giphy Button */}
                            <IconButton
                                aria-label="Add GIF"
                                icon={<MdGif size={16} />}
                                size="xs"
                                variant="ghost"
                                onClick={() => setGiphyModalOpen(!isGiphyModalOpen)}
                                color="white"
                            />
                            <IconButton
                                aria-label="Upload Image"
                                icon={<FaImage />}
                                size="xs"
                                variant="ghost"
                                onClick={handleImageClick}
                                color="white"
                            />
                        </Box>
                        <Box {...getRootProps()} position="relative" flex="1">
                            <input {...getInputProps()} />
                            <Textarea
                                ref={textareaRef}
                                value={markdown}
                                onChange={(e) => setMarkdown(e.target.value)}
                                placeholder="Write your markdown here... (or drag & drop images)"
                                className="markdown-editor"
                                border="none"
                                borderRadius="0"
                                resize="none"
                                h="100%"
                                fontFamily="mono"
                                fontSize="sm"
                                p={4}
                                bg="transparent"
                                color="inherit"
                                overflowY="auto"
                                _focus={{ boxShadow: 'none' }}
                                _placeholder={{ color: 'gray.500' }}
                            />
                            {isDragActive && (
                                <Flex
                                    position="absolute"
                                    top="0"
                                    left="0"
                                    right="0"
                                    bottom="0"
                                    bg="rgba(0, 123, 255, 0.1)"
                                    border="2px dashed"
                                    borderColor="blue.400"
                                    borderRadius="md"
                                    align="center"
                                    justify="center"
                                    pointerEvents="none"
                                    zIndex="10"
                                >
                                    <Box textAlign="center">
                                        <FaCloudUploadAlt size={48} color="#3182CE" />
                                        <Text mt={2} fontSize="lg" fontWeight="bold" color="blue.400">
                                            Drop images here
                                        </Text>
                                    </Box>
                                </Flex>
                            )}
                            {isUploading && (
                                <Flex
                                    position="absolute"
                                    top="50%"
                                    left="50%"
                                    transform="translate(-50%, -50%)"
                                    bg="blackAlpha.700"
                                    color="white"
                                    px={6}
                                    py={3}
                                    borderRadius="md"
                                    zIndex="20"
                                >
                                    <Text>Uploading...</Text>
                                </Flex>
                            )}
                        </Box>
                        </Box>
                        
                        {/* Hashtag Section */}
                        <Box
                            border="1px solid"
                            borderColor="border"
                            borderRadius="md"
                            bg="background"
                        >
                            {/* Hashtag Input */}
                            <Input
                                placeholder="Enter hashtags (press space to add)"
                                value={hashtagInput}
                                onChange={(e) => setHashtagInput(e.target.value)}
                                onKeyDown={handleHashtagKeyDown}
                                size="sm"
                                border="none"
                                borderRadius="md"
                                px={4}
                                py={2}
                                bg="background"
                                color="text"
                                _focus={{ boxShadow: 'none', borderColor: 'primary' }}
                                _placeholder={{ color: 'gray.500' }}
                            />
                            
                            {/* Display Hashtags as Tags */}
                            {hashtags.length > 0 && (
                                <Wrap p={3} spacing={2} borderTop="1px solid" borderColor="border">
                                    {hashtags.map((tag, index) => (
                                        <WrapItem key={index}>
                                            <Tag
                                                size="sm"
                                                borderRadius="base"
                                                variant="solid"
                                                colorScheme="blue"
                                            >
                                                <TagLabel>{tag}</TagLabel>
                                                <TagCloseButton onClick={() => removeHashtag(index)} />
                                            </Tag>
                                        </WrapItem>
                                    ))}
                                </Wrap>
                            )}
                        </Box>
                        
                        {/* Beneficiaries Input */}
                        <BeneficiariesInput
                            beneficiaries={beneficiaries}
                            setBeneficiaries={setBeneficiaries}
                        />
                        
                        {/* Submit Button */}
                        <Flex justify="flex-end">
                            <Button
                                size="sm"
                                colorScheme="blue"
                                onClick={onSubmit}
                                isLoading={isSubmitting}
                                loadingText="Publishing..."
                                isDisabled={isSubmitting || !title.trim() || !markdown.trim()}
                            >
                                Publish Post
                            </Button>
                        </Flex>
                    </Box>
                )}

                {/* Preview Panel */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                    <Box 
                        flex={viewMode === 'split' ? 1 : 'auto'}
                        h="100%"
                        border="1px solid"
                        borderColor="border"
                        borderRadius="md"
                        display="flex"
                        flexDirection="column"
                        bg="background"
                    >
                        <Box 
                            bg="secondary" 
                            px={3} 
                            py={2} 
                            borderBottom="1px solid" 
                            borderColor="border"
                            fontSize={title ? "lg" : "sm"}
                            fontWeight={title ? "bold" : "medium"}
                            color="text"
                        >
                            {title || "Preview"}
                        </Box>
                        <Box 
                            flex={1}
                            p={4}
                            overflowY="auto"
                            color="text"
                        >
                            {markdown ? (
                                <PreviewContent markdown={markdown} />
                            ) : (
                                <Box color="gray.500" fontStyle="italic">
                                    Your preview will appear here...
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}
            </Flex>
            
            {/* Giphy Selector Modal */}
            <Modal isOpen={isGiphyModalOpen} onClose={() => setGiphyModalOpen(false)} size="lg">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Add GIF</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={4}>
                        <GiphySelector
                            apiKey={process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'qXGQXTPKyNJByTFZpW7Kb0tEFeB90faV'}
                            onSelect={(gif, e) => {
                                e.preventDefault();
                                const gifMarkdown = `![${gif.title || 'GIF'}](${gif.images.original.url})`;
                                const textarea = textareaRef.current;
                                if (textarea) {
                                    const start = textarea.selectionStart;
                                    const end = textarea.selectionEnd;
                                    const newText = markdown.substring(0, start) + gifMarkdown + markdown.substring(end);
                                    setMarkdown(newText);
                                    
                                    // Restore cursor position
                                    setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(start + gifMarkdown.length, start + gifMarkdown.length);
                                    }, 0);
                                } else {
                                    setMarkdown(markdown + (markdown ? '\n\n' : '') + gifMarkdown);
                                }
                                setGiphyModalOpen(false);
                            }}
                        />
                    </ModalBody>
                </ModalContent>
            </Modal>
        </Box>
    );
};

export default Editor;
