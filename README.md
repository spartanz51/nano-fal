# Fal.ai Flux Kontext NodeServer

This NodeServer provides a set of nodes for generating and manipulating images using Fal.ai's Flux Kontext API. It integrates seamlessly with the NanoGraph visual programming framework.

![Demo](https://raw.githubusercontent.com/spartanz51/nano-flux-kontext/refs/heads/main/demo.png)

- [Image Workflow Example](nanograph-workflow.json)

## Available Nodes

### Flux Kontext Node
A versatile node that can generate new images or edit existing ones using the Flux Kontext model.

**Inputs:**
- `prompt` (string): The text description of the image to generate or edit
- `image` (string, optional): Base64 encoded image to edit

**Outputs:**
- `image` (string): Base64 encoded image data

**Parameters:**
- `model_version` (select): Version of the Flux Kontext model ('pro' or 'max')
- `guidance_scale` (number): How closely to follow the prompt (1-20)
- `num_images` (number): Number of images to generate (1-4)
- `safety_tolerance` (select): Safety tolerance level (1-6)
- `output_format` (select): Image format ('jpeg' or 'png')
- `aspect_ratio` (select): Image aspect ratio (e.g., '1:1', '16:9', etc.)

### Flux Kontext Text-to-Image Node
Specialized node for generating images from text prompts.

**Inputs:**
- `prompt` (string): The text description of the image to generate

**Outputs:**
- `image` (string): Base64 encoded image data

**Parameters:**
- `model_version` (select): Version of the Flux Kontext model ('pro' or 'max')
- `guidance_scale` (number): How closely to follow the prompt (1-20)
- `num_images` (number): Number of images to generate (1-4)
- `safety_tolerance` (select): Safety tolerance level (1-6)
- `output_format` (select): Image format ('jpeg' or 'png')
- `aspect_ratio` (select): Image aspect ratio (e.g., '1:1', '16:9', etc.)

### Flux Kontext Multi-Image Node
Node for generating multiple images from a single prompt.

**Inputs:**
- `prompt` (string): The text description of the images to generate

**Outputs:**
- `images` (array): Array of base64 encoded image data

**Parameters:**
- `model_version` (select): Version of the Flux Kontext model ('pro' or 'max')
- `guidance_scale` (number): How closely to follow the prompt (1-20)
- `num_images` (number): Number of images to generate (1-4)
- `safety_tolerance` (select): Safety tolerance level (1-6)
- `output_format` (select): Image format ('jpeg' or 'png')
- `aspect_ratio` (select): Image aspect ratio (e.g., '1:1', '16:9', etc.)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configuration:**
   Create a `.env` file with your Fal.ai API key:
   ```
   FAL_KEY=your_api_key_here
   PORT=3020
   ```

3. **Start the server:**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## Best Practices

- **Prompt Engineering**: Use clear, detailed prompts for better results
- **Model Selection**: Choose between 'pro' and 'max' versions based on your needs
- **Safety Settings**: Adjust safety tolerance based on your use case
- **Resource Management**: Be mindful of image generation limits and API usage
- **Security**: Never expose API keys in client-side code

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API rate limits | Implement rate limiting and queuing |
| Missing API key | Verify FAL_KEY in .env file |
| Image generation failures | Review prompt guidelines and error messages |
| Invalid parameters | Check parameter ranges and values |

## Future Enhancements

- [ ] Batch processing support
- [ ] Result caching
- [ ] Advanced prompt engineering tools
- [ ] Additional model variants
- [ ] Image upscaling and enhancement
- [ ] Custom model fine-tuning support 