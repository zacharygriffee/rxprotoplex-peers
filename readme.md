# rxprotoplex-peers

A powerful library for managing peer-to-peer connections, signaling, and WebSocket server interactions. Designed with flexibility and reactivity in mind, `rxprotoplex-peers` leverages RxJS and Protoplex for efficient peer management and multiplexing.

# ALPHA VERSION

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [peerManager](#peermanager)
  - [getPeerManager](#getpeermanager)
  - [setDefaultIdMap](#setdefaultidmap)
  - [basePeer](#basepeer)
  - [webrtcSignalingRelay](#webrtcSignalingRelay)
  - [server](#server)
  - [webSocketPeer](#websocketpeer)
  - [webSocketServer](#websocketserver)
- [License](#license)

---

## Installation

Install this library using your preferred package manager:

```bash
npm install rxprotoplex-peers
```

---

## Usage

### `peerManager`

Creates a peer manager for managing peer connections and states.

```javascript
const peerManager = peerManager(name, idMap = defaultIdMap);
```

#### Parameters
- **`name`** (`string`): The name of the peer manager instance.
- **`idMap`** (`Function|string`): A function or property string to map connections to unique IDs (default: `defaultIdMap`).

#### Returns
- `Object`: The peer manager instance.

---

### `getPeerManager`

Retrieves an existing peer manager by name.

```javascript
const manager = getPeerManager(name);
```

#### Parameters
- **`name`** (`string`): The name of the peer manager to retrieve.

#### Returns
- `Object|undefined`: The peer manager instance if found, or `undefined`.

---

### `setDefaultIdMap`

Sets the default ID mapping function or property string.

```javascript
setDefaultIdMap(fnOrString);
```

#### Parameters
- **`fnOrString`** (`Function|string`): A function to map entities to IDs, or a property string.

---

### `basePeer`

Creates a base peer object by combining a Plex instance with peer management functionality.

```javascript
const peer = basePeer(id, plex);
```

#### Parameters
- **`id`** (`string`): The unique identifier for the peer.
- **`plex`** (`Object`): A Plex instance for multiplexing connections.

#### Returns
- `Object`: The enhanced Plex instance with peer-related functionality.

---

### `webrtcSignalingRelay`

Handles relaying messages and signaling between peers.

```javascript
const relayHandler = webrtcSignalingRelay(manager, peer);
```

#### Parameters
- **`manager`** (`Object`): The peer manager instance.
- **`peer`** (`Object`): The peer instance (default: `manager`).

#### Returns
- `Object`: An object exposing webrtcSignalingRelay-related methods as RPC.

---

### `server`

Creates a server for managing peer connections and relaying messages.

```javascript
const incomingPlex$ = server(peerManager, config);
```

#### Parameters
- **`peerManager`** (`Object`): The peer manager instance.
- **`config`** (`Object`): Configuration options for the server.
    - **`subnet`** (`string`): Subnet for IP allocation (default: `72.16.0.0/14`).
    - **`channel`** (`string`): Communication channel for signaling.
    - **`close$`** (`Observable`): Observable signaling server closure (default: `NEVER`).

#### Returns
- `Subject`: A subject for managing incoming Plex connections.

---

### `webSocketPeer`

Creates a WebSocket-based peer.

```javascript
const wsPeer = webSocketPeer(id, urlOrSocket, config);
```

#### Parameters
- **`id`** (`string`): The unique identifier for the peer.
- **`urlOrSocket`** (`string|WebSocket`): WebSocket instance or URL for the connection.
- **`config`** (`Object`): Additional WebSocket connection options.

#### Returns
- `Object`: The WebSocket-based peer instance.

---

### `webSocketServer`

Creates a WebSocket server for managing peer connections.

```javascript
const wsServer = webSocketServer(peerManager, wss, config);
```

#### Parameters
- **`peerManager`** (`Object`): The peer manager instance.
- **`wss`** (`Object`): WebSocket server instance (`ws.Server`).
- **`config`** (`Object`): Configuration options.
    - **`close$`** (`Observable`): Observable signaling server closure (default: `NEVER`).
    - **`wsConfig`** (`Object`): Additional WebSocket connection options.
    - **`server$`** (`Subject`): Existing server subject (default: new server created using `server`).

#### Returns
- `Subject`: The subject for managing server peer connections.

---

## License

This library is licensed under the [MIT License](LICENSE).