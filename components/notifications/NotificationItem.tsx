import { Box, Text, HStack, IconButton, Link } from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons'; // Import the external link icon
import { Notifications } from '@hiveio/dhive';
import { Avatar } from '@/components/shared/Avatar';
import { MoodBadgeIcon } from '@/components/shared/MoodBadgeIcon';
import { useMoodBadges } from '@/hooks/useMoodBadges';

interface NotificationItemProps {
  notification: Notifications;
}

export default function NotificationItem({ notification }: NotificationItemProps) {
  
  const author = notification.msg.trim().split(' ')[0].slice(1);
  const { getEquippedBadge } = useMoodBadges();

  const formattedDate = new Date(notification.date + 'Z').toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false, // 24-hour format
  });

  return (
    <HStack
      spacing={4}
      p={4}
      border="tb1"
      borderRadius="base"
      bg="muted"
      w="full"
      align="stretch"
    >
      <Avatar
        username={author}
        size="sm"
        overlay={
          getEquippedBadge(author)
            ? <MoodBadgeIcon sku={getEquippedBadge(author)!} username={author} size="16px" />
            : undefined
        }
      />
      <Box flex="1">
        <Text fontWeight="semibold">{author}</Text>
        <Text>{notification.msg}</Text>
        <Text fontSize="sm">
          {formattedDate}
        </Text>
      </Box>
      {notification.url && (
        <Link href={'/' + notification.url}>
          <IconButton
            aria-label="Open notification"
            icon={<ExternalLinkIcon />}
            variant="ghost"
            size="lg"
            isRound
            alignSelf="center" // Center the icon vertically
          />
        </Link>
      )}
    </HStack>
  );
}
