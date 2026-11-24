// Requires a running local server and a Leonardo.Ai connection. This example incurs one generation charge.
import { fetchJson, runtimeHeaders } from "./client.ts";

const connectionName = process.env.LEONARDO_AI_CONNECTION_NAME;
const imageUrl = process.env.LEONARDO_AI_IMAGE_URL;
if (!process.env.OOMOL_CONNECT_RUNTIME_TOKEN || !connectionName || !imageUrl) {
  console.log(
    "Set OOMOL_CONNECT_RUNTIME_TOKEN, LEONARDO_AI_CONNECTION_NAME and LEONARDO_AI_IMAGE_URL to run this example.",
  );
  process.exit(0);
}

const result = await fetchJson("http://localhost:3000/v1/actions/leonardo_ai.remove_background", {
  method: "POST",
  headers: runtimeHeaders({ "content-type": "application/json", "x-oo-connector-alias": connectionName }),
  body: JSON.stringify({
    input: {
      parameters: { format: "png", guidances: { image_reference: [{ image: { type: "URL", url: imageUrl } }] } },
      ephemeral: true,
    },
  }),
});
console.log(JSON.stringify(result, null, 2));
