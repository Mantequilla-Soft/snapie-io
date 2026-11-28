'use client';
import { Drawer, DrawerOverlay, DrawerContent, DrawerBody } from '@chakra-ui/react';
import ShortsCommentContent from './ShortsCommentContent';

interface ShortsCommentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  author: string;
  permlink: string;
  commentCount: number;
}

export default function ShortsCommentSheet({ isOpen, onClose, author, permlink, commentCount }: ShortsCommentSheetProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="bottom" size="full">
      <DrawerOverlay bg="blackAlpha.700" />
      <DrawerContent
        bg="rgba(8, 24, 40, 0.97)"
        borderTopRadius="16px"
        backdropFilter="blur(18px)"
        maxH="80dvh"
        // Theme Drawer already pads bottom; keep horizontal insets explicit on
        // this immersive sheet so landscape notch clearance is obvious here.
        pl="env(safe-area-inset-left)"
        pr="env(safe-area-inset-right)"
      >
        <DrawerBody p={0} display="flex" flexDirection="column" h="100%">
          <ShortsCommentContent
            author={author}
            permlink={permlink}
            commentCount={commentCount}
            onClose={onClose}
          />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
