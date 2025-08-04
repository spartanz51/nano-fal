import { NanoSDK } from '@nanograph/sdk'

// Initialize SDK
const sdk = new NanoSDK()

/**
 * Main entry point for the Node Server
 */
async function main() {
  console.log('')
  console.log(`----------------------------------------------------------------`)
  console.log(`[NodeServer] Starting NanoSDK`)
  console.log(`----------------------------------------------------------------`)
  
  // Start the server
  await sdk.start()
  
  console.log(`[NodeServer] Ready and waiting for connections`)
  console.log('.')
  console.log('..')
  console.log('...')
  console.log(`----------------------------------------------------------------`)
}

// Register shutdown handler
sdk.onShutdown(() => {
  console.log(`----------------------------------------------------------------`)
  console.log('[NodeServer] Shutting down gracefully')
  console.log(`----------------------------------------------------------------`)
})

// Handle process signals
process.on('SIGINT', () => sdk.stop())
process.on('SIGTERM', () => sdk.stop())

// Run the main function
main().catch(error => {
  console.error('[NodeServer] Failed to initialize:', error)
  process.exit(1)
})