import { Providers } from '@aioha/aioha';

const PROVIDER_LABELS: Partial<Record<Providers, string>> = {
  [Providers.Keychain]:     'Hive Keychain',
  [Providers.HiveAuth]:     'HiveAuth',
  [Providers.HiveSigner]:   'HiveSigner',
  [Providers.PeakVault]:    'PeakVault',
  [Providers.Ledger]:       'Ledger',
  [Providers.MetaMaskSnap]: 'MetaMask Snap',
  [Providers.ViewOnly]:     'View-only',
  [Providers.Custom]:       'Custom',
};

const PROVIDER_SIGN_VERBS: Partial<Record<Providers, string>> = {
  [Providers.Keychain]:     'Confirm',
  [Providers.HiveAuth]:     'Acknowledge',
  [Providers.PeakVault]:    'Approve',
  [Providers.Ledger]:       'Confirm',
  [Providers.MetaMaskSnap]: 'Approve',
};

export function friendlyProviderName(provider: Providers | null | undefined): string | null {
  if (!provider) return null;
  return PROVIDER_LABELS[provider] ?? String(provider);
}

export function providerSignPrompt(provider: Providers | null | undefined): string {
  if (!provider) return 'Waiting for your wallet to sign…';
  if (provider === Providers.HiveSigner) {
    return "HiveSigner can't sign hangouts requests — please switch to another wallet";
  }
  const verb = PROVIDER_SIGN_VERBS[provider] ?? 'Confirm';
  const name = PROVIDER_LABELS[provider] ?? String(provider);
  return `${verb} the signing request via ${name}`;
}
