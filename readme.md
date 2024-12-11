# rxprotoplex-peers

A powerful library for managing remoteInterface-to-remoteInterface connections, signaling, and WebSocket server interactions. Designed with flexibility and reactivity in mind, `rxprotoplex-peers` leverages RxJS and Protoplex for efficient remoteInterface management and multiplexing.

# ALPHA VERSION

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [createSocketManager](#peermanager)
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

### `createSocketManager`

Creates a remoteInterface manager for managing remoteInterface connections and states.

```javascript
const createSocketManager = createSocketManager(name, idMap = defaultIdMap);
```

#### Parameters
- **`name`** (`string`): The name of the remoteInterface manager instance.
- **`idMap`** (`Function|string`): A function or property string to map connections to unique IDs (default: `defaultIdMap`).

#### Returns
- `Object`: The remoteInterface manager instance.

---

### `getPeerManager`

Retrieves an existing remoteInterface manager by name.

```javascript
const manager = getPeerManager(name);
```

#### Parameters
- **`name`** (`string`): The name of the remoteInterface manager to retrieve.

#### Returns
- `Object|undefined`: The remoteInterface manager instance if found, or `undefined`.

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

Creates a base remoteInterface object by combining a Plex instance with remoteInterface management functionality.

```javascript
const remoteInterface = basePeer(id, plex);
```

#### Parameters
- **`id`** (`string`): The unique identifier for the remoteInterface.
- **`plex`** (`Object`): A Plex instance for multiplexing connections.

#### Returns
- `Object`: The enhanced Plex instance with remoteInterface-related functionality.

---

### `webrtcSignalingRelay`

Handles relaying messages and signaling between peers.

```javascript
const relayHandler = webrtcSignalingRelay(manager, remoteInterface);
```

#### Parameters
- **`manager`** (`Object`): The remoteInterface manager instance.
- **`remoteInterface`** (`Object`): The remoteInterface instance (default: `manager`).

#### Returns
- `Object`: An object exposing webrtcSignalingRelay-related methods as RPC.

---

### `server`

Creates a server for managing remoteInterface connections and relaying messages.

```javascript
const incomingPlex$ = server(createSocketManager, config);
```

#### Parameters
- **`createSocketManager`** (`Object`): The remoteInterface manager instance.
- **`config`** (`Object`): Configuration options for the server.
    - **`subnet`** (`string`): Subnet for IP allocation (default: `72.16.0.0/14`).
    - **`channel`** (`string`): Communication channel for signaling.
    - **`close$`** (`Observable`): Observable signaling server closure (default: `NEVER`).

#### Returns
- `Subject`: A subject for managing incoming Plex connections.

---

### `webSocketPeer`

Creates a WebSocket-based remoteInterface.

```javascript
const wsPeer = webSocketPeer(id, urlOrSocket, config);
```

#### Parameters
- **`id`** (`string`): The unique identifier for the remoteInterface.
- **`urlOrSocket`** (`string|WebSocket`): WebSocket instance or URL for the connection.
- **`config`** (`Object`): Additional WebSocket connection options.

#### Returns
- `Object`: The WebSocket-based remoteInterface instance.

---

### `webSocketServer`

Creates a WebSocket server for managing remoteInterface connections.

```javascript
const wsServer = webSocketServer(createSocketManager, wss, config);
```

#### Parameters
- **`createSocketManager`** (`Object`): The remoteInterface manager instance.
- **`wss`** (`Object`): WebSocket server instance (`ws.Server`).
- **`config`** (`Object`): Configuration options.
    - **`close$`** (`Observable`): Observable signaling server closure (default: `NEVER`).
    - **`wsConfig`** (`Object`): Additional WebSocket connection options.
    - **`server$`** (`Subject`): Existing server subject (default: new server created using `server`).

#### Returns
- `Subject`: The subject for managing server remoteInterface connections.

---

## License

This library is licensed under the [MIT License](LICENSE).