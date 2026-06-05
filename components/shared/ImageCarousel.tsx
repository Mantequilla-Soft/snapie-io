'use client';
import { Box, Flex, Icon, Image } from '@chakra-ui/react';
import { useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

interface ImageCarouselProps {
  urls: string[];
  onImageClick: (url: string) => void;
}

export default function ImageCarousel({ urls, onImageClick }: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const total = urls.length;

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex(i => Math.max(0, i - 1));
  };

  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex(i => Math.min(total - 1, i + 1));
  };

  return (
    <Box mb={2} borderRadius="md" overflow="hidden" position="relative">
      {/* Image */}
      <Box cursor="zoom-in" onClick={() => onImageClick(urls[index])}>
        <Image
          src={urls[index]}
          alt={`Image ${index + 1} of ${total}`}
          width="100%"
          maxH="480px"
          objectFit="cover"
          display="block"
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </Box>

      {/* Prev arrow */}
      {index > 0 && (
        <Flex
          position="absolute"
          left={2}
          top="50%"
          transform="translateY(-50%)"
          w={8}
          h={8}
          bg="blackAlpha.600"
          borderRadius="full"
          align="center"
          justify="center"
          cursor="pointer"
          onClick={prev}
          zIndex={1}
          _hover={{ bg: 'blackAlpha.800' }}
          transition="background 0.15s"
        >
          <Icon as={FiChevronLeft} color="white" boxSize={5} />
        </Flex>
      )}

      {/* Next arrow */}
      {index < total - 1 && (
        <Flex
          position="absolute"
          right={2}
          top="50%"
          transform="translateY(-50%)"
          w={8}
          h={8}
          bg="blackAlpha.600"
          borderRadius="full"
          align="center"
          justify="center"
          cursor="pointer"
          onClick={next}
          zIndex={1}
          _hover={{ bg: 'blackAlpha.800' }}
          transition="background 0.15s"
        >
          <Icon as={FiChevronRight} color="white" boxSize={5} />
        </Flex>
      )}

      {/* Counter badge */}
      <Box
        position="absolute"
        top={2}
        right={2}
        bg="blackAlpha.700"
        color="white"
        px={2}
        py="2px"
        borderRadius="full"
        fontSize="xs"
        fontWeight="semibold"
        zIndex={1}
        userSelect="none"
      >
        {index + 1} / {total}
      </Box>

      {/* Dot indicators */}
      <Flex
        position="absolute"
        bottom={2}
        left="50%"
        transform="translateX(-50%)"
        gap={1}
        zIndex={1}
      >
        {urls.map((_, i) => (
          <Box
            key={i}
            w={i === index ? '18px' : '6px'}
            h="6px"
            borderRadius="full"
            bg={i === index ? 'white' : 'whiteAlpha.500'}
            cursor="pointer"
            transition="all 0.2s"
            onClick={(e) => { e.stopPropagation(); setIndex(i); }}
          />
        ))}
      </Flex>
    </Box>
  );
}
