'use client';

import { Box } from '@chakra-ui/react';
import ProxiedImage from '@/components/shared/ProxiedImage';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

const CARD_IMAGE_HEIGHT = '200px';

interface PostCardCarouselProps {
  imageUrls: string[];
  visibleImages: number;
  postHref: string;
  title: string;
  onNavigate: (event: React.MouseEvent) => void;
  onSlideChange: (swiper: { activeIndex: number }) => void;
}

/** Swiper stays in its own chunk. The card's first render has no images yet,
 *  so this module is not part of the home document. */
export default function PostCardCarousel({
  imageUrls,
  visibleImages,
  postHref,
  title,
  onNavigate,
  onSlideChange,
}: PostCardCarouselProps) {
  return (
    <Swiper
      style={{ height: CARD_IMAGE_HEIGHT, width: '100%' }}
      spaceBetween={10}
      slidesPerView={1}
      pagination={{ clickable: true }}
      navigation={true}
      modules={[Navigation, Pagination]}
      onSlideChange={onSlideChange}
    >
      {imageUrls.slice(0, visibleImages).map((url, index) => (
        <SwiperSlide key={index}>
          <Box
            as="a"
            href={postHref}
            onClick={onNavigate}
            position="relative"
            h={CARD_IMAGE_HEIGHT}
            w="100%"
            cursor="pointer"
            overflow="hidden"
            borderRadius="10px"
          >
            <ProxiedImage
              url={url}
              alt={title}
              sizes="(max-width: 800px) 100vw, 640px"
            />
          </Box>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
