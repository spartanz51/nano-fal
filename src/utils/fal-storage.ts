import { File } from 'node:buffer'
import { fal } from './fal-client.js'

const formatToMime = (format: string): string => {
  switch (format.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    default:
      return `image/${format}`
  }
}

const formatToExtension = (format: string): string => {
  const lower = format.toLowerCase()
  if (lower === 'jpeg') {
    return 'jpg'
  }
  return lower
}

export const uploadBufferToFal = async (
  buffer: Buffer,
  format: string,
  options: { filenamePrefix?: string } = {}
): Promise<string> => {
  const extension = formatToExtension(format)
  const filenamePrefix = options.filenamePrefix ?? 'upload'
  const filename = `${filenamePrefix}.${extension}`
  const mimeType = formatToMime(format)
  type FalStorageUploadInput = Parameters<typeof fal.storage.upload>[0]
  const file = new File([buffer], filename, { type: mimeType })
  const url = await fal.storage.upload(file as unknown as FalStorageUploadInput)

  if (!url) {
    throw new Error('Fal storage upload did not return a URL')
  }

  return url
}

export const detectedFormatOrDefault = (format: string | undefined): string =>
  format && format.trim().length > 0 ? format : 'jpeg'
