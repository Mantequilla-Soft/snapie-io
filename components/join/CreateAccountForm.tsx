'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Stack,
  Text,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import {
  FaCheck,
  FaDownload,
  FaEdit,
  FaEye,
  FaEyeSlash,
  FaKey,
  FaRedo,
  FaTimes,
} from 'react-icons/fa';
import HiveClient from '@/lib/hive/hiveclient';
import {
  generatePassword,
  generateKeys,
  validateAccountName,
  checkAccountAvailability,
  downloadBackupFile,
  type PrivateKeys,
} from '@/lib/hive/account-create-client';
import {
  generateShareableLink,
  type ShareableAccountData,
} from '@/lib/hive/share-link';
import KeysModal from './KeysModal';
import ShareLinkDialog from './ShareLinkDialog';

const DEBOUNCE_MS = 500;
const POLL_INTERVAL_MS = 5000;

export default function CreateAccountForm() {
  const toast = useToast();

  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [hasBeenValid, setHasBeenValid] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  const [keys, setKeys] = useState<PrivateKeys | null>(null);

  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [acceptedBackup, setAcceptedBackup] = useState(false);

  const keysModal = useDisclosure();
  const shareDialog = useDisclosure();

  const [shareLink, setShareLink] = useState('');
  const [polling, setPolling] = useState(false);
  const [success, setSuccess] = useState(false);

  const locked = polling || success;

  useEffect(() => {
    if (!password) setPassword(generatePassword());
  }, [password]);

  const onUsernameChange = useCallback((raw: string) => {
    const cleaned = raw.toLowerCase().trim();
    setUsername(cleaned);
    setIsAvailable(false);
    setUsernameError(null);
    setBackupDownloaded(false);
    setAcceptedBackup(false);

    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);

    if (cleaned.length === 0) return;

    const validation = validateAccountName(cleaned);
    if (!validation.isValid) {
      setUsernameError(validation.error!);
      return;
    }

    setIsChecking(true);
    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const available = await checkAccountAvailability(cleaned);
        if (!available) {
          setUsernameError('Username already taken');
          setIsAvailable(false);
        } else {
          setIsAvailable(true);
          setHasBeenValid(true);
        }
      } catch {
        setUsernameError('Could not check availability — try again');
      } finally {
        setIsChecking(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (username && password && isAvailable) {
      setKeys(generateKeys(username, password));
    }
  }, [username, password, isAvailable]);

  const regeneratePassword = () => {
    setPassword(generatePassword());
    setBackupDownloaded(false);
    setAcceptedBackup(false);
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(password).then(() => {
      toast({ title: 'Password copied', status: 'success', duration: 1500, isClosable: true });
    });
  };

  const onDownloadBackup = () => {
    if (!keys || !username) return;
    downloadBackupFile(username, password, keys, {
      onClipboardFallback: () => {
        toast({
          title: 'Backup copied to clipboard',
          description: 'Paste it somewhere safe before continuing.',
          status: 'info',
          duration: 4000,
          isClosable: true,
        });
        setBackupDownloaded(true);
      },
      onDownload: () => {
        setBackupDownloaded(true);
        toast({ title: 'Backup downloaded', status: 'success', duration: 1500, isClosable: true });
      },
    });
  };

  const onGenerateLink = () => {
    if (!keys || !username) return;
    const data: ShareableAccountData = {
      username,
      ownerPubkey: keys.ownerPubkey,
      activePubkey: keys.activePubkey,
      postingPubkey: keys.postingPubkey,
      memoPubkey: keys.memoPubkey,
    };
    setShareLink(generateShareableLink(data));
    shareDialog.onOpen();
    setPolling(true);
  };

  useEffect(() => {
    if (!polling || !username) return;
    let cancelled = false;

    const check = async () => {
      try {
        const accounts = await HiveClient.database.getAccounts([username]);
        if (cancelled) return;
        if (accounts.length > 0) {
          setSuccess(true);
          setPolling(false);
          toast({
            title: `Welcome, @${username}!`,
            description: 'Your Hive account has been created.',
            status: 'success',
            duration: 6000,
            isClosable: true,
          });
        }
      } catch {
        // network blip — keep trying
      }
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [polling, username, toast]);

  const canGenerateLink = isAvailable && acceptedBackup && backupDownloaded && !!keys && !locked;

  return (
    <Stack spacing={6} maxW="md" mx="auto" w="full" px={4} py={8}>
      <Box textAlign="center">
        <Heading size="xl" color="white" mb={2}>
          Join Snapie
        </Heading>
        <Text color="gray.400" fontSize="sm">
          Pick a username and create your Hive account. Anyone with an existing Hive account can sponsor yours in one click.
        </Text>
      </Box>

      <Box>
        <Text fontSize="sm" color="white" mb={1}>Username</Text>
        <Text fontSize="xs" color="gray.400" mb={2}>
          3–16 characters, lowercase. Start each segment with a letter.
        </Text>
        <InputGroup>
          <Input
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="yourname"
            autoComplete="off"
            fontFamily="mono"
            bg="rgba(4, 16, 29, 0.72)"
            borderColor={usernameError ? 'red.400' : isAvailable ? 'green.400' : 'whiteAlpha.200'}
            color="white"
            isDisabled={locked}
          />
          <InputRightElement>
            {isChecking ? <Spinner size="sm" /> : isAvailable ? <Box color="green.400"><FaCheck /></Box> : null}
          </InputRightElement>
        </InputGroup>
        <Box minH="20px" mt={1}>
          {usernameError && !isChecking && (
            <Text fontSize="xs" color="red.400">{usernameError}</Text>
          )}
          {isAvailable && !isChecking && !usernameError && (
            <Text fontSize="xs" color="green.400">Available</Text>
          )}
        </Box>
      </Box>

      {hasBeenValid && (
        <Box>
          <Text fontSize="sm" color="white" mb={1}>Master password</Text>
          <Text fontSize="xs" color="gray.400" mb={2}>
            Auto-generated. Back it up — this is the only way to recover your account.
          </Text>
          <InputGroup>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={isEditingPassword ? tempPassword : password}
              onChange={(e) => setTempPassword(e.target.value)}
              isReadOnly={!isEditingPassword || locked}
              onClick={() => {
                if (!isEditingPassword && !locked) copyPassword();
              }}
              fontFamily="mono"
              bg="rgba(4, 16, 29, 0.72)"
              borderColor="whiteAlpha.200"
              color="white"
              cursor={!isEditingPassword && !locked ? 'pointer' : 'text'}
              pr="7rem"
            />
            <InputRightElement w="7rem" justifyContent="flex-end" pr={1}>
              {!isEditingPassword ? (
                <>
                  <IconButton aria-label="Toggle password visibility" icon={showPassword ? <FaEyeSlash /> : <FaEye />} size="xs" variant="ghost" onClick={() => setShowPassword(!showPassword)} isDisabled={locked} />
                  <IconButton aria-label="Regenerate password" icon={<FaRedo />} size="xs" variant="ghost" onClick={regeneratePassword} isDisabled={locked} />
                  <IconButton aria-label="Edit password" icon={<FaEdit />} size="xs" variant="ghost" onClick={() => { setIsEditingPassword(true); setTempPassword(password); }} isDisabled={locked} />
                  <IconButton aria-label="View keys" icon={<FaKey />} size="xs" variant="ghost" onClick={keysModal.onOpen} />
                </>
              ) : (
                <>
                  <IconButton aria-label="Confirm new password" icon={<FaCheck />} size="xs" variant="ghost" onClick={() => { setPassword(tempPassword); setIsEditingPassword(false); setBackupDownloaded(false); setAcceptedBackup(false); }} />
                  <IconButton aria-label="Cancel edit" icon={<FaTimes />} size="xs" variant="ghost" onClick={() => { setIsEditingPassword(false); setTempPassword(''); }} />
                </>
              )}
            </InputRightElement>
          </InputGroup>

          <Button
            mt={3}
            w="full"
            leftIcon={<FaDownload />}
            variant="outline"
            onClick={onDownloadBackup}
            isDisabled={locked}
            color={backupDownloaded ? 'green.400' : 'orange.300'}
            borderColor={backupDownloaded ? 'green.400' : 'orange.400'}
          >
            {backupDownloaded ? 'Backup downloaded' : 'Download backup file'}
          </Button>
        </Box>
      )}

      {hasBeenValid && !success && (
        <Stack spacing={3}>
          <Checkbox
            isChecked={acceptedBackup}
            onChange={(e) => setAcceptedBackup(e.target.checked)}
            colorScheme="blue"
            isDisabled={!backupDownloaded || locked}
          >
            <Text fontSize="sm" color="gray.300">
              I&apos;ve saved my keys somewhere safe. I understand Hive has no password reset.
            </Text>
          </Checkbox>

          <Button
            onClick={onGenerateLink}
            isDisabled={!canGenerateLink}
            colorScheme="blue"
            size="lg"
            w="full"
          >
            Generate invite link
          </Button>

          {polling && (
            <Button
              variant="ghost"
              size="sm"
              onClick={shareDialog.onOpen}
              color="gray.400"
            >
              Show invite link again
            </Button>
          )}
        </Stack>
      )}

      {success && (
        <Alert status="success" bg="rgba(72, 187, 120, 0.1)" border="1px solid" borderColor="green.400" color="white" borderRadius="md">
          <AlertIcon color="green.400" />
          <Box>
            <Text fontWeight="bold">@{username} is live on Hive!</Text>
            <Text fontSize="sm" color="gray.300">You can now log in to Snapie with your new account.</Text>
          </Box>
        </Alert>
      )}

      <KeysModal isOpen={keysModal.isOpen} onClose={keysModal.onClose} keys={keys} />
      <ShareLinkDialog
        isOpen={shareDialog.isOpen}
        onClose={shareDialog.onClose}
        link={shareLink}
        username={username}
        waitingForSponsor={polling && !success}
      />
    </Stack>
  );
}
