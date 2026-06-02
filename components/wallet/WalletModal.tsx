import { useState } from 'react';
import { Box, Button, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text, HStack, Select } from '@chakra-ui/react';
import type { SwapDirection } from '@/lib/hive/client-functions';

interface WalletModalSwapConfig {
    enabled: boolean;
    direction: SwapDirection;
    price?: number;
    slippagePercent: number;
}

interface WalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    showMemoField?: boolean;
    showUsernameField?: boolean; // New prop to show the username field
    swapConfig?: WalletModalSwapConfig;
    onConfirm: (amount: number, username?: string, memo?: string, swapDirection?: SwapDirection, slippagePercent?: number) => void; // Include username in the onConfirm callback
}

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];

export default function WalletModal ({ isOpen, onClose, title, description, showMemoField = false, showUsernameField = false, swapConfig, onConfirm }: WalletModalProps) {
    const [amount, setAmount] = useState<number>(0);
    const [memo, setMemo] = useState<string>('');
    const [username, setUsername] = useState<string>(''); // State to hold username
    const [customSlippage, setCustomSlippage] = useState<string>('');
    const [selectedSlippage, setSelectedSlippage] = useState<string>('');

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAmount(parseFloat(e.target.value) || 0);
    };

    const handleMemoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMemo(e.target.value);
    };

    const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUsername(e.target.value);
    };

    const isSwapMode = Boolean(swapConfig?.enabled);
    const effectiveSlippage = isSwapMode
        ? (selectedSlippage === 'custom'
            ? parseFloat(customSlippage) || 0
            : parseFloat(selectedSlippage || String(swapConfig?.slippagePercent || 0.5)))
        : undefined;
    const price = swapConfig?.price || 0;
    const expectedReceive = isSwapMode && amount > 0 && price > 0
        ? (swapConfig?.direction === 'HIVE_TO_HBD' ? amount * price : amount / price)
        : 0;
    const minReceive = isSwapMode && expectedReceive > 0 && effectiveSlippage !== undefined
        ? expectedReceive * (1 - effectiveSlippage / 100)
        : 0;

    const handleConfirm = () => {
        onConfirm(
            amount,
            showUsernameField ? username : undefined,
            showMemoField ? memo : undefined,
            swapConfig?.direction,
            effectiveSlippage,
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>{title}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    {description && <Text fontSize={'small'} mb={4}>{description}</Text>}
                    <Box mb={4}>
                        <Input
                            type="number"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={handleAmountChange}
                            min={0}
                        />
                    </Box>
                    {isSwapMode && (
                        <Box mb={4}>
                            <Text fontSize="sm" mb={2}>Direction</Text>
                            <Text fontSize="sm" color="gray.500" mb={3}>
                                {swapConfig?.direction === 'HIVE_TO_HBD' ? 'HIVE -> HBD' : 'HBD -> HIVE'}
                            </Text>

                            <Text fontSize="sm" mb={2}>Slippage tolerance</Text>
                            <HStack mb={3} spacing={2}>
                                {SLIPPAGE_PRESETS.map((preset) => (
                                    <Button
                                        key={preset}
                                        size="xs"
                                        variant={(selectedSlippage ? selectedSlippage === String(preset) : swapConfig?.slippagePercent === preset) ? 'solid' : 'outline'}
                                        onClick={() => setSelectedSlippage(String(preset))}
                                    >
                                        {preset}%
                                    </Button>
                                ))}
                                <Select
                                    size="xs"
                                    maxW="110px"
                                    value={selectedSlippage === 'custom' ? 'custom' : ''}
                                    onChange={(e) => {
                                        if (e.target.value === 'custom') setSelectedSlippage('custom');
                                    }}
                                >
                                    <option value="">Preset</option>
                                    <option value="custom">Custom</option>
                                </Select>
                            </HStack>
                            {selectedSlippage === 'custom' && (
                                <Input
                                    type="number"
                                    placeholder="Custom slippage %"
                                    value={customSlippage}
                                    onChange={(e) => setCustomSlippage(e.target.value)}
                                    min={0}
                                    max={20}
                                    mb={3}
                                />
                            )}
                            <Text fontSize="xs" color="gray.500">
                                {price > 0 ? `Market price: 1 HIVE ≈ ${price.toFixed(3)} HBD` : 'Market price unavailable'}
                            </Text>
                            {amount > 0 && expectedReceive > 0 && effectiveSlippage !== undefined && (
                                <Text fontSize="xs" color="gray.500" mt={1}>
                                    Est. receive: {expectedReceive.toFixed(3)} {swapConfig?.direction === 'HIVE_TO_HBD' ? 'HBD' : 'HIVE'} · Min: {minReceive.toFixed(3)}
                                </Text>
                            )}
                        </Box>
                    )}
                    {showUsernameField && (
                        <Box mb={4}>
                            <Input
                                placeholder="Enter username"
                                value={username}
                                onChange={handleUsernameChange}
                            />
                        </Box>
                    )}
                    {showMemoField && (
                        <Box mb={4}>
                            <Input
                                placeholder="Enter memo (optional)"
                                value={memo}
                                onChange={handleMemoChange}
                            />
                        </Box>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button
                        ml={3}
                        onClick={handleConfirm}
                        isDisabled={isSwapMode && (effectiveSlippage === undefined || Number.isNaN(effectiveSlippage) || effectiveSlippage < 0 || effectiveSlippage > 20)}
                    >
                        Confirm
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
