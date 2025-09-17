> Read the OpenAPI spec in `scripts/openapi/`, study existing nodes in `src/nodes/`, then directly implement or update Fal nodes to match those patterns.

## How NanoGraph nodes are structured

- Server nodes live in `src/nodes/<family>/` and export a default `NodeInstance` returned by `NanoSDK.registerNode(nodeDefinition)`.
- `nodeDefinition` needs a stable `uid`, human-readable `name`, `category`, semantic `description`, declared `inputs`, `outputs`, and `parameters`. Follow the naming style used by existing nodes.
- The `execute` handler receives `{ inputs, parameters, context }` and usually:
  1. Calls `configureFalClient()` to ensure `FAL_KEY` is loaded.
  2. Extracts inputs (e.g. `inputs.prompt?.[0]`) and sends `context.sendStatus({ type: 'error', ... })` before throwing if required data is missing.
  3. Resolves incoming assets with `resolveAsset(uri, { asBuffer: true })` and converts them to data URLs where Fal expects inline media.
  4. Builds the Fal payload using `getParameterValue` defaults, coercing values into the ranges documented in the OpenAPI spec.
  5. Invokes `fal.subscribe('<endpoint>', { input, logs: true, onQueueUpdate })`, forwarding queue/progress updates to `context.sendStatus` similarly to established nodes.
  6. Reuse the shared progress strategy helpers (`src/utils/progress-strategy.ts` and node-specific wrappers such as `src/nodes/seedance/progress.ts`) so queue/status messages include log-driven updates with an ETA fallback when Fal logs are missing.
  7. Validates the response, downloads returned media, and re-uploads it with `uploadAsset` so outputs reference NanoGraph asset URIs.
  8. Returns an object whose keys match the declared outputs, always using arrays (e.g. `{ image: [uri] }`). Include seeds or other metadata when the API provides them.
- Helpful utilities:
  - `src/utils/fal-client.ts` – configures the Fal client.
  - `src/utils/parameter-utils.ts` – typed parameter helpers.
  - `src/utils/image-utils.ts` – helpers for dealing with image data URLs and uploads.
- Keep logging informative, stay within ASCII, and mirror existing error-handling style.
- If multiple Fal endpoints of the same model share identical inputs/outputs (e.g. “fast” vs “max”), prefer one node with a `select` parameter to switch the endpoint instead of duplicating nodes. Make sure the parameter labels clearly explain the trade-offs.
