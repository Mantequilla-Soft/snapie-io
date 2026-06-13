import { Badge } from '@chakra-ui/react';

interface CountBadgeProps {
    count: number;
    colorScheme?: string;
    top?: string;
    right?: string;
}

export function CountBadge({ count, colorScheme = 'green', top = '2px', right = '2px' }: CountBadgeProps) {
    if (count <= 0) return null;
    return (
        <Badge
            position="absolute"
            top={top}
            right={right}
            colorScheme={colorScheme}
            borderRadius="full"
            minW="20px"
            h="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
            boxShadow="0 0 18px rgba(28, 161, 241, 0.45)"
            border="1px solid"
            borderColor="rgba(255,255,255,0.45)"
        >
            {count > 99 ? '99+' : count}
        </Badge>
    );
}
