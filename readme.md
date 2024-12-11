# rxprotoplex-peers

A robust library for managing WebSocket and WebRTC signaling, socket multiplexing, and peer-to-peer communication. Designed with a reactive architecture leveraging RxJS and Protoplex, `rxprotoplex-peers` simplifies complex networking scenarios.

## Alpha !!!
Testing and implementation of ping-pong (or user supplied) for connection health still in the works.
As well, a dependency is giving off sirens about being dangerous due to ip package (ip SSRF improper categorization in isPublic ). This library really doesn't 
use that feature of the webrtc library and I'm not concerned about it for my use case.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [WebSocket Network Interfaces](#websocket-network-interfaces)
    - [addWebSocketNetworkInterface](#addwebsocketnetworkinterface)
    - [closeInterface](#closeinterface)
    - [selectInterfaceByIp$](#selectinterfacebyip)
    - [networkInterfaceConnected$](#networkinterfaceconnected)
  - [WebRTC Signaling](#webrtc-signaling)
    - [webrtcSignalingRelay](#webrtcsignalingrelay)
  - [Socket Management](#socket-management)
    - [connect](#connect)
    - [listenOnSocket$](#listenonsocket)
    - [connectStream$](#connectstream)
    - [closeSocket](#closesocket)
    - [closeSocketsOfNetworkInterface](#closesocketsofnetworkinterface)
  - [WebSocket Utilities](#websocket-utilities)
    - [webSocketServer](#websocketserver)
    - [getWebSocketURL](#getwebsocketurl)
  - [Helper Methods](#helper-methods)
    - [idOf](#idof)
    - [receiveIce](#receiveice)
- [License](#license)

---

## Installation

Install this library using your preferred package manager:

```bash
npm install rxprotoplex-peers
```

---

## Usage

### WebSocket Network Interfaces

#### `addWebSocketNetworkInterface`

Adds a WebSocket network interface for communication.

```javascript
const nicId = addWebSocketNetworkInterface(url, config);
```

**Parameters:**
- `url` (string): The WebSocket server URL.
- `config` (object): Configuration options for the network interface.

**Returns:**
- `string`: The ID of the created network interface.

---

#### `closeInterface`

Closes a WebSocket network interface and all associated sockets.

```javascript
closeInterface(interfaceId, error);
```

**Parameters:**
- `interfaceId` (string | object): The interface ID or object to close.
- `error` (Error, optional): Error to propagate during closure.

---

#### `selectInterfaceByIp$`

Observable that emits the interface matching the specified IP.

```javascript
selectInterfaceByIp$(ip).subscribe(iface => console.log(iface));
```

**Parameters:**
- `ip` (string): The IP address to search for.

**Returns:**
- `Observable<object>`: Emits the matching interface.

---

#### `networkInterfaceConnected$`

Emits when a network interface is connected and verified.

```javascript
networkInterfaceConnected$(id).subscribe(iface => console.log('Connected:', iface));
```

**Parameters:**
- `id` (string): The ID of the network interface.

**Returns:**
- `Observable<object>`: Emits the connected and verified interface.

---

### WebRTC Signaling

#### `webrtcSignalingRelay`

Manages WebRTC signaling and ICE candidate relaying.

```javascript
const signaling = webrtcSignalingRelay(peerManager, socket);
```

**Parameters:**
- `peerManager` (object): Manages peer connections.
- `socket` (object): Associated socket instance.

**Returns:**
- `object`: WebRTC signaling methods as RPC.

---

### Socket Management

#### `connect`

Establishes a connection between two interfaces.

```javascript
connect(localIp, remoteIp);
```

**Parameters:**
- `localIp` (string): Local interface IP.
- `remoteIp` (string): Remote interface IP.

---

#### `listenOnSocket$`

Listens on a specific channel for incoming connections.

```javascript
listenOnSocket$(ip, channel).subscribe(socket => console.log(socket));
```

**Parameters:**
- `ip` (string): IP address to listen on.
- `channel` (string): Communication channel.

**Returns:**
- `Observable<object>`: Emits incoming socket connections.

---

#### `connectStream$`

Connects to a remote socket over a specific channel.

```javascript
connectStream$(remoteIp, channel).subscribe(stream => stream.write('Hello'));
```

**Parameters:**
- `remoteIp` (string): Remote socket IP.
- `channel` (string): Communication channel.

**Returns:**
- `Observable<object>`: Emits the connected stream.

---

#### `closeSocket`

Closes a specific socket.

```javascript
closeSocket(socketId, error);
```

**Parameters:**
- `socketId` (string | object): Socket ID or object.
- `error` (Error, optional): Error to propagate during closure.

---

#### `closeSocketsOfNetworkInterface`

Closes all sockets associated with a specific network interface.

```javascript
closeSocketsOfNetworkInterface(interfaceId, error);
```

**Parameters:**
- `interfaceId` (string): Network interface ID.
- `error` (Error, optional): Error to propagate during closure.

---

### WebSocket Utilities

#### `webSocketServer`

Sets up a WebSocket server for managing connections.

```javascript
webSocketServer(wss);
```

**Parameters:**
- `wss` (WebSocketServer): WebSocket server instance.

---

#### `getWebSocketURL`

Generates a WebSocket URL for a server.

```javascript
const url = getWebSocketURL(wss);
```

**Parameters:**
- `wss` (WebSocketServer): WebSocket server instance.

**Returns:**
- `string`: WebSocket URL.

---

### Helper Methods

#### `idOf`

Retrieves the ID of an entity.

```javascript
const id = idOf(entity);
```

**Parameters:**
- `entity` (object): Entity object.

**Returns:**
- `string`: Entity ID.

---

#### `receiveIce`

Processes and applies an ICE candidate.

```javascript
receiveIce(socketIp, candidate);
```

**Parameters:**
- `socketIp` (string): Sending socket IP.
- `candidate` (object): ICE candidate data.

---

## License

This library is licensed under the [MIT License](LICENSE).

