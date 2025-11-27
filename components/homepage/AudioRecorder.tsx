'use client';
import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Box,
  Text,
  Progress,
  VStack,
  HStack,
  IconButton,
  useToast,
} from '@chakra-ui/react';
import { FaMicrophone, FaStop, FaTrash, FaPlay, FaPause } from 'react-icons/fa';

interface AudioRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  onAudioRecorded: (audioUrl: string) => void;
  username: string;
}

const MAX_DURATION = 300; // 5 minutes in seconds

export default function AudioRecorder({ isOpen, onClose, onAudioRecorded, username }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const toast = useToast();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= MAX_DURATION) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: 'Microphone Error',
        description: 'Could not access microphone. Please check permissions.',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const deleteRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    audioChunksRef.current = [];
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    if (!audioUrl) return;

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audioUrl);
      audioPlayerRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleUpload = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    try {
      const { uploadAudioTo3Speak } = await import('@/lib/hive/client-functions');
      const result = await uploadAudioTo3Speak(audioBlob, duration, username);
      
      if (result.success && result.playUrl) {
        onAudioRecorded(result.playUrl);
        handleClose();
        toast({
          title: 'Audio Uploaded',
          description: 'Your audio has been uploaded successfully!',
          status: 'success',
          duration: 3000,
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
      toast({
        title: 'Upload Error',
        description: 'Failed to upload audio. Please try again.',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (isRecording) stopRecording();
    deleteRecording();
    onClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Record Audio Snap</ModalHeader>
        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Timer and Progress */}
            <Box textAlign="center">
              <Text fontSize="3xl" fontWeight="bold">
                {formatTime(duration)}
              </Text>
              <Text fontSize="sm" color="gray.500">
                Max: {formatTime(MAX_DURATION)}
              </Text>
              <Progress
                value={(duration / MAX_DURATION) * 100}
                colorScheme={duration >= MAX_DURATION ? 'red' : 'blue'}
                mt={2}
                borderRadius="md"
              />
            </Box>

            {/* Recording Controls */}
            <HStack justify="center" spacing={4}>
              {!audioBlob && !isRecording && (
                <IconButton
                  aria-label="Start recording"
                  icon={<FaMicrophone />}
                  colorScheme="red"
                  size="lg"
                  isRound
                  onClick={startRecording}
                />
              )}

              {isRecording && (
                <IconButton
                  aria-label="Stop recording"
                  icon={<FaStop />}
                  colorScheme="red"
                  size="lg"
                  isRound
                  onClick={stopRecording}
                />
              )}

              {audioBlob && (
                <>
                  <IconButton
                    aria-label={isPlaying ? "Pause" : "Play"}
                    icon={isPlaying ? <FaPause /> : <FaPlay />}
                    colorScheme="blue"
                    size="lg"
                    isRound
                    onClick={togglePlayback}
                  />
                  <IconButton
                    aria-label="Delete recording"
                    icon={<FaTrash />}
                    colorScheme="gray"
                    size="lg"
                    isRound
                    onClick={deleteRecording}
                  />
                </>
              )}
            </HStack>

            {/* Status Messages */}
            {isRecording && (
              <Text textAlign="center" color="red.500" fontWeight="bold">
                🔴 Recording...
              </Text>
            )}
            {audioBlob && !isRecording && (
              <Text textAlign="center" color="green.500" fontWeight="bold">
                ✓ Recording Complete
              </Text>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose} isDisabled={isUploading}>
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleUpload}
            isDisabled={!audioBlob || isUploading}
            isLoading={isUploading}
            loadingText="Uploading..."
          >
            Use Audio
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
