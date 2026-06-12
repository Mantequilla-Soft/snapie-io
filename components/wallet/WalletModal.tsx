import { useState, useEffect, type ChangeEvent } from 'react';
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
    showUsernameField?: boolean;
    swapConfig?: WalletModalSwapConfig;
    /** Pre-filled values from a QR scan */
    initialTo?: string;
    initialAmount?: number;
    initialMemo?: string;
    onConfirm: (amount: number, username?: string, memo?: string, swapDirection?: SwapDirection, slippagePercent?: number) => Promise<void>;
}

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];

export default function WalletModal ({ isOpen, onClose, title, description, showMemoField = false, showUsernameField = false, swapConfig, initialTo, initialAmount, initialMemo, onConfirm }: WalletModalProps) {
    const [amount, setAmount] = useState<number>(initialAmount ?? 0);
    const [memo, setMemo] = useState<string>(initialMemo ?? '');
    const [username, setUsername] = useState<string>(initialTo ?? '');
    const [isLoading, setIsLoading] = useState(false);
    const [customSlippage, setCustomSlippage] = useState<string>('');
    const [selectedSlippage, setSelectedSlippage] = useState<string>('');

    // Reset form fields each time the modal opens (picks up any new initial values from QR)
    useEffect(() => {
        if (isOpen) {
            setAmount(initialAmount ?? 0);
            setMemo(initialMemo ?? '');
            setUsername(initialTo ?? '');
            setIsLoading(false);
            setCustomSlippage('');
            setSelectedSlippage('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
        setAmount(parseFloat(e.target.value) || 0);
    };

    const handleMemoChange = (e: ChangeEvent<HTMLInputElement>) => {
        setMemo(e.target.value);
    };

    const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>) => {
        setUsername(e.target.value);
    };

    const isSwapMode = Boolean(swapConfig?.enabled);
    const parsedCustomSlippage = parseFloat(customSlippage);
    const isCustomSlippageValid = Number.isFinite(parsedCustomSlippage);
    const effectiveSlippage = isSwapMode
        ? (selectedSlippage === 'custom'
            ? (isCustomSlippageValid ? parsedCustomSlippage : undefined)
            : parseFloat(selectedSlippage || String(swapConfig?.slippagePercent || 0.5)))
        : undefined;
    const price = swapConfig?.price || 0;
    const expectedReceive = isSwapMode && amount > 0 && price > 0
        ? (swapConfig?.direction === 'HIVE_TO_HBD' ? amount * price : amount / price)
        : 0;
    const minReceive = isSwapMode && expectedReceive > 0 && effectiveSlippage !== undefined
        ? expectedReceive * (1 - effectiveSlippage / 100)
        : 0;

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            await onConfirm(
                amount,
                showUsernameField ? username : undefined,
                showMemoField ? memo : undefined,
                swapConfig?.direction,
                effectiveSlippage,
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={isLoading ? () => {} : onClose}
            closeOnOverlayClick={!isLoading}
            closeOnEsc={!isLoading}
        >
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>{title}</ModalHeader>
                <ModalCloseButton isDisabled={isLoading} />
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
                            {selectedSlippage === 'custom' && !isCustomSlippageValid && customSlippage.length > 0 && (
                                <Text fontSize="xs" color="red.400" mb={2}>
                                    Enter a valid slippage percentage.
                                </Text>
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
                    <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>Cancel</Button>
                    <Button
                        ml={3}
                        onClick={handleConfirm}
                        isLoading={isLoading}
                        loadingText="Processing…"
                        isDisabled={isLoading || (isSwapMode && (effectiveSlippage === undefined || Number.isNaN(effectiveSlippage) || effectiveSlippage < 0 || effectiveSlippage > 20))}
                    >
                        Confirm
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
