import {
    catchError,
    EMPTY,
    filter,
    fromEvent,
    map,
    mergeAll,
    mergeMap,
    ReplaySubject,
    take, takeUntil,
    takeWhile,
    tap,
} from "rxjs";
import {duplexFromRtcDataChannel} from "../util/duplexFromRtcDataChannel.js";
import {RTCIceCandidate, RTCPeerConnection} from "get-webrtc";
import {asPlex, connect$, connectAndSend, destroy, listenAndConnection$} from "rxprotoplex";
import {nanoid} from "nanoid";
import {filterNil} from "@ngneat/elf";
import {
    addEntities,
    deleteEntities,
    getAllEntities,
    getEntity,
    getEntityByPredicate,
    selectEntityByPredicate,
    selectManyByPredicate,
    updateEntities
} from "@ngneat/elf-entities";
import {selectInterfaceByIp$} from "../network-interfaces/network-interface.js";
import {onStoreReset$, socketEntitiesRef, store} from "../store.js";
import {ID_SYMBOL} from "../constants.js";
import {idOf} from "./idOf.js";
import {switchMap} from "rxjs/operators";

/**
 * Selects a socket entity by its IP address.
 * @param {string} ip - The IP address of the socket.
 * @returns {Observable} An observable of the selected socket entity.
 */
export const selectSocketByIp$ = (ip) => store.pipe(
    selectEntityByPredicate(({ip: _ip}) => _ip === ip, {ref: socketEntitiesRef})
);

/**
 * Retrieves a socket entity by its IP address.
 * @param {string} ip - The IP address of the socket.
 * @returns {Object|null} The socket entity or null if not found.
 */
export const getSocketByIp = (ip) => store.query(getEntityByPredicate(o => o.ip === ip, {ref: socketEntitiesRef}));

/**
 * Retrieves the IP address of a socket by its ID.
 * @param {string} id - The socket ID.
 * @returns {string|null} The IP address of the socket or null if not found.
 */
export const getSocketIpFromId = (id) => {
    return store.query(getEntity(id, {ref: socketEntitiesRef}))?.ip;
};
/**
 * Creates a new socket entity, initializes it, and manages its lifecycle.
 *
 * @param {string} ifaceId - The network interface ID for the socket.
 * @param {boolean} isInitiator - Whether the socket is the initiator.
 * @param {Object} [config={}] - Configuration options for the socket.
 * @param {Object} [config.dataChannelConfig] - Configuration for the RTC data channel.
 * @param {Object} [config.rtcPeerConfig] - Configuration for the RTCPeerConnection.
 * @param {Object} [config.rtcIceConfig] - Configuration for ICE service.
 * @returns {string} The ID of the newly created socket.
 */
export const createSocket = (ifaceId, isInitiator, config = {}) => {
    const {
        dataChannelConfig,
        rtcPeerConfig,
        rtcIceConfig,
        ...plexConfig
    } = config;

    // Generate a unique ID for the socket
    const id = `socket-${nanoid()}`;
    console.debug(`[createSocket] Creating socket with ID: ${id}`);

    // Initialize RTCPeerConnection
    const rtc = new RTCPeerConnection(rtcPeerConfig);

    // Setup Plex for multiplexing data over the RTC data channel
    const plex = asPlex(
        duplexFromRtcDataChannel(
            isInitiator,
            rtc.createDataChannel("wire", {
                negotiated: true,
                id: 0,
                ...dataChannelConfig
            })
        ),
        plexConfig
    );

    // Define the socket entity
    const socket = {
        ifaceId,
        [ID_SYMBOL]: id,
        ip: null,
        get plex() {
            return plex;
        },
        get rtc() {
            return rtc;
        },
        ices$: null,
        ices: [],
        connected: false
    };

    // Add the socket to the store
    store.update(addEntities(socket, { ref: socketEntitiesRef }));
    console.debug(`[createSocket] Added socket to store:`, socket);

    // Start the ICE service for the socket
    const stopIceService = iceService(id, rtcIceConfig);

    // Handle cleanup on Plex closure
    plex.close$.subscribe(() => {
        console.debug(`[createSocket] Cleaning up socket with ID: ${id}`);
        stopIceService();
        rtc.close();
    });

    return id;
};


