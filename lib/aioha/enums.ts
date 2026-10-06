// String values copied from @aioha/aioha so the app can name wallet providers
// without evaluating that package. Keep these in sync with the library enums.
export enum Providers {
  Keychain = 'keychain',
  HiveSigner = 'hivesigner',
  HiveAuth = 'hiveauth',
  Ledger = 'ledger',
  PeakVault = 'peakvault',
  MetaMaskSnap = 'metamasksnap',
  ViewOnly = 'viewonly',
  Custom = 'custom',
}

export enum KeyTypes {
  Posting = 'posting',
  Active = 'active',
  Owner = 'owner',
  Memo = 'memo',
}

export enum Asset {
  HIVE = 'HIVE',
  HBD = 'HBD',
}
