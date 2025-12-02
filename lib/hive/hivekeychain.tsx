import { KeychainSDK, KeychainKeyTypes } from "keychain-sdk"

const keychain = new KeychainSDK(window)

export default function HiveKeychain() {
  return keychain
}

// Broadcast operations using Hive Keychain
export async function broadcastOperations(username: string, operations: any[]) {
  console.log('🔑 Keychain broadcast request:', { username, operations })
  
  const response = await keychain.broadcast({
    username,
    operations,
    method: KeychainKeyTypes.posting
  })
  
  console.log('🔑 Keychain response:', response)
  
  if (response && response.success) {
    return response
  } else {
    const errorMsg = response?.message || response?.error || 'Transaction failed'
    console.error('🔑 Keychain error:', errorMsg, response)
    throw new Error(errorMsg)
  }
}