/**
 * Emits the connected state of a socket entity by its ID.
 * @param {string} socketId - The socket ID.
 * @returns {Observable} An observable of the connected socket entity.
 */
export const socketOfIdConnected$ = (socketId) => {
    console.debug(`[Connected$] Listening for connection state of socket ${socketId}`);
    return store.pipe(
        selectManyByPredicate((e) => {
            console.debug(`[Connected$] Checking entity for socket ${socketId}:`, e);
            return !!e.connected && (!socketId || idOf(e) === socketId);
        }, { ref: socketEntitiesRef }),
        mergeAll(),
        tap(() => console.debug(`[Connected$] Entity for socket ${socketId} is connected`)),
        filterNil()
    );
};

/**
 * Updates the IP address of a socket entity.
 * @param {string} socketId - The socket ID.
 * @param {string} socketIp - The new IP address to assign.
 */
export const updateSocketIp = (socketId, socketIp) => {
    console.debug(`[Store Update] Assigning IP ${socketIp} to socket ${socketId}`);
    store.update(updateEntities(socketId, { ip: socketIp }, { ref: socketEntitiesRef }));
};
/**
 * Retrieves the RTCPeerConnection instance of a socket by its ID.
 * @param {string} socketId - The socket ID.
 * @returns {RTCPeerConnection|null} The RTCPeerConnection instance or null if not found.
 */
export const getSocketRtc = (socketId) => store.query(getEntity(socketId, {ref: socketEntitiesRef}))?.rtc;
/**
 * Marks a socket as connected in the store.
 * @param {string} socketId - The socket ID.
 */
export const setSocketConnected = (socketId) => {
    console.debug(`[Store Update] Setting socket ${socketId} as active`);
    store.update(updateEntities(socketId, { connected: true }, { ref: socketEntitiesRef }));
};
/**
 * Manages ICE candidate generation, retention, and relaying for a socket.
 *
 * @param {string} socketId - The ID of the socket to manage.
 * @param {Object} [config={}] - Configuration options for ICE handling.
 * @param {number} [config.iceCandidateRetentionTime=60000] - Maximum retention time for ICE candidates in milliseconds.
 * @param {number} [config.iceCandidateRetentionCount=20] - Maximum number of ICE candidates to retain.
 * @returns {Function} A cleanup function to stop the ICE service and release resources.
 */
const iceService = (socketId, config = {}) => {
    const {
        iceCandidateRetentionTime = 60000,
        iceCandidateRetentionCount = 20,
    } = config;

    const socket = store.query(getEntity(socketId, { ref: socketEntitiesRef }));
    if (!socket || !socket.rtc) {
        console.error(`[ICE Service] Socket with ID ${socketId} is missing or invalid.`);
        throw new Error(`Socket with ID ${socketId} is not available or has no RTCPeerConnection.`);
    }

    // Initialize ICE ReplaySubject for storing and relaying candidates.
    if (!socket.ices$) {
        socket.ices$ = new ReplaySubject(iceCandidateRetentionCount, iceCandidateRetentionTime);
        console.debug(`[ICE Service] Initialized ICE ReplaySubject for socket ${socketId}`);
    }

    const subscriptions = [
        // Listen for ICE candidates from the RTCPeerConnection.
        fromEvent(socket.rtc, "icecandidate").pipe(
            takeUntil(onStoreReset$),
            takeWhile(event => !!event.candidate), // Continue only if a candidate is available.
            map(event => event.candidate),        // Extract the ICE candidate.
            catchError(error => {
                console.error(`[ICE Service] Error while generating ICE candidate for socket ${socketId}:`, error);
                return EMPTY; // Continue despite errors.
            })
        ).subscribe(candidate => {
            console.debug(`[ICE Service] ICE candidate generated for socket ${socketId}:`, candidate);
            socket.ices$.next(candidate);
        }),

        // Relay ICE candidates once the socket is connected.
        socketOfIdConnected$(idOf(socket)).pipe(
            takeUntil(onStoreReset$),
            switchMap(() => {
                console.debug(`[ICE Service] Socket ${socketId} is connected. Fetching interface by IP.`);
                return selectInterfaceByIp$(socket.ifaceId).pipe(
                    tap(iface => console.debug(`[ICE Service] Interface found for socket ${socketId}:`, iface)),
                    mergeMap(iface =>
                        socket.ices$.pipe(map(candidate => [iface.rpc, candidate]))
                    )
                );
            })
        ).subscribe(([rpc, candidate]) => {
            const currentSocket = store.query(getEntity(socketId, { ref: socketEntitiesRef }));
            if (!currentSocket?.ip) {
                console.warn(`[ICE Service] Missing IP for socket ${socketId}. Skipping ICE relay.`);
                return;
            }
            console.debug(`[ICE Service] Relaying ICE candidate from socket ${socketId} to ${currentSocket.ip}:`, candidate);
            rpc.notify.relayIce(currentSocket.ip, candidate);
        }),
    ];

    // Cleanup function to stop the ICE service and release resources.
    return () => {
        console.debug(`[ICE Service] Cleaning up ICE service for socket ${socketId}`);
        subscriptions.forEach(subscription => subscription.unsubscribe());
        if (socket.ices$) {
            socket.ices$.complete();
            socket.ices$ = null;
        }
    };
};


