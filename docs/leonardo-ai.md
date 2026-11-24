# Leonardo.Ai

Connect with a Leonardo production API key from [API Access](https://app.leonardo.ai/api-access).

## Background removal

`leonardo_ai.remove_background` calls the synchronous `remove-bg` model. The removed
`remove_bg` provider and its account and improvement actions have no compatibility aliases.
Use a Leonardo connection and the new action's input schema.

```json
{
  "parameters": {
    "format": "png",
    "guidances": {
      "image_reference": [{ "image": { "type": "URL", "url": "https://example.com/photo.png" } }]
    }
  },
  "ephemeral": true
}
```

Use public HTTPS image URLs, raw Base64 bytes (`type: BASE64`, `data`), or Leonardo
library image IDs (`type: UPLOADED`, `GENERATED`, or `VARIATION`, with `id`). Background
images use the same shape under `parameters.guidances.background_image_reference`.

The action defaults to ephemeral, private output. Ephemeral URLs expire after 30 minutes;
set `ephemeral: false` to save results in your Leonardo library. `base64: true` requests
inline output instead of a URL. The response contains `id`, `results`, and upstream cost
and moderation metadata when available. `results` may be empty after moderation. This
action returns Leonardo results directly and does not upload them to transit storage.

For larger or batch workloads, use `create_generation` with `model: "remove-bg"` and
poll `get_generation`. Ephemeral storage and inline Base64 output are sync-only options.

Run the local HTTP example with an existing connection:

```bash
LEONARDO_AI_CONNECTION_NAME=default \
LEONARDO_AI_IMAGE_URL=https://example.com/photo.png \
node examples/local-http/leonardo_ai.ts
```

Set `OOMOL_CONNECT_RUNTIME_TOKEN` as well. Each successful generation incurs a provider charge.

References: [background removal](https://docs.leonardo.ai/docs/remove-bg),
[official migration guide](https://docs.leonardo.ai/docs/migrate-from-the-removebg-api-to-leonardoai).

## API review

Checked against the official documentation on November 24, 2026:

| Action              | Endpoint                            | Finding                                                                                                              |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `list_models`       | `GET /api/rest/v2/models`           | Current; returns `productionApiAvailableModels`.                                                                     |
| `create_generation` | `POST /api/rest/v2/generations`     | Current; accepts `model`, `parameters`, and `public`, returning `generationId` and optional integer `apiCreditCost`. |
| `get_generation`    | `GET /api/rest/v1/generations/{id}` | Still the documented retrieval endpoint; no v2 replacement is documented.                                            |
| `remove_background` | `POST /api/rest/v2/generationssync` | Added for the official remove.bg migration.                                                                          |

The existing generic generation action forwards model-specific parameters, so it needs
no hardcoded model replacements for the documented retirements. Call `list_models` for
current model schemas; use the model slug documented by Leonardo when creating a job.

Sources: [models](https://docs.leonardo.ai/reference/getmodels),
[async generation](https://docs.leonardo.ai/reference/creategeneration),
[generation retrieval](https://docs.leonardo.ai/v1.0/reference/getgenerationbyid),
[deprecations](https://docs.leonardo.ai/docs/deprecations-changes).
