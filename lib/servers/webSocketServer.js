import {server} from "./server.js";
import {fromEvent, map, NEVER, shareReplay, take, takeUntil} from "rxjs";
import {fromWebSocket} from "rxprotoplex-websocket";

/**
 * Creates a WebSocket server for managing socket connections using a socket manager.

 * @param {Object} wss - The WebSocket server instance (`ws.Server`) to handle WebSocket connections.
 * @param {Object} [config={}] - Configuration options for the WebSocket server.
 * @param {Observable} [config.close$=NEVER] - An observable that signals the server to close.
 * @param {Subject} [config.server$] - An existing server subject. Defaults to a new server created using the `server` function.
 * @param {Object} [config.plexConfig] - Additional configuration options for Plex instances.
 * @returns {Subject} A subject for managing server socket connections.
 */
const webSocketServer = (wss, config = {}) => {
    const {
        close$ = NEVER,
        server$: server$ = server(config),
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
        map(([socket]) => fromWebSocket(socket, plexConfig))
    ).subscribe(server$);

    return server$;
};


export {webSocketServer};