/**
 * Receives an ICE candidate and adds it to the corresponding socket's RTCPeerConnection.
 * @param {string} socketIp - The IP address of the socket.
 * @param {Object} candidate - The ICE candidate object.
 */
export const receiveIce = (socketIp, candidate) => {
    console.debug(`[ICE Service] Received ICE candidate from IP: ${socketIp}`, candidate);
    const socket = getSocketByIp(socketIp);
    if (!socket) {
        console.warn(`[ICE Service] No socket found for IP: ${socketIp}`);
        return;
    }
    const { rtc } = socket;
    rtc.addIceCandidate(new RTCIceCandidate(candidate))
        .then(() => console.debug(`[ICE Service] ICE candidate successfully added for socket ${socketIp}`))
        .catch((e) => console.error(`[ICE Service] Failed to add ICE candidate for IP ${socketIp}:`, e));
};

/**
 * Listens for connections on a specific socket channel.
 *
 * @param {string} fromIp - The IP address of the socket to listen on. Use "0.0.0.0" to listen on all sockets.
 * @param {string} channel - The channel name to listen on.
 * @returns {Observable} An observable emitting connections on the specified channel.
 */
export const listenOnSocket$ = (fromIp, channel) => {
    const activeListeners = new Set();

    // Clear active listeners on store reset
    onStoreReset$.pipe(take(1)).subscribe(() => activeListeners.clear());

    return store.pipe(
        // Filter sockets based on the IP address
        selectManyByPredicate(
            iface => !!iface.ip && (fromIp === "0.0.0.0" || iface.ip === fromIp),
            { ref: socketEntitiesRef }
        ),
        takeUntil(onStoreReset$), // Stop listening when the store is reset
        mergeAll(),               // Flatten the array of sockets into individual emissions
        filterNil(),              // Exclude null or undefined sockets
        mergeMap(sock => {
            // Avoid re-listening on sockets that are already being listened to
            if (activeListeners.has(sock.ip)) return EMPTY;
            activeListeners.add(sock.ip);

            // Listen for connections on the specified channel
            return listenAndConnection$(sock.plex, channel).pipe(
                map(subSock => {
                    // Add metadata for local and remote IP addresses
                    subSock.localIp = sock.ifaceId;
                    subSock.remoteIp = sock.ip;
                    return subSock;
                })
            );
        })
    );
};


/**
 * Sends a message to a specific IP address on a given channel.
 * @param {string} toIp - The recipient IP address.
 * @param {Buffer} message - The message to send.
 * @param {string} channel - The channel name.
 */
export const sendMessage = (toIp, message, channel) => {
    socketOfIpConnected$(toIp).pipe(takeUntil(onStoreReset$)).subscribe(
        (socket) => {
            connectAndSend(socket.plex, channel)(message);
        }
    );
};

/**
 * Connects to a remote socket stream on a specified channel.
 * @param {string} remoteIp - The IP address of the remote socket.
 * @param {string} channel - The channel name.
 * @param {string} localIp - The IP address of the local socket.
 * @returns {Observable} An observable of the connected stream.
 */
