import { resolveAsset, uploadAsset } from '@nanograph/sdk'

export interface FalGeneratedImage {
  url?: string
  file_data?: string
  content_type?: string
  file_name?: string
}

export const loadImageAssetAsDataUrl = async (assetUri: string, format: string = 'jpeg'): Promise<string> => {
  const buffer: Buffer = await resolveAsset(assetUri, { asBuffer: true }) as Buffer
  const base64 = buffer.toString('base64')
  return `data:image/${format};base64,${base64}`
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
