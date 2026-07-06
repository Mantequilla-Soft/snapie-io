'use client';
import { useState } from 'react';
import { Box, Button } from '@chakra-ui/react';
import markdownRenderer from './MarkdownRenderer';

interface SpoilerProps {
  title: string;
  content: string;
  emojiOwner?: string;
}

/**
 * Title is rendered as a plain React text node (auto-escaped, never treated as
 * markup). Content is rendered through the shared sanitized markdownRenderer ->
 * DOMPurify pipeline, same as every other piece of rendered content in the app.
 * Do not switch this back to building an HTML string and assigning it via
 * element.innerHTML — that bypasses DOMPurify entirely (see incident writeup).
 */
export function SpoilerComponent({ title, content, emojiOwner }: SpoilerProps) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <Box
      border="1px solid"
      borderColor="gray.300"
      borderRadius="md"
      p={3}
      my={2}
      bg="gray.50"
    >
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsRevealed(!isRevealed)}
        mb={isRevealed ? 2 : 0}
      >
        {isRevealed ? 'Hide' : 'Show'} Spoiler: {title}
      </Button>
      {isRevealed && (
        <Box
          mt={2}
          p={2}
          bg="white"
          borderRadius="sm"
          border="1px solid"
          borderColor="gray.200"
          dangerouslySetInnerHTML={{ __html: markdownRenderer(content, { defaultEmojiOwner: emojiOwner }) }}
        />
      )}
    </Box>
  );
}