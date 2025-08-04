import { NanoSDK, NodeDefinition, NodeInstance, resolveAsset, uploadAsset } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { FalResponse } from '../../utils/image-utils.js'
import { getParameterValue } from '../../utils/parameter-utils.js'

const nodeDef: NodeDefinition = {
  uid: 'fal-flux-kontext',
  name: 'Flux Kontext',
  category: 'Image Generation',
  version: '1.0.0',
  type: 'server',
  description: 'Generates and edits images using Fal.ai Flux Kontext model',
  inputs: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Text prompt describing the image to generate or edit'
    },
    {
      name: 'image',
      type: 'string',
      description: 'Base64 encoded image to edit (optional)'
    }
  ],
  outputs: [
    {
      name: 'image',
      type: 'string',
      description: 'Generated image as data URL'
    }
  ],
  parameters: [
    {
      name: 'model_version',
      type: 'select',
      value: 'max',
      default: 'max',
      label: 'Model Version',
      description: 'Version of the Flux Kontext model to use',
      options: [
        { label: 'Pro', value: 'pro' },
        { label: 'Max (Enhanced)', value: 'max' }
      ]
    },
    {
      name: 'guidance_scale',
      type: 'number',
      value: 3.5,
      default: 3.5,
      label: 'Guidance Scale',
      description: 'How closely to follow the prompt (higher = more faithful)',
      min: 1,
      max: 20
    },
    {
      name: 'num_images',
      type: 'number',
      value: 1,
      default: 1,
      label: 'Number of Images',
      description: 'Number of images to generate',
      min: 1,
      max: 4
    },
    {
      name: 'safety_tolerance',
      type: 'select',
      value: '2',
      default: '2',
      label: 'Safety Tolerance',
      description: 'Safety tolerance level (1-6, higher = more permissive)',
      options: [
        { label: '1 - Most Strict', value: '1' },
        { label: '2 - Strict', value: '2' },
        { label: '3 - Moderate', value: '3' },
        { label: '4 - Permissive', value: '4' },
        { label: '5 - Very Permissive', value: '5' },
        { label: '6 - Most Permissive', value: '6' }
      ]
    },
    {
      name: 'output_format',
      type: 'select',
      value: 'jpeg',
      default: 'jpeg',
      label: 'Output Format',
      description: 'Format of the generated image',
      options: [
        { label: 'JPEG', value: 'jpeg' },
        { label: 'PNG', value: 'png' }
      ]
    },
    {
      name: 'aspect_ratio',
      type: 'select',
      value: '1:1',
      default: '1:1',
      label: 'Aspect Ratio',
      description: 'Aspect ratio of the generated image',
      options: [
        { label: '21:9', value: '21:9' },
        { label: '16:9', value: '16:9' },
        { label: '4:3', value: '4:3' },
        { label: '3:2', value: '3:2' },
        { label: '1:1', value: '1:1' },
        { label: '2:3', value: '2:3' },
        { label: '3:4', value: '3:4' },
        { label: '9:16', value: '9:16' },
        { label: '9:21', value: '9:21' }
      ]
    }
  ]
}

const falFluxKontextNode: NodeInstance = NanoSDK.registerNode(nodeDef)

