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
            minW="18px"
            h="18px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
        >
            {count > 99 ? '99+' : count}
        </Badge>
    );
}
