'use client';
import React from 'react';
import { Alert, AlertIcon, Box, Button, CloseButton, Text } from '@chakra-ui/react';
import { formatUploadLimitMessage, type UploadLimitInfo } from '@snapie/operations/limits';

interface UploadLimitNoticeProps {
  info: UploadLimitInfo;
  onClose?: () => void;
  /** Smaller text for tight spots such as a toast or the snap composer. */
  compact?: boolean;
}

/**
 * Shown when 3Speak refuses (or will refuse) an upload for a free account's
 * daily limit or the audio length cap. The text names the next slot in the
 * viewer's own time zone; the button opens 3Speak Pro.
 */
export default function UploadLimitNotice({ info, onClose, compact = false }: UploadLimitNoticeProps) {
  const text = formatUploadLimitMessage(info);
  return (
    <Alert
      status="warning"
      borderRadius="md"
      alignItems="flex-start"
      fontSize={compact ? 'sm' : 'md'}
      data-testid="upload-limit-notice"
      role="alert"
    >
      <AlertIcon mt={compact ? 0 : 1} />
      <Box flex="1" minW={0}>
        <Text>{text}</Text>
        {info.upgradeUrl && (
          <Button
            as="a"
            href={info.upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            mt={2}
            colorScheme="orange"
            variant="outline"
          >
            Get 3Speak Pro
          </Button>
        )}
      </Box>
      {onClose && (
        <CloseButton size="sm" ml={2} onClick={onClose} aria-label="Dismiss upload limit notice" />
      )}
    </Alert>
  );
}