export const connectStream$ = (remoteIp, channel, localIp) => {
    return socketOfIpConnected$(remoteIp).pipe(
        takeUntil(onStoreReset$),
        switchMap(
            socket => {
                console.log(`Connecting to socket ${remoteIp}`)
                return connect$(socket.plex, channel).pipe(
                    map(subSock => {
                        subSock.localIp = localIp;
                        subSock.remoteIp = remoteIp;
                        return subSock;
                    })
                );
            }
        )
    )
}

/**
 * Closes a socket by its ID or socket object.
 *
 * @param {string|Object} socket - The socket ID or socket object to close.
 * @param {Error} [withError] - An optional error indicating the reason for closure.
 * @throws {TypeError} If the socket is invalid or does not exist in the store.
 */
export const closeSocket = (socket, withError) => {
    const socketId = typeof socket === "string" ? socket : socket?.[ID_SYMBOL];
    const targetSocket = store.query(getEntity(socketId, { ref: socketEntitiesRef }));

    if (!targetSocket) {
        throw new TypeError(`[closeSocket] Invalid or non-existent socket: ${socketId}`);
    }

    // Remove the socket from the store and clean up its resources
    store.update(deleteEntities(socketId, { ref: socketEntitiesRef }));
    destroy(targetSocket.plex, withError);
    targetSocket?.rtc?.close?.();
    targetSocket?.rpc?.close?.();

    console.debug(`[closeSocket] Closed socket with ID: ${socketId}`);
};

/**
 * Closes all sockets associated with a specific network interface.
 *
 * @param {string|Object} ifaceId - The network interface ID or object.
 * @param {Error} [withError] - An optional error indicating the reason for closure.
 */
export const closeSocketsOfNetworkInterface = (ifaceId, withError) => {
    const targetId = typeof ifaceId === "string" ? ifaceId : ifaceId?.ip || ifaceId?.[ID_SYMBOL];

    if (!targetId) {
        console.warn("[closeSocketsOfNetworkInterface] Invalid network interface identifier provided.");
        return;
    }

    const socketsToClose = store.query(getAllEntities({ ref: socketEntitiesRef }))
        .filter(socket => socket.ifaceId === targetId || socket.ip === targetId);

    socketsToClose.forEach(sock => closeSocket(sock, withError));

    console.debug(`[closeSocketsOfNetworkInterface] Closed ${socketsToClose.length} sockets for interface: ${targetId}`);
};


/**
 * Emits connected sockets and optionally filters them by IP address.
 *
 * @param {string} [ip] - Optional IP address to filter sockets.
 * @returns {Observable} An observable of connected sockets.
 */
export const socketOfIpConnected$ = (ip) => {
    const emittedSockets = new Set();

    // Clear the emitted sockets cache on store reset
    onStoreReset$.pipe(take(1)).subscribe(() => {
        emittedSockets.clear();
        console.debug("[socketOfIpConnected$] Reset emitted sockets cache due to store reset.");
    });

    return store.pipe(
        selectManyByPredicate(
            ({ connected }) => connected === true,
            { ref: socketEntitiesRef }
        ),
        takeUntil(onStoreReset$),
        tap((currentArray) => {
            // Synchronize the emitted sockets with the current state
            const currentIds = new Set(currentArray.map(idOf));
            for (const id of emittedSockets) {
                if (!currentIds.has(id)) {
                    emittedSockets.delete(id); // Remove stale sockets
                    console.debug(`[socketOfIpConnected$] Removed stale socket: ${id}`);
                }
            }
        }),
        mergeAll(), // Flatten the array of sockets into individual emissions
        filter((socket) => {
            const socketId = idOf(socket);
            if (emittedSockets.has(socketId)) {
                console.debug(`[socketOfIpConnected$] Skipping already emitted socket: ${socketId}`);
                return false; // Skip already emitted sockets
            }
            emittedSockets.add(socketId); // Track new socket
            console.debug(`[socketOfIpConnected$] Emitting new socket: ${socketId}`);
            return true;
        }),
        ip ? filter((socket) => socket.ip === ip) : tap() // Optionally filter by IP
    );
};

