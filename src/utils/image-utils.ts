import { uploadAsset, UploadAssetResult } from '@nanograph/sdk'

export interface FalImage {
  url: string
  width: number
  height: number
}

export interface FalResponse {
  data: {
    images: FalImage[]
  }
}

export const fetchImageAsDataUrl = async (imageUrl: string, format: string = 'jpeg'): Promise<string> => {
  const response = await fetch(imageUrl)
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = buffer.toString('base64')
  return `data:image/${format};base64,${base64}`
}

export const uploadImageFromDataUrl = async (dataUrl: string): Promise<string> => {
  const b64 = dataUrl.split(',')[1]
  const buffer = Buffer.from(b64, 'base64')
  
  const uploadResult: UploadAssetResult = await uploadAsset(buffer, {
    type: 'image',
  })

  if (!uploadResult.uri) {
    throw new Error('Failed to upload image: no URI returned')
  }

  return uploadResult.uri
}

export const extractBase64FromDataUrl = (dataUrl: string): string => {
  const parts = dataUrl.split(',')
  if (parts.length < 2 || !parts[1]) {
    throw new Error('Invalid data URL format')
  }
  return parts[1]
} 