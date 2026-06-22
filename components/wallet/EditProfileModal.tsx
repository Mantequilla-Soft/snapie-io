'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  VStack,
  HStack,
  Avatar,
  Box,
  Image,
  Text,
  IconButton,
  Progress,
  useToast,
} from '@chakra-ui/react';
import { FaCamera } from 'react-icons/fa';
import { updateProfile, uploadImageWithKeychain } from '@/lib/hive/client-functions';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  initialData: {
    name: string;
    about: string;
    location: string;
    website: string;
    profileImage: string;
    coverImage: string;
  };
  onSaved: () => void;
}

export default function EditProfileModal({
  isOpen,
  onClose,
  username,
  initialData,
  onSaved,
}: EditProfileModalProps) {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState<number | null>(null);
  const [coverUploadProgress, setCoverUploadProgress] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [coverImage, setCoverImage] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialData.name);
      setAbout(initialData.about);
      setLocation(initialData.location);
      setWebsite(initialData.website || 'https://snapie.io');
      setProfileImage(initialData.profileImage);
      setCoverImage(initialData.coverImage);
      setAvatarUploadProgress(null);
      setCoverUploadProgress(null);
    }
  }, [isOpen, initialData]);

  async function handleImageFile(
    file: File,
    setter: (url: string) => void,
    setProgress: (p: number | null) => void,
  ) {
    setProgress(0);
    try {
      const url = await uploadImageWithKeychain(file, username, {
        onProgress: (p) => setProgress(p),
      });
      setter(url);
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setProgress(null);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    const trimmedWebsite = website.trim();
    const hasWebsiteDomain = trimmedWebsite.replace(/^https?:\/\//i, '').trim().length > 0;
    const res = await updateProfile(username, name, about, location, coverImage, profileImage, hasWebsiteDomain ? trimmedWebsite : '');
    setIsSaving(false);
    if (res.success) {
      toast({ title: 'Profile updated', status: 'success', duration: 3000 });
      onSaved();
      onClose();
    } else {
      toast({ title: 'Update failed', description: res.error, status: 'error', duration: 6000, isClosable: true });
    }
  }

  const isUploading = avatarUploadProgress !== null || coverUploadProgress !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(6px)" />
      <ModalContent bg="background" color="text" borderColor="rgba(255,255,255,0.08)" borderWidth="1px">
        <ModalHeader borderBottomWidth="1px" borderColor="rgba(255,255,255,0.08)">
          Edit Profile
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody py={6}>
          <VStack spacing={5} align="stretch">

            {/* Avatar */}
            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">Profile Photo</FormLabel>
              <HStack spacing={3} align="center">
                <Box position="relative" flexShrink={0}>
                  <Avatar
                    src={profileImage || undefined}
                    name={username}
                    boxSize="64px"
                    borderRadius="full"
                    border="2px solid"
                    borderColor="primary"
                  />
                  <IconButton
                    aria-label="Upload avatar"
                    icon={<FaCamera />}
                    size="xs"
                    borderRadius="full"
                    position="absolute"
                    bottom="-2px"
                    right="-2px"
                    colorScheme="blue"
                    onClick={() => avatarInputRef.current?.click()}
                    isLoading={avatarUploadProgress !== null}
                  />
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file, setProfileImage, setAvatarUploadProgress);
                      e.target.value = '';
                    }}
                  />
                </Box>
                <VStack spacing={1} align="stretch" flex={1}>
                  {avatarUploadProgress !== null ? (
                    <Progress value={avatarUploadProgress} size="xs" colorScheme="blue" borderRadius="full" />
                  ) : null}
                  <Input
                    value={profileImage}
                    onChange={(e) => setProfileImage(e.target.value)}
                    placeholder="Or paste an image URL…"
                    size="sm"
                    bg="muted"
                    border="none"
                    _focus={{ boxShadow: '0 0 0 1px var(--chakra-colors-primary)' }}
                  />
                </VStack>
              </HStack>
            </FormControl>

            {/* Cover image */}
            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">Cover Photo</FormLabel>
              <VStack spacing={2} align="stretch">
                <Box
                  position="relative"
                  borderRadius="md"
                  overflow="hidden"
                  height="90px"
                  bg="muted"
                  cursor="pointer"
                  onClick={() => coverInputRef.current?.click()}
                  _hover={{ opacity: 0.85 }}
                >
                  {coverImage ? (
                    <Image src={coverImage} alt="cover preview" width="100%" height="100%" objectFit="cover" fallback={<Box bg="muted" height="90px" />} />
                  ) : (
                    <Box display="flex" alignItems="center" justifyContent="center" height="90px" gap={2}>
                      <FaCamera color="gray" />
                      <Text fontSize="xs" color="gray.500">Click to upload cover photo</Text>
                    </Box>
                  )}
                  <Box
                    position="absolute" inset={0}
                    display="flex" alignItems="center" justifyContent="center"
                    bg="blackAlpha.500"
                    opacity={0}
                    _groupHover={{ opacity: 1 }}
                    transition="opacity 0.15s"
                  >
                    <FaCamera color="white" size={20} />
                  </Box>
                  {coverUploadProgress !== null && (
                    <Box position="absolute" bottom={0} left={0} right={0}>
                      <Progress value={coverUploadProgress} size="xs" colorScheme="blue" borderRadius={0} />
                    </Box>
                  )}
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file, setCoverImage, setCoverUploadProgress);
                      e.target.value = '';
                    }}
                  />
                </Box>
                <Input
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="Or paste an image URL…"
                  size="sm"
                  bg="muted"
                  border="none"
                  _focus={{ boxShadow: '0 0 0 1px var(--chakra-colors-primary)' }}
                />
              </VStack>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">Display Name</FormLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                bg="muted"
                border="none"
                _focus={{ boxShadow: '0 0 0 1px var(--chakra-colors-primary)' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">About</FormLabel>
              <Textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Tell the world about yourself…"
                bg="muted"
                border="none"
                rows={3}
                resize="vertical"
                _focus={{ boxShadow: '0 0 0 1px var(--chakra-colors-primary)' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">Location</FormLabel>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                bg="muted"
                border="none"
                _focus={{ boxShadow: '0 0 0 1px var(--chakra-colors-primary)' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">Website</FormLabel>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yoursite.com"
                bg="muted"
                border="none"
                _focus={{ boxShadow: '0 0 0 1px var(--chakra-colors-primary)' }}
              />
            </FormControl>

          </VStack>
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor="rgba(255,255,255,0.08)" gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={isSaving || isUploading}>Cancel</Button>
          <Button
            colorScheme="blue"
            onClick={handleSave}
            isLoading={isSaving}
            isDisabled={isUploading}
            loadingText="Saving…"
          >
            Save Profile
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
