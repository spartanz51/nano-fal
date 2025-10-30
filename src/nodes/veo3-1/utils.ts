import { uploadBufferToFal } from '../../utils/fal-storage.js'

export const ensureOption = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  if (typeof value === 'string' && options.includes(value as T)) {
    return value as T
  }
  return fallback
}

const detectImageFormat = (buffer: Buffer): string => {
  const signature = buffer.slice(0, 12)

  if (signature.slice(0, 4).toString('hex') === '89504e47') {
    return 'png'
  }

  if (signature.slice(0, 3).toString('hex') === 'ffd8ff') {
    return 'jpeg'
  }

  if (signature.slice(0, 4).toString('hex') === '47494638') {
    return 'gif'
  }

  if (signature.slice(0, 4).toString('hex') === '424d') {
    return 'bmp'
  }

  if (signature.slice(0, 4).toString('ascii') === 'RIFF' && signature.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'webp'
  }

  return 'jpeg'
}

export const uploadBufferAsImageUrl = async (buffer: Buffer, filenamePrefix: string): Promise<string> => {
  const format = detectImageFormat(buffer)
  return uploadBufferToFal(buffer, format, { filenamePrefix })
}
