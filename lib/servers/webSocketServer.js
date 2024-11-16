import {server} from "./server.js";
import {fromEvent, map, NEVER, shareReplay, take, takeUntil} from "rxjs";
import {webSocketPeer} from "../peer/websocket-peer.js";

/**
 * Creates a WebSocket server for managing peer connections using a peer manager.
 *
 * @param {Object} peerManager - The peer manager instance to manage peer connections and states.
 * @param {Object} wss - The WebSocket server instance (`ws.Server`) to handle WebSocket connections.
 * @param {Object} [config={}] - Configuration options for the WebSocket server.
 * @param {Observable} [config.close$=NEVER] - An observable that signals the server to close.
 * @param {Object} [config.wsConfig] - Additional configuration options for WebSocket connections.
 * @param {Subject} [config.server$] - An existing server subject. Defaults to a new server created using the `server` function.
 * @param {Object} [config.plexConfig] - Additional configuration options for Plex instances.
 * @returns {Subject} A subject for managing server peer connections.
 */
const webSocketServer = (peerManager, wss, config = {}) => {
    const {
        close$ = NEVER,
        wsConfig,
        server$: server$ = server(peerManager, config),
        ...plexConfig
    } = config;

    /**
     * An observable that emits when the WebSocket server closes.
     * @type {Observable}
     */
    const wssClose$ = fromEvent(wss, "close").pipe(take(1), shareReplay(1));
    wssClose$.pipe(take(1)).subscribe();

    // Handle new WebSocket connections and create peers.
    fromEvent(wss, "connection").pipe(
        takeUntil(close$),
        takeUntil(wssClose$),
        map(([socket]) =>
            webSocketPeer(server$.ipAllocator.allocateIp(), socket, { wsConfig, ...plexConfig })
        )
    ).subscribe(server$);

    return server$;
};


export {webSocketServer};