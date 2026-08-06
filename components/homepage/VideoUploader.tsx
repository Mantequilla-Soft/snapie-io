import React from 'react';
import { Box } from '@chakra-ui/react';
import { pickVideoFile } from '@/lib/utils/pickVideoFile';

interface VideoUploaderProps {
    onUpload: (file: File) => void;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onUpload }) => {
    const handleClick = async () => {
        const file = await pickVideoFile();
        if (!file) return;

        // Validate file size (100MB max)
        const maxSize = 100 * 1024 * 1024; // 100MB in bytes
        if (file.size > maxSize) {
            alert('Video file is too large. Maximum size is 100MB.');
            return;
        }

        // Validate file type
        const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
        if (!validTypes.includes(file.type)) {
            alert('Invalid video format. Please use MP4, WebM, or MOV.');
            return;
        }

        onUpload(file);
    };

    return <Box onClick={handleClick} />;
};

export default VideoUploader;
