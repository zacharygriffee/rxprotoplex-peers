import {catchError, EMPTY, filter, fromEvent, map, mergeAll, mergeMap, ReplaySubject, takeWhile, tap,} from "rxjs";
import {duplexFromRtcDataChannel} from "../util/duplexFromRtcDataChannel.js";
import {RTCIceCandidate, RTCPeerConnection} from "get-webrtc";
import {asPlex, connect$, connectAndSend, listenAndConnection$} from "rxprotoplex";
import {nanoid} from "nanoid";
import {filterNil} from "@ngneat/elf";
import {
    addEntities, getAllEntities,
    getEntity,
    getEntityByPredicate, selectEntity,
    selectEntityByPredicate,
    selectManyByPredicate,
    updateEntities
} from "@ngneat/elf-entities";
import {selectInterfaceByIp$} from "../network-interfaces/network-interface.js";
import {socketEntitiesRef, store} from "../store.js";
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
 * Creates a new socket entity and initializes it.
 * @param {string} ifaceId - The network interface ID for the socket.
 * @param {boolean} isInitiator - Whether the socket is the initiator.
 * @param {Object} [config={}] - Configuration options for the socket.
 * @returns {string} The ID of the newly created socket.
 */
export const createSocket = (ifaceId, isInitiator, config = {}) => {
    const {
        dataChannelConfig,
        rtcPeerConfig,
        rtcIceConfig,
        ...plexConfig
    } = config;

    const id = `socket-${nanoid()}`;
    const rtc = new RTCPeerConnection(rtcPeerConfig);
    rtc.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
            console.debug(`[RTC] ICE candidate generated:`, event.candidate);
            // Send to remote peer
        } else {
            console.debug(`[RTC] ICE candidate gathering complete`);
        }
    });
    rtc.addEventListener("connectionstatechange", () => {
        console.debug(`[RTC] Connection state changed: ${rtc.connectionState}`);
    });
    rtc.addEventListener("iceconnectionstatechange", () => {
        console.debug(`[RTC] ICE connection state changed: ${rtc.iceConnectionState}`);
    });
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

    store.update(addEntities(socket, {ref: socketEntitiesRef}));


    const stopIceService = iceService(id, rtcIceConfig);
    plex.close$.subscribe(stopIceService);
    return id;
}

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
 * Handles ICE candidate generation, retention, and relaying for a socket.
 * @param {string} socketId - The socket ID.
 * @param {Object} [config={}] - Configuration options for ICE handling.
 * @returns {Function} A cleanup function to stop the ICE service.
 */
