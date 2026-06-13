'use client';
import { Box, Button, Flex, Icon, IconButton, Text } from '@chakra-ui/react';
import { FaQrcode } from 'react-icons/fa';
import { FiX } from 'react-icons/fi';

interface PaymentRequestBannerProps {
  to: string;
  amount: string;
  memo: string;
  isLoggedIn: boolean;
  onPay: () => void;
  onLoginToPay: () => void;
  onDismiss: () => void;
}

export default function PaymentRequestBanner({
  to, amount, memo, isLoggedIn, onPay, onLoginToPay, onDismiss,
}: PaymentRequestBannerProps) {
  return (
    <Box
      mx={4}
      mt={4}
      p={4}
      borderRadius="12px"
      bg="rgba(28, 161, 241, 0.07)"
      border="1px solid rgba(28, 161, 241, 0.28)"
      boxShadow="0 2px 18px rgba(28, 161, 241, 0.12)"
    >
      <Flex align="flex-start" gap={3}>
        <Flex
          w={9} h={9} borderRadius="full" flexShrink={0}
          bg="rgba(28, 161, 241, 0.12)" border="1px solid rgba(28, 161, 241, 0.25)"
          align="center" justify="center"
        >
          <Icon as={FaQrcode} color="primary" boxSize={4} />
        </Flex>

        <Box flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" color="white" mb={0.5}>
            Payment Request
          </Text>
          <Text fontSize="xs" color="gray.400" noOfLines={1}>
            @{to} is requesting <Text as="span" color="cyan.300" fontWeight="semibold">{amount}</Text>
            {memo && <Text as="span"> · &ldquo;{memo}&rdquo;</Text>}
          </Text>

          <Box mt={3}>
            {isLoggedIn ? (
              <Button
                size="sm"
                bgGradient="linear(135deg, #18a8ff, #66e4ff)"
                color="white"
                borderRadius="full"
                px={5}
                boxShadow="0 2px 12px rgba(24,168,255,0.35)"
                _hover={{ opacity: 0.88 }}
                _active={{ transform: 'scale(0.97)' }}
                onClick={onPay}
              >
                Pay Now
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                borderColor="primary"
                color="primary"
                borderRadius="full"
                px={5}
                _hover={{ bg: 'rgba(24,168,255,0.08)' }}
                onClick={onLoginToPay}
              >
                Login to Pay
              </Button>
            )}
          </Box>
        </Box>

        <IconButton
          aria-label="Dismiss"
          icon={<Icon as={FiX} boxSize={4} />}
          size="xs"
          variant="ghost"
          color="gray.500"
          borderRadius="full"
          flexShrink={0}
          _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
          onClick={onDismiss}
        />
      </Flex>
    </Box>
  );
}
