'use client';
import { FC, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  Text,
  VStack,
  HStack,
  Tag,
  TagLabel,
  TagCloseButton,
  useToast,
  Collapse,
} from '@chakra-ui/react';
import { FaPlus, FaChevronDown, FaChevronUp } from 'react-icons/fa';

export interface Beneficiary {
  account: string;
  weight: number; // in basis points (100 = 1%, 10000 = 100%)
}

interface BeneficiariesInputProps {
  beneficiaries: Beneficiary[];
  setBeneficiaries: (beneficiaries: Beneficiary[]) => void;
}

const BeneficiariesInput: FC<BeneficiariesInputProps> = ({ beneficiaries, setBeneficiaries }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newAccount, setNewAccount] = useState('');
  const [newPercentage, setNewPercentage] = useState('');
  const toast = useToast();

  // Calculate total percentage (excluding snapie's 3%)
  const totalPercentage = beneficiaries
    .filter(b => b.account !== 'snapie')
    .reduce((sum, b) => sum + (b.weight / 100), 0);

  const snapiePercentage = 3; // Fixed 3% for snapie

  const handleAddBeneficiary = () => {
    // Validation
    if (!newAccount.trim()) {
      toast({
        title: 'Invalid Account',
        description: 'Please enter a Hive account name',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const percentage = parseFloat(newPercentage);
    if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
      toast({
        title: 'Invalid Percentage',
        description: 'Please enter a percentage between 0 and 100',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Check if total would exceed 100%
    if (totalPercentage + percentage + snapiePercentage > 100) {
      toast({
        title: 'Exceeds 100%',
        description: `Total beneficiaries would be ${(totalPercentage + percentage + snapiePercentage).toFixed(1)}%. Maximum is 100%.`,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Check for duplicate
    if (beneficiaries.some(b => b.account.toLowerCase() === newAccount.toLowerCase())) {
      toast({
        title: 'Duplicate Account',
        description: 'This account is already a beneficiary',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Add beneficiary
    const weight = Math.round(percentage * 100); // Convert to basis points
    setBeneficiaries([...beneficiaries, { account: newAccount.toLowerCase(), weight }]);
    
    // Clear inputs
    setNewAccount('');
    setNewPercentage('');

    toast({
      title: 'Beneficiary Added',
      description: `${newAccount} will receive ${percentage}% of post rewards`,
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  const handleRemoveBeneficiary = (account: string) => {
    // Can't remove snapie
    if (account === 'snapie') {
      toast({
        title: 'Cannot Remove',
        description: 'Snapie is a required beneficiary (3%)',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    setBeneficiaries(beneficiaries.filter(b => b.account !== account));
  };

  return (
    <Box
      border="1px solid"
      borderColor="border"
      borderRadius="md"
      bg="background"
    >
      {/* Header */}
      <Flex
        px={4}
        py={3}
        justify="space-between"
        align="center"
        cursor="pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        _hover={{ bg: 'secondary' }}
        transition="background 0.2s"
      >
        <HStack spacing={3}>
          <Text fontWeight="bold" color="text">
            Reward Beneficiaries
          </Text>
          <Tag size="sm" colorScheme="blue">
            {(totalPercentage + snapiePercentage).toFixed(1)}% allocated
          </Tag>
        </HStack>
        <IconButton
          aria-label="Toggle beneficiaries"
          icon={isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          size="xs"
          variant="ghost"
          color="white"
        />
      </Flex>

      {/* Expanded Content */}
      <Collapse in={isExpanded}>
        <Box p={4} borderTop="1px solid" borderColor="border">
          <VStack spacing={3} align="stretch">
            {/* Current Beneficiaries */}
            {beneficiaries.length > 0 && (
              <Box>
                <Text fontSize="sm" color="gray.400" mb={2}>
                  Current beneficiaries:
                </Text>
                <Flex flexWrap="wrap" gap={2}>
                  {beneficiaries.map((b) => (
                    <Tag
                      key={b.account}
                      size="md"
                      borderRadius="base"
                      variant="solid"
                      colorScheme={b.account === 'snapie' ? 'green' : 'blue'}
                    >
                      <TagLabel>
                        @{b.account} ({(b.weight / 100).toFixed(1)}%)
                      </TagLabel>
                      {b.account !== 'snapie' && (
                        <TagCloseButton onClick={() => handleRemoveBeneficiary(b.account)} />
                      )}
                    </Tag>
                  ))}
                </Flex>
              </Box>
            )}

            {/* Add New Beneficiary */}
            <Box>
              <Text fontSize="sm" color="gray.400" mb={2}>
                Add beneficiary:
              </Text>
              <HStack spacing={2}>
                <Input
                  placeholder="@username"
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value.replace('@', ''))}
                  size="sm"
                  bg="background"
                  color="text"
                  borderColor="border"
                  _focus={{ borderColor: 'primary' }}
                  _placeholder={{ color: 'gray.500' }}
                />
                <Input
                  placeholder="%"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={newPercentage}
                  onChange={(e) => setNewPercentage(e.target.value)}
                  size="sm"
                  width="80px"
                  bg="background"
                  color="text"
                  borderColor="border"
                  _focus={{ borderColor: 'primary' }}
                  _placeholder={{ color: 'gray.500' }}
                />
                <IconButton
                  aria-label="Add beneficiary"
                  icon={<FaPlus />}
                  size="sm"
                  colorScheme="blue"
                  onClick={handleAddBeneficiary}
                  isDisabled={totalPercentage + snapiePercentage >= 100}
                />
              </HStack>
              <Text fontSize="xs" color="gray.500" mt={1}>
                Remaining: {(100 - totalPercentage - snapiePercentage).toFixed(1)}% • Note: 3% to @snapie is required
              </Text>
            </Box>
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

export default BeneficiariesInput;
