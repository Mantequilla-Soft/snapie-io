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
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  useToast,
} from '@chakra-ui/react';
import { FaMicrophone, FaStop, FaTrash, FaPlay, FaPause, FaUpload } from 'react-icons/fa';

interface AudioRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  onAudioRecorded: (audioUrl: string) => void;
  username: string;
  maxDuration?: number;
}

const DEFAULT_MAX_DURATION = 300;
// Server caps audio uploads at ~150 MB. We reject before posting so the user
// gets a fast local error instead of a 413 round trip.
const MAX_UPLOAD_SIZE = 150 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(Math.round(d));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

export default function AudioRecorder({ isOpen, onClose, onAudioRecorded, username, maxDuration }: AudioRecorderProps) {
  const MAX_DURATION = maxDuration ?? DEFAULT_MAX_DURATION;
  const hasFiniteCap = Number.isFinite(MAX_DURATION);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDuration, setUploadDuration] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;
          if (hasFiniteCap && newDuration >= MAX_DURATION) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Microphone Access Denied',
        description: `Cannot access microphone: ${errorMessage}. If using Hive Keychain browser, try opening this site in Chrome/Brave instead. This may be a Keychain browser bug.`,
        status: 'error',
        duration: 8000,
        isClosable: true,
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

  const uploadAudio = async (blob: Blob, durationSec: number) => {
    setIsUploading(true);
    try {
      const { uploadAudioTo3Speak } = await import('@/lib/hive/client-functions');
      const result = await uploadAudioTo3Speak(blob, durationSec, username);

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
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
      toast({
        title: 'Upload Error',
        description: error instanceof Error ? error.message : 'Failed to upload audio. Please try again.',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRecordedUpload = () => {
    if (audioBlob) uploadAudio(audioBlob, duration);
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);

    if (!file.type.startsWith('audio/')) {
      setUploadError('Please pick an audio file.');
      setUploadFile(null);
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      setUploadError(`File is too large (${formatBytes(file.size)}). Max size: ${formatBytes(MAX_UPLOAD_SIZE)}.`);
      setUploadFile(null);
      return;
    }
    const probed = await probeAudioDuration(file);
    setUploadFile(file);
    setUploadDuration(probed);
  };

  const handleFileUpload = () => {
    if (uploadFile) uploadAudio(uploadFile, uploadDuration);
  };

  const clearUploadFile = () => {
    setUploadFile(null);
    setUploadDuration(0);
    setUploadError(null);
  };

  const handleClose = () => {
    if (isRecording) stopRecording();
    deleteRecording();
    clearUploadFile();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add Audio</ModalHeader>
        <ModalBody>
          <Tabs variant="enclosed" colorScheme="blue">
            <TabList>
              <Tab><HStack spacing={2}><FaMicrophone /><Text>Record</Text></HStack></Tab>
              <Tab><HStack spacing={2}><FaUpload /><Text>Upload file</Text></HStack></Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0}>
                <VStack spacing={4} align="stretch">
                  <Box textAlign="center">
                    <Text fontSize="3xl" fontWeight="bold">{formatTime(duration)}</Text>
                    {hasFiniteCap ? (
                      <>
                        <Text fontSize="sm" color="gray.500">Max: {formatTime(MAX_DURATION)}</Text>
                        <Progress
                          value={(duration / MAX_DURATION) * 100}
                          colorScheme={duration >= MAX_DURATION ? 'red' : 'blue'}
                          mt={2}
                          borderRadius="md"
                        />
                      </>
                    ) : (
                      <Text fontSize="sm" color="gray.500">No time limit</Text>
                    )}
                  </Box>

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
                          aria-label={isPlaying ? 'Pause' : 'Play'}
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
              </TabPanel>

              <TabPanel px={0}>
                <VStack spacing={4} align="stretch">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={handleFilePick}
                  />
                  {!uploadFile ? (
                    <Box
                      borderWidth="2px"
                      borderStyle="dashed"
                      borderColor="gray.500"
                      borderRadius="md"
                      p={6}
                      textAlign="center"
                    >
                      <VStack spacing={3}>
                        <FaUpload size={32} />
                        <Text fontSize="sm" color="gray.500">
                          Pick an audio file (MP3, WAV, OGG, WEBM, M4A). Up to {formatBytes(MAX_UPLOAD_SIZE)}.
                        </Text>
                        <Button leftIcon={<FaUpload />} onClick={() => fileInputRef.current?.click()}>
                          Choose file
                        </Button>
                        {uploadError && (
                          <Text fontSize="sm" color="red.400">{uploadError}</Text>
                        )}
                      </VStack>
                    </Box>
                  ) : (
                    <Box borderWidth="1px" borderColor="gray.600" borderRadius="md" p={4}>
                      <VStack spacing={2} align="stretch">
                        <Text fontWeight="bold" wordBreak="break-all">{uploadFile.name}</Text>
                        <HStack justify="space-between" fontSize="sm" color="gray.500">
                          <Text>{formatBytes(uploadFile.size)}</Text>
                          {uploadDuration > 0 && <Text>{formatTime(uploadDuration)}</Text>}
                        </HStack>
                        <HStack>
                          <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
                            Change file
                          </Button>
                          <Button size="sm" variant="ghost" leftIcon={<FaTrash />} onClick={clearUploadFile}>
                            Remove
                          </Button>
                        </HStack>
                      </VStack>
                    </Box>
                  )}
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose} isDisabled={isUploading}>
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={uploadFile ? handleFileUpload : handleRecordedUpload}
            isDisabled={(!audioBlob && !uploadFile) || isUploading || isRecording}
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
