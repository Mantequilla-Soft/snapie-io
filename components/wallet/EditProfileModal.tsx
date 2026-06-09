'use client';
import { useState, useEffect } from 'react';
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
  useToast,
} from '@chakra-ui/react';
import { updateProfile } from '@/lib/hive/client-functions';

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

  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [coverImage, setCoverImage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialData.name);
      setAbout(initialData.about);
      setLocation(initialData.location);
      setWebsite(initialData.website);
      setProfileImage(initialData.profileImage);
      setCoverImage(initialData.coverImage);
    }
  }, [isOpen, initialData]);

  async function handleSave() {
    setIsSaving(true);
    const res = await updateProfile(username, name, about, location, coverImage, profileImage, website);
    setIsSaving(false);
    if (res.success) {
      toast({ title: 'Profile updated', status: 'success', duration: 3000 });
      onSaved();
      onClose();
    } else {
      toast({ title: 'Update failed', description: res.error, status: 'error', duration: 6000, isClosable: true });
    }
  }

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

            {/* Avatar preview + URL */}
            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">Profile Image URL</FormLabel>
              <HStack spacing={3} align="center">
                <Avatar
                  src={profileImage || undefined}
                  name={username}
                  boxSize="56px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor="primary"
                  flexShrink={0}
                />
                <Input
                  value={profileImage}
                  onChange={(e) => setProfileImage(e.target.value)}
                  placeholder="https://…"
                  size="sm"
                  bg="muted"
                  border="none"
                  _focus={{ boxShadow: '0 0 0 1px var(--chakra-colors-primary)' }}
                />
              </HStack>
            </FormControl>

            {/* Cover preview + URL */}
            <FormControl>
              <FormLabel fontSize="sm" color="gray.400">Cover Image URL</FormLabel>
              <VStack spacing={2} align="stretch">
                {coverImage ? (
                  <Box borderRadius="md" overflow="hidden" height="80px">
                    <Image src={coverImage} alt="cover preview" width="100%" height="100%" objectFit="cover" fallback={<Box bg="muted" height="80px" />} />
                  </Box>
                ) : (
                  <Box bg="muted" borderRadius="md" height="80px" display="flex" alignItems="center" justifyContent="center">
                    <Text fontSize="xs" color="gray.500">No cover image</Text>
                  </Box>
                )}
                <Input
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="https://…"
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
          <Button variant="ghost" onClick={onClose} isDisabled={isSaving}>Cancel</Button>
          <Button colorScheme="blue" onClick={handleSave} isLoading={isSaving} loadingText="Saving…">
            Save Profile
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