falFluxKontextNode.execute = async ({ inputs, parameters, context }) => {
  console.log('=== FluxKontextNode execute started ===')
  console.log('Inputs:', JSON.stringify(inputs, null, 2))
  console.log('Parameters:', JSON.stringify(parameters, null, 2))
  
  // Configure Fal client
  configureFalClient()

  const prompt = inputs.prompt?.[0] as string
  const image = inputs.image?.[0] as string | undefined

  console.log('Extracted prompt:', prompt)
  console.log('Extracted image URI:', image)

  if (!prompt) {
    context.sendStatus({ type: 'error', message: 'Prompt is required' })
    throw new Error('Prompt is required')
  }

  // Get parameters
  const modelVersion = getParameterValue(parameters, 'model_version', 'max')
  const guidance_scale = getParameterValue(parameters, 'guidance_scale', 3.5)
  const num_images = getParameterValue(parameters, 'num_images', 1)
  const safety_tolerance = getParameterValue(parameters, 'safety_tolerance', '2')
  const output_format = getParameterValue(parameters, 'output_format', 'jpeg')
  const aspect_ratio = getParameterValue(parameters, 'aspect_ratio', '1:1')

  console.log('Extracted parameters:')
  console.log('- modelVersion:', modelVersion)
  console.log('- guidance_scale:', guidance_scale, 'type:', typeof guidance_scale)
  console.log('- num_images:', num_images, 'type:', typeof num_images)
  console.log('- safety_tolerance:', safety_tolerance, 'type:', typeof safety_tolerance)
  console.log('- output_format:', output_format)
  console.log('- aspect_ratio:', aspect_ratio)

  context.sendStatus({ type: 'running', message: 'Generating image...' })

  try {
    const input: any = {
      prompt,
      guidance_scale: Number(guidance_scale),
      num_images: Number(num_images),
      safety_tolerance: Number(safety_tolerance),
      output_format,
      aspect_ratio
    }
    
    // Resolve image asset if provided
    if (image) {
      console.log('Resolving image asset:', image)
      const imageBuffer: Buffer = await resolveAsset(image, { asBuffer: true }) as Buffer
      console.log('Resolved asset buffer size:', imageBuffer.length)

      const base64 = imageBuffer.toString('base64')
      const dataUrl = `data:image/${output_format};base64,${base64}`

      console.log('Converted image to data URL (length:', dataUrl.length, ')')
      input.image_url = dataUrl
    }

    console.log('Sending request to Fal.ai with input:', JSON.stringify(input, null, 2))
    console.log('Endpoint:', `fal-ai/flux-pro/kontext${modelVersion === 'max' ? '/max' : ''}`)

    let stepCount = 0
    const result = await fal.subscribe(`fal-ai/flux-pro/kontext${modelVersion === 'max' ? '/max' : ''}`, {
      input,
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          context.sendStatus({ 
            type: 'running', 
            message: 'Waiting in queue...',
            progress: { step: 0, total: 100 }
          })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount++
          const progress = Math.min(30 + (stepCount * 2), 80) // 30-80%
          if ('logs' in status && status.logs) {
            const lastLog = status.logs[status.logs.length - 1]
            context.sendStatus({ 
              type: 'running', 
              message: lastLog?.message || `Processing step ${stepCount}...`,
              progress: { step: progress, total: 100 }
            })
          } else {
            context.sendStatus({ 
              type: 'running', 
              message: `Processing step ${stepCount}...`,
              progress: { step: progress, total: 100 }
            })
          }
        } else if (status.status === 'COMPLETED') {
          context.sendStatus({ 
            type: 'running', 
            message: 'Finalizing...',
            progress: { step: 100, total: 100 }
          })
        }
      }
    }) as FalResponse

    console.log('Fal.ai response received:', JSON.stringify(result, null, 2))

    if (!result.data || !result.data.images || result.data.images.length === 0) {
      console.log('No images in response, throwing error')
      throw new Error('No images were generated')
    }

    // Get the first image URL, fetch it and upload as asset
    const imageUrl = result.data.images[0].url
    console.log('Generated image URL:', imageUrl)
    
    const response = await fetch(imageUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    console.log('Uploading image as asset...')
    const uploadResult = await uploadAsset(buffer, {
      type: 'image',
    })

    if (!uploadResult.uri) {
      console.log('Upload failed, no URI returned')
      throw new Error('Failed to upload generated image')
    }

    console.log('Upload successful, URI:', uploadResult.uri)
    console.log('=== FluxKontextNode execute completed ===')

    return {
      image: [uploadResult.uri]
    }
  } catch (error: any) {
    console.log('=== FluxKontextNode error ===')
    console.log('Error type:', error.constructor.name)
    console.log('Error message:', error.message)
    console.log('Error stack:', error.stack)
    console.log('Full error object:', JSON.stringify(error, null, 2))
    
    context.sendStatus({ type: 'error', message: error.message || 'Failed to generate image' })
    throw error
  }
}

export default falFluxKontextNode 