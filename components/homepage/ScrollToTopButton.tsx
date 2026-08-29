import { Box, Icon } from '@chakra-ui/react';
import { FiArrowUp } from 'react-icons/fi';

interface ScrollToTopButtonProps {
    visible: boolean;
    onClick: () => void;
}

/**
 * Floating "back to top" button for a long doom-scrolling session — mirrors
 * BottomTabBar.tsx's compose FAB for circular-floating-button visual
 * language, but styled as a secondary/utility action (neutral surface, not
 * the branded gradient) since it's not the primary CTA on the page.
 * Positioned above the mobile tab bar (h="calc(60px + env(safe-area-inset-
 * bottom))") so the two floating buttons never collide.
 */
export default function ScrollToTopButton({ visible, onClick }: ScrollToTopButtonProps) {
    if (!visible) return null;

    return (
        <Box
            as="button"
            onClick={onClick}
            aria-label="Scroll to top and refresh"
            position="fixed"
            right={{ base: '16px', sm: '24px' }}
            bottom={{ base: 'calc(76px + env(safe-area-inset-bottom))', sm: '24px' }}
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="44px"
            h="44px"
            borderRadius="full"
            bg="surface"
            border="1px solid"
            borderColor="surfaceBorder"
            backdropFilter="blur(20px)"
            boxShadow="0 4px 18px rgba(0,0,0,0.35)"
            color="text"
            zIndex={998}
            transition="transform 0.15s, box-shadow 0.15s"
            _hover={{ transform: 'scale(1.08)', boxShadow: '0 6px 22px rgba(0,0,0,0.45)' }}
            _active={{ transform: 'scale(0.94)' }}
        >
            <Icon as={FiArrowUp} boxSize={5} />
        </Box>
    );
}
