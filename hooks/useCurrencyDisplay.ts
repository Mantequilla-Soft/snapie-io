import { useState, useEffect } from 'react';
import { getPayoutValue } from '@/lib/hive/client-functions';
import { convertHBDToDisplayCurrency } from '@/lib/utils/currencyConverter';

/**
 * Custom hook for displaying post payout values in the configured currency
 * 
 * Features:
 * - Automatically converts HBD to target currency if env variable is set
 * - No conversion if env variable is empty (displays as HBD/USD)
 * - Returns formatted string ready for display
 * - Handles loading state during async conversion
 * 
 * @param post - The post or comment object with payout information
 * @returns Formatted currency string (e.g., "R$25.50", "$5.123")
 */
export function useCurrencyDisplay(post: any, optimisticDeltaHBD: number = 0): string {
  const [displayValue, setDisplayValue] = useState<string>('');
  const targetCurrency = process.env.NEXT_PUBLIC_DISPLAY_CURRENCY;

  useEffect(() => {
    async function convertValue() {
      const hbdValue = getPayoutValue(post);
      const baseAmount = parseFloat(hbdValue);
      const hbdAmount = (isNaN(baseAmount) ? 0 : baseAmount) + optimisticDeltaHBD;

      if (hbdAmount === 0 && isNaN(baseAmount)) {
        setDisplayValue('$0.000');
        return;
      }

      if (!targetCurrency || targetCurrency.trim() === '') {
        setDisplayValue(`$${hbdAmount.toFixed(3)}`);
        return;
      }

      const converted = await convertHBDToDisplayCurrency(hbdAmount, targetCurrency);
      setDisplayValue(converted);
    }

    convertValue();
  }, [post, targetCurrency, optimisticDeltaHBD]);

  return displayValue || '$0.000';
}
