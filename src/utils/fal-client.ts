import { fal } from '@fal-ai/client'
import dotenv from 'dotenv'

dotenv.config()

// Configure Fal.ai client
export const configureFalClient = () => {
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    throw new Error('FAL_KEY environment variable is required')
  }
  
  fal.config({
    credentials: apiKey
  })
  
  return fal
}

export { fal } 