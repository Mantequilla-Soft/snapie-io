import { useState, useEffect, type ChangeEvent } from 'react';
import { Box, Button, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text, HStack, Select, Spinner } from '@chakra-ui/react';
import { Avatar } from '@/components/shared/Avatar';
import type { SwapDirection } from '@/lib/hive/client-functions';
import HiveClient from '@/lib/hive/hiveclient';

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

type UsernameLookupStatus = 'idle' | 'checking' | 'found' | 'not-found';

// How long to wait after the last keystroke before checking whether the
// typed username is a real Hive account — user asked for "1, maybe 2
// seconds" so they're clearly done typing before we spend a network call.
const USERNAME_LOOKUP_DEBOUNCE_MS = 1000;

export default function WalletModal ({ isOpen, onClose, title, description, showMemoField = false, showUsernameField = false, swapConfig, initialTo, initialAmount, initialMemo, onConfirm }: WalletModalProps) {
    // Raw typed text, not a parsed number — a controlled number input whose
    // value is a number React re-renders as a string, but React deliberately
    // skips re-syncing the DOM when the current text already parses to the
    // same number (so mid-typing states like "1." aren't stomped on). That
    // means a stale leading "0" a user didn't clear survives every future
    // keystroke ("0" + typing "1" => "01", forever). Storing the raw string
    // sidesteps this entirely, and starting empty (not "0") means there's
    // never a leading zero to collide with in the first place.
    const [amountText, setAmountText] = useState<string>(initialAmount ? String(initialAmount) : '');
    const [memo, setMemo] = useState<string>(initialMemo ?? '');
    const [username, setUsername] = useState<string>(initialTo ?? '');
    const [isLoading, setIsLoading] = useState(false);
    const [customSlippage, setCustomSlippage] = useState<string>('');
    const [selectedSlippage, setSelectedSlippage] = useState<string>('');
    const [usernameLookupStatus, setUsernameLookupStatus] = useState<UsernameLookupStatus>('idle');

    const amount = parseFloat(amountText) || 0;

    // Reset form fields each time the modal opens (picks up any new initial values from QR)
    useEffect(() => {
        if (isOpen) {
            setAmountText(initialAmount ? String(initialAmount) : '');
            setMemo(initialMemo ?? '');
            setUsername(initialTo ?? '');
            setIsLoading(false);
            setCustomSlippage('');
            setSelectedSlippage('');
            setUsernameLookupStatus('idle');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Debounced real-time lookup — confirms the typed username is a real
    // Hive account and shows their avatar, so a mistyped recipient is
    // obvious before hitting Confirm rather than after.
    useEffect(() => {
        if (!showUsernameField) return;
        const trimmed = username.trim().toLowerCase();
        if (!trimmed) {
            setUsernameLookupStatus('idle');
            return;
        }
        // Hive account names are capped at 16 chars — the RPC node throws
        // an assert_exception for anything longer, which isn't a network
        // hiccup, it's a definite "not a real account." Catch it here so
        // it lands on the same not-found feedback instead of the catch
        // block below quietly resetting to no verdict shown.
        if (trimmed.length > 16) {
            setUsernameLookupStatus('not-found');
            return;
        }
        setUsernameLookupStatus('checking');
        const timeoutId = setTimeout(async () => {
            try {
                const accounts = await HiveClient.database.getAccounts([trimmed]);
                setUsernameLookupStatus(accounts.length > 0 ? 'found' : 'not-found');
            } catch {
                // Network hiccup — don't block sending on a failed check,
                // just drop back to no verdict shown.
                setUsernameLookupStatus('idle');
            }
        }, USERNAME_LOOKUP_DEBOUNCE_MS);
        return () => clearTimeout(timeoutId);
    }, [username, showUsernameField]);

    const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
        setAmountText(e.target.value);
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
                            value={amountText}
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
                            <HStack spacing={2}>
                                <Input
                                    placeholder="Enter username"
                                    value={username}
                                    onChange={handleUsernameChange}
                                    borderColor={usernameLookupStatus === 'not-found' ? 'red.400' : undefined}
                                />
                                {usernameLookupStatus === 'checking' && <Spinner size="sm" flexShrink={0} />}
                                {usernameLookupStatus === 'found' && (
                                    <Avatar size="sm" username={username} flexShrink={0} />
                                )}
                            </HStack>
                            {usernameLookupStatus === 'not-found' && (
                                <Text fontSize="xs" color="red.400" mt={1}>
                                    No Hive account found with this username.
                                </Text>
                            )}
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
                        isDisabled={
                            isLoading ||
                            (isSwapMode && (effectiveSlippage === undefined || Number.isNaN(effectiveSlippage) || effectiveSlippage < 0 || effectiveSlippage > 20)) ||
                            (showUsernameField && usernameLookupStatus === 'not-found')
                        }
                    >
                        Confirm
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
