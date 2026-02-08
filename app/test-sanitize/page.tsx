'use client';

import { Box, Container, Heading, Text, Code, VStack, HStack, Badge } from '@chakra-ui/react';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { sanitizeInvisibleCharacters } from '@/lib/utils/textSanitizer';

// Inject actual U+200E characters programmatically
const LRM = '\u200E'; // Left-to-Right Mark

const TEST_TEXT = `Hello, this is a test with invisible characters!

This line has many LRM marks:${LRM}${LRM}${LRM}
Another${LRM}line${LRM}with${LRM}LRM${LRM}marks${LRM}everywhere!

Basic ingredients:
900g flour${LRM}
10g yeast${LRM}
80ml oil${LRM}

This is a very long line that should wrap normally: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;

const PROBLEMATIC_TEXT_WITH_LRM = TEST_TEXT.split('\n').map(line => 
  `${LRM}${line}${LRM}`
).join('\n');

export default function TestSanitizePage() {
  const unsanitizedHtml = markdownRenderer(PROBLEMATIC_TEXT_WITH_LRM);
  const sanitizedText = sanitizeInvisibleCharacters(PROBLEMATIC_TEXT_WITH_LRM);
  const sanitizedHtml = markdownRenderer(sanitizedText);
  
  // Count invisible characters
  const countLRM = (text: string) => (text.match(/\u200E/g) || []).length;
  const beforeCount = countLRM(PROBLEMATIC_TEXT_WITH_LRM);
  const afterCount = countLRM(sanitizedText);

  return (
    <Container maxW="container.xl" py={8}>
      <Heading mb={6}>Text Sanitization Test</Heading>
      
      <VStack spacing={6} align="stretch">
        <Box>
          <HStack mb={2}>
            <Text fontWeight="bold">Statistics:</Text>
            <Badge colorScheme="red">Before: {beforeCount} invisible chars</Badge>
            <Badge colorScheme="green">After: {afterCount} invisible chars</Badge>
          </HStack>
        </Box>

        <Box>
          <Text fontWeight="bold" mb={2}>1. Raw Text (with LRM characters - U+200E):</Text>
          <Box 
            p={4} 
            bg="red.50" 
            borderRadius="md" 
            border="2px solid"
            borderColor="red.300"
            fontSize="sm"
            maxHeight="300px"
            overflowY="auto"
          >
            <Code whiteSpace="pre-wrap" wordBreak="break-all" bg="transparent">
              {PROBLEMATIC_TEXT_WITH_LRM}
            </Code>
          </Box>
          <Text fontSize="xs" color="gray.600" mt={2}>
            ⚠️ Contains {beforeCount} invisible U+200E characters
          </Text>
        </Box>

        <Box>
          <Text fontWeight="bold" mb={2}>2. After Sanitization (cleaned text):</Text>
          <Box 
            p={4} 
            bg="blue.50" 
            borderRadius="md"
            border="2px solid"
            borderColor="blue.300"
            fontSize="sm"
            maxHeight="300px"
            overflowY="auto"
          >
            <Code whiteSpace="pre-wrap" wordBreak="break-all" bg="transparent">
              {sanitizedText}
            </Code>
          </Box>
          <Text fontSize="xs" color="gray.600" mt={2}>
            ✅ All invisible characters removed - {afterCount} remaining
          </Text>
        </Box>

        <Box>
          <Text fontWeight="bold" mb={2}>3. Rendered HTML (WITHOUT sanitization - BAD):</Text>
          <Box 
            p={4} 
            bg="red.50" 
            borderRadius="md"
            border="2px solid"
            borderColor="red.300"
            maxHeight="300px"
            overflowY="auto"
            dangerouslySetInnerHTML={{ __html: markdownRenderer(PROBLEMATIC_TEXT_WITH_LRM) }}
            sx={{
              '& p': { marginBottom: '0.5em' }
            }}
          />
          <Text fontSize="xs" color="red.600" mt={2}>
            ⚠️ But our renderer auto-sanitizes, so this should still look OK!
          </Text>
        </Box>

        <Box>
          <Text fontWeight="bold" mb={2}>4. Rendered HTML (with manual sanitization first - GOOD):</Text>
          <Box 
            p={4} 
            bg="green.50" 
            borderRadius="md"
            border="2px solid"
            borderColor="green.300"
            maxHeight="300px"
            overflowY="auto"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            sx={{
              '& p': { marginBottom: '0.5em' }
            }}
          />
          <Text fontSize="xs" color="green.600" mt={2}>
            ✅ Explicitly sanitized before rendering - guaranteed clean
          </Text>
        </Box>
      </VStack>
    </Container>
  );
}
