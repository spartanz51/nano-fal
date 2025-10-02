import { NanoSDK } from '@nanograph/sdk'

// Initialize SDK
const sdk = new NanoSDK()

/**
 * Main entry point for the Node Server
 */
async function main() {
  // Start the server
  await sdk.start()
}

// Register shutdown handler
sdk.onShutdown(() => {

})

// Handle process signals
process.on('SIGINT', () => sdk.stop())
process.on('SIGTERM', () => sdk.stop())

// Run the main function
main().catch(error => {
  console.error('[NodeServer] Failed to initialize:', error)
  process.exit(1)
})