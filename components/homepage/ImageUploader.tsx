import React, { useRef } from 'react';
import { Box, Input } from '@chakra-ui/react';

interface ImageUploaderProps {
    onUpload: (files: File[]) => void;
    /** Accessible name for the hidden file input (label must not use aria-label). */
    ariaLabel?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onUpload, ariaLabel = 'Image' }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length > 0) {
            onUpload(files);
        }
        // Reset input so same file can be selected again
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    return (
        <Box>
            <Input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                aria-label={ariaLabel}
                hidden
            />
        </Box>
    );
};

export default ImageUploader;
