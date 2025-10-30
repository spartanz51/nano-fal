import { resolveAsset, uploadAsset } from '@nanograph/sdk'
import { uploadBufferToFal } from '../../utils/fal-storage.js'

export interface FalGeneratedImage {
  url?: string
  file_data?: string
  content_type?: string
  file_name?: string
}

const detectImageFormat = (buffer: Buffer, fallback: string = 'jpeg'): string => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png'
  }

  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x39 || buffer[4] === 0x37) &&
    buffer[5] === 0x61
  ) {
    return 'gif'
  }

  return fallback
}

export const loadImageAssetAsDataUrl = async (assetUri: string, format: string = 'jpeg'): Promise<string> => {
  const buffer: Buffer = await resolveAsset(assetUri, { asBuffer: true }) as Buffer
  const detected = detectImageFormat(buffer, format)
  return uploadBufferToFal(buffer, detected, { filenamePrefix: 'moondream-input' })
}

export const uploadFalGeneratedImage = async (image: FalGeneratedImage, fallbackFilename = 'moondream-output.png'): Promise<string> => {
  if (!image) {
    throw new Error('Fal response did not return an image payload')
  }

  let buffer: Buffer | undefined

  if (image.url) {
    const response = await fetch(image.url)
    const arrayBuffer = await response.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  } else if (image.file_data) {
    buffer = Buffer.from(image.file_data, 'base64')
  }

  if (!buffer) {
    throw new Error('Fal response did not include an image URL or file data')
  }

  const uploadOptions: Record<string, any> = { type: 'image' }

  if (image.content_type) {
    uploadOptions.contentType = image.content_type
  }

  const filename = image.file_name || fallbackFilename
  if (filename) {
    uploadOptions.filename = filename
  }

  const uploadResult = await uploadAsset(buffer, uploadOptions)

  if (!uploadResult.uri) {
    throw new Error('Failed to upload generated image')
  }

  return uploadResult.uri
}
