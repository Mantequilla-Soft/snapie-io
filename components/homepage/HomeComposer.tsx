'use client';

import { Box } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const SnapComposer = dynamic(() => import('./SnapComposer'), {
  ssr: false,
  loading: () => <ComposerShell />,
});

/** Same outer box as SnapComposer so the feed does not jump when the real
 *  composer arrives. The video SDK and mention editor stay out of the
 *  first-load script until then. */
function ComposerShell({ onActivate }: { onActivate?: () => void }) {
  return (
    <Box
      bg="surface"
      p={4}
      mb={3}
      borderRadius="10px"
      border="tb1"
      boxShadow="lg"
    >
      <Box
        as="textarea"
        aria-label="What's happening?"
        placeholder="What's happening?"
        readOnly
        minH="92px"
        mb={3}
        w="100%"
        resize="none"
        bg="muted"
        border="1px solid"
        borderColor="surfaceBorder"
        borderRadius="10px"
        p={3}
        onFocus={onActivate}
        onClick={onActivate}
      />
      <Box h="44px" />
    </Box>
  );
}

export default function HomeComposer({
  pa,
  pp,
  onNewComment,
}: {
  pa: string;
  pp: string;
  onNewComment: (comment: unknown) => void;
}) {
  // The video SDK and Hive composer stay out of the unattended load. A
  // focus or click (the compose tab, or the shell itself) mounts them.
  // Loading that graph on an idle timer still landed inside Lighthouse's
  // TTI window and added a long task after the photo.
  const [live, setLive] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (live) composerRef.current?.focus();
  }, [live]);

  const activate = () => setLive(true);

  return (
    <Box id="snap-composer">
      {live ? (
        <SnapComposer
          ref={composerRef}
          pa={pa}
          pp={pp}
          onNewComment={onNewComment}
          onClose={() => null}
        />
      ) : (
        <ComposerShell onActivate={activate} />
      )}
    </Box>
  );
}
