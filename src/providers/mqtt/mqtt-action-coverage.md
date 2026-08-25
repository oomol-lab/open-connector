# MQTT Action Coverage

## Scope

The first MQTT provider release supports brokers that expose MQTT over `ws://` or `wss://`. Every action uses a new clean connection and closes it before returning.

Implemented actions:

- `publish_message`: publish one UTF-8 or base64 payload with QoS 0, 1, or 2 and optional retain.
- `receive_messages`: subscribe for at most 30 seconds and return up to 100 messages received during that window.

## Deliberate Limits

- `receive_messages` is not a durable consumer. Non-retained messages published between action calls are missed.
- MQTT 3.1.1 is the default. MQTT 5.0 is explicit; the provider does not reconnect with another protocol version after a failed handshake.
- Raw `mqtt://` and `mqtts://` transport, persistent sessions, background subscriptions, workflow triggers, offline inboxes, mTLS, custom certificate authorities, and cloud-vendor signing are deferred.
- Private-network brokers require a self-hosted runtime with `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK` enabled. Cloudflare Workers cannot route to LAN brokers.

## Transport Safety

The provider opens the connection through `openGuardedWebSocket`, including URL and DNS validation, and then hands the already-open socket to MQTT.js. MQTT.js does not open an independent connection. The shared guard now accepts WebSocket subprotocols so the handshake can offer `mqtt` without bypassing egress policy.

## Proxy Decision

Generic HTTP proxy support does not apply because MQTT is a stateful binary protocol over WebSocket rather than a stable HTTP API origin.
