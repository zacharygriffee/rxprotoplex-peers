import {server} from "./server.js";
import {catchError, EMPTY, finalize, fromEvent, map, merge, NEVER, share, shareReplay, take, takeUntil} from "rxjs";
import {fromWebSocket} from "rxprotoplex-websocket";
import {destroy} from "rxprotoplex";
import {onStoreReset$} from "../store.js";

/**
 * Creates a WebSocket server for managing socket connections using a socket manager.

 * @param {Object} wss - The WebSocket server instance (`ws.Server`) to handle WebSocket connections.
 * @param {Object} [config={}] - Configuration options for the WebSocket server.
 * @param {Observable} [config.close$=NEVER] - An observable that signals the server to close.
 * @param {Subject} [config.server$] - An existing server subject. Defaults to a new server created using the `server` function.
 * @param {Object} [config.plexConfig] - Additional configuration options for Plex instances.
 * @returns {Subject} A subject for managing server socket connections.
 */
export const webSocketServer = (wss, config = {}) => {
    const connections = new Set();
    const {
        server$: server$ = server(config),
        ...plexConfig
    } = config;

    const close$ = server$.close$;
    const wssClose$ = merge(onStoreReset$, server$.close$, fromEvent(wss, "close"))
        .pipe(take(1), share());

    wssClose$.subscribe(() => {
        console.debug("[webSocketServer] Server closing, cleaning up connections.");
        wss.close(); // Prevent new connections
        connections.forEach((s) => destroy(s));
        connections.clear();
    });

    fromEvent(wss, "connection").pipe(
        takeUntil(close$),
        takeUntil(wssClose$),
        map(([socket]) => {
            console.debug("[webSocketServer] New WebSocket connection received.");
            const plex = fromWebSocket(socket, plexConfig);
            connections.add(plex);
            return plex;
        }),
        catchError((err) => {
            console.error("[webSocketServer] Connection error:", err);
            return EMPTY; // Ignore errors and continue
        }),
        finalize(() => {
            console.debug("[webSocketServer] Finalized connection handling.");
        })
    ).subscribe(server$);

    return server$;
};
