'use client';

import { createStandaloneToast, type UseToastOptions } from '@chakra-ui/react';
import { windows95ThemeDark } from '@/themes/windows95';

const { toast } = createStandaloneToast({ theme: windows95ThemeDark });

export function showToast(options: UseToastOptions): void {
  toast(options);
}