const iceService = (socketId, config = {}) => {
    const socket = store.query(getEntity(socketId, { ref: socketEntitiesRef }));
    if (!socket || !socket.rtc) {
        console.error(`[ICE Service] Socket with ID ${socketId} not found or RTCPeerConnection is missing`);
        throw new Error(`Socket with ID ${socketId} not found or RTCPeerConnection is missing`);
    }

    const {
        iceCandidateRetentionTime = 60000,
        iceCandidateRetentionCount = 20,
    } = config;

    if (!socket.ices$) {
        socket.ices$ = new ReplaySubject(iceCandidateRetentionCount, iceCandidateRetentionTime);
        console.debug(`[ICE Service] Initialized ICE ReplaySubject for socket ${socketId}`);
    }

    const unsubs = [
        // Listening for ICE candidates from the RTCPeerConnection
        fromEvent(socket.rtc, "icecandidate")
            .pipe(
                takeWhile(event => !!event.candidate), // Stop when no more candidates
                map(event => event.candidate), // Extract the candidate
                catchError(error => {
                    console.error(`[ICE Service] ICE candidate error for socket ${socketId}:`, error);
                    return EMPTY; // Ignore errors and continue
                })
            )
            .subscribe(candidate => {
                console.debug(`[ICE Service] ICE candidate generated for socket ${socketId}:`, candidate);
                socket.ices$.next(candidate);
            }),

        // Relay ICE candidates when connected
        socketOfIdConnected$(idOf(socket))
            .pipe(
                switchMap(() => {
                    console.debug(`[ICE Service] Socket ${socketId} connected. Attempting to fetch interface by IP.`);
                    return selectInterfaceByIp$(socket.ifaceId).pipe(
                        tap((iface) => console.debug(`[ICE Service] Found interface for socket ${socketId}:`, iface)),
                        mergeMap((iface) =>
                            socket.ices$.pipe(map((candidate) => [iface.rpc, candidate]))
                        )
                    );
                })
            )
            .subscribe(([rpc, candidate]) => {
                const currentSocket = store.query(getEntity(socketId, { ref: socketEntitiesRef }));
                if (!currentSocket || !currentSocket.ip) {
                    console.warn(`[ICE Service] Missing IP for socket ${socketId}. Skipping ICE relay.`);
                    return;
                }
                console.debug(`[ICE Service] Relaying ICE candidate from socket ${socketId} to ${currentSocket.ip}:`, candidate);
                rpc.notify.relayIce(currentSocket.ip, candidate);
            }),
    ];

    return () => {
        console.debug(`[ICE Service] Cleaning up ICE service for socket ${socketId}`);
        unsubs.forEach(unsub => unsub.unsubscribe());
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
 * @param {string} fromIp - The IP address of the socket to listen on.
 * @param {string} channel - The channel name.
 * @returns {Observable} An observable of incoming connections.
 */
export const listenOnSocket$ = (fromIp, channel) => {
    const listening = new Set();
    const sockets$ = store.pipe(
        selectManyByPredicate(iface => !!iface.ip && (fromIp === "0.0.0.0" || iface.ip === fromIp), {ref: socketEntitiesRef}),
        mergeAll(),
        filterNil()
    );
    return sockets$.pipe(
        mergeMap(sock => {
            if (listening.has(sock.ip)) return EMPTY;
            listening.add(sock.ip);
            return listenAndConnection$(sock.plex, channel).pipe(
                map(subSock => {
                    subSock.localIp = sock.ifaceId;
                    subSock.remoteIp = sock.ip;
                    return subSock;
                })
            )
        })
    );
}

/**
 * Sends a message to a specific IP address on a given channel.
 * @param {string} toIp - The recipient IP address.
 * @param {Buffer} message - The message to send.
 * @param {string} channel - The channel name.
 */
export const sendMessage = (toIp, message, channel) => {
    socketOfIpConnected$(toIp).subscribe(
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
        switchMap(
            socket => connect$(socket.plex, channel).pipe(
                map(subSock => {
                    subSock.localIp = localIp;
                    subSock.remoteIp = remoteIp;
                    return subSock;
                })
            )
        )
    )
}

/**
 * Closes a socket by its ID or socket object.
 * @param {string|Object} socket - The socket ID or socket object.
 * @param {Error} [withError] - An optional error to indicate the reason for closure.
 */
export const closeSocket = (socket, withError) => {
    const socketId = typeof socket === "string" ? socket : socket?.[ID_SYMBOL];
    const _socket = store.query(getEntity(socketId, {ref: socketEntitiesRef}));
    if (!_socket) { throw new TypeError("Invalid socket"); }
    _socket.plex.close$.next(withError);
}

/**
 * Closes all sockets associated with a specific network interface.
 * @param {string} ifaceId - The network interface ID.
 * @param {Error} [withError] - An optional error to indicate the reason for closure.
 */
export const closeSocketsOfNetworkInterface = (ifaceId, withError) => {
    store.query(getAllEntities({ref: socketEntitiesRef}))
        .filter(o => o.ifaceId === ifaceId)
        .forEach(sock => closeSocket(sock, withError));
}

/**
 * Emits connected sockets and optionally filters them by IP address.
 * @param {string} [ip] - Optional IP address to filter sockets.
 * @returns {Observable} An observable of connected sockets.
 */
export const socketOfIpConnected$ = (ip) => {
    const emittedSockets = new Set();

    return store.pipe(
        selectManyByPredicate(
            ({ connected }) => connected === true,
            { ref: socketEntitiesRef }
        ),
        tap(currentArray => {
            // Clean up emittedSockets to match current array
            const currentIds = new Set(currentArray.map(idOf));
            for (const id of emittedSockets) {
                if (!currentIds.has(id)) {
                    emittedSockets.delete(id); // Remove stale sockets
                }
            }
        }),
        mergeAll(), // Flatten the array of sockets into individual emissions
        filter(socket => {
            const socketId = idOf(socket);
            if (emittedSockets.has(socketId)) {
                return false; // Skip already emitted sockets
            }
            emittedSockets.add(socketId); // Track new socket
            return true;
        }),
        ip ? filter(socket => socket.ip === ip) : tap() // Conditionally filter by IP
    );
};
