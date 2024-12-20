import {fromWebSocket} from "rxprotoplex-websocket";
import {connectAndRpc$} from "rxprotoplex-rpc";
import {distinctUntilChanged, filter, mergeAll, of, take, takeUntil, tap} from "rxjs";
import {
    addEntities,
    deleteEntities,
    getEntity,
    getEntityByPredicate,
    selectAllEntities,
    selectEntity,
    selectManyByPredicate,
    updateEntities
} from "@ngneat/elf-entities";
import {filterNil} from "@ngneat/elf";
import {destroy, withHandshake} from "rxprotoplex";
import {nanoid} from "nanoid";
import {
    closeSocketsOfNetworkInterface,
    createSocket,
    getSocketByIp,
    getSocketRtc,
    receiveIce,
    setSocketConnected,
    updateSocketIp
} from "../socket/socket.js";
import {interfacesEntitiesRef, onStoreReset$, store} from "../store.js";
import {ID_SYMBOL} from "../constants.js";
import {idOf} from "../socket/idOf.js";
import {isIpInSubnet, isLoopbackIp} from "../util/ip.js";
import {lo} from "./local-host-interface.js";
/**
 * Adds a new WebSocket-based network interface.
 * @param {string} url - The WebSocket server URL.
 * @param {Object} [config={}] - Configuration options for the interface.
 * @param {Object} [config.rpcConfig] - Configuration for RPC signaling.
 * @returns {string} The ID of the created network interface.
 */
export const addWebSocketNetworkInterface = (url, config = {}) => {
    const {
        rpcConfig
    } = config;
    const id = `iface_ws_${nanoid()}`;

    const plex = connectToWebSocketBootstrap(url, id, config);
    const iface = {
        [ID_SYMBOL]: id,
        ip: null,
        rpc: null,
        plex
    };

    store.update(addEntities(iface, {ref: interfacesEntitiesRef}));
    attachSignalRpc(id, rpcConfig);
    return id;
}

/**
 * Closes a network interface and its associated sockets.
 * @param {string|Object} iface - The interface ID or interface object to close.
 * @param {Error} [withError] - Optional error to pass during closure.
 */
export const closeInterface = (iface, withError) => {
    const ifaceId = typeof iface === "string" ? iface : iface?.[ID_SYMBOL];
    const _iface = store.query(getEntity(ifaceId, {ref: interfacesEntitiesRef})) || store.query(getEntityByPredicate(o => o.ip === ifaceId));
    if (!_iface) { throw new Error("boo") }
    destroy(_iface.plex, withError);
    closeSocketsOfNetworkInterface(_iface, withError);
    store.update(deleteEntities(ifaceId, {ref: interfacesEntitiesRef}));
}
/**
 * Emits the network interface associated with a specific IP address.
 * @param {string} ip - The IP address of the network interface.
 * @returns {Observable} An observable emitting the matching interface.
 */
export const selectInterfaceByIp$ = (ip) => isLoopbackIp(ip) ? of(lo) :
    store.pipe(
        takeUntil(onStoreReset$),
        tap(() => console.debug(`[selectInterfaceByIp$] Listening for interface with IP ${ip}`)),
        selectManyByPredicate(({ ip: _ip }) => {
            console.debug(`[selectInterfaceByIp$] Checking interface with IP ${_ip}`);
            return isIpInSubnet(_ip, ip);
        }, { ref: interfacesEntitiesRef }),
        mergeAll(),
        filterNil(),
        tap((iface) => console.debug(`[selectInterfaceByIp$] Found interface:`, iface))
    );

export const selectAllInterfaces$ = (onlyIpChanges = true) =>
    store.pipe(
        takeUntil(onStoreReset$),
        selectAllEntities({ref: interfacesEntitiesRef}),
        onlyIpChanges ? distinctUntilChanged((a,b) => a.map(o => o.ip || "").sort().join("|") === b.map(o => o.ip || "").sort().join("|")) : tap()
    );

export const getInterfaceOfId = (ifaceId) => {
    return ifaceId === "lo" ? lo : store.query(getEntity(ifaceId, {ref: interfacesEntitiesRef}));
}

/**
 * Emits when a network interface is connected and verified.
 * @param {string} id - The ID of the network interface.
 * @returns {Observable} An observable emitting the connected interface.
 */
export const networkInterfaceConnected$ = (id) => id === "lo" ? of(lo) : store.pipe(
    selectEntity(id, {ref: interfacesEntitiesRef}),
    filter(iface => !!iface && !!iface.ip && !!iface.verified)
);

/**
 * Connects to a WebSocket bootstrap server.
 * @param {string} url - The WebSocket server URL.
 * @param {string} ifaceId - The ID of the interface.
 * @param {Object} [config={}] - Configuration for the connection.
 * @returns {Observable} An observable representing the connection state.
 */
const connectToWebSocketBootstrap = (url, ifaceId, config = {}) => {
    return fromWebSocket(url, withHandshake({
        handshake: "", // TODO: token auth, leave blank
        handshakeEncoding: "utf8",
        onhandshake:
            (connectionId) => {
                store.update(updateEntities(ifaceId, {connectionId}, {ref: interfacesEntitiesRef}))
                return true;
            }
    }, config));
}

/**
 * Attaches signaling RPC to a network interface for WebRTC communication.
 * @param {string} ifaceId - The ID of the network interface.
 * @param {Object} [config={}] - Configuration for the signaling RPC.
 * @param {string} [config.channel] - The signaling channel name.
 * @param {number} [config.timeout=10000] - Timeout duration for RPC operations.
 */
const attachSignalRpc = (ifaceId, config = {}) => {
    const {
        channel,
        timeout = 10000
    } = config;
    let iface = store.query(getEntity(ifaceId, {ref: interfacesEntitiesRef}));
    if (!iface) throw new Error(`Interface not found ${ifaceId}`);

    connectAndRpc$(iface.plex, channel, {timeout: timeout}).pipe(
        takeUntil(iface.plex.close$),
        take(1)
    ).subscribe(rpc => {
        iface.plex.close$.subscribe(() => {
            rpc.close();
        });
        iface = store.query(getEntity(ifaceId, {ref: interfacesEntitiesRef}));
        rpc.expose({
            receiveUpgrade(ip) {
                rpc.expose(signalRpcMethods(ifaceId, ip));
                store.update(
                    updateEntities(ifaceId, { verified: true, ip }, { ref: interfacesEntitiesRef })
                );
            }
        })
        attachRpcToInterface(ifaceId, rpc);
    });
};

/**
 * Connects a specific local interface to a remote peer.
 *
 * @param {string} localIp - The IP address of the local network interface.
 * @param {string} remoteIp - The IP address of the remote peer.
 * @returns {Subscription} A subscription for the connection operation.
 * @throws {Error} Throws an error if localIp or remoteIp is not provided.
 */
export const connect = (localIp, remoteIp) => {
    if (!localIp || !remoteIp) {
        throw new Error("Both localIp and remoteIp must be provided");
    }
    if (isLoopbackIp(localIp) && isLoopbackIp(remoteIp)) {
        return {unsubscribe() {}};
    }
    return selectInterfaceByIp$(localIp)
        .pipe(
            filterNil(),
            takeUntil(onStoreReset$),
            filter(iface => !isLoopbackIp(iface.ip))
        )
        .subscribe(iface => iface.rpc.notify.connect(remoteIp));
};

/**
 * Connects all available local interfaces to a specified remote peer.
 *
 * @param {string} remoteIp - The IP address of the remote peer.
 * @returns {Subscription} A subscription for the connection operation.
 * @throws {Error} Throws an error if remoteIp is not provided.
 */
export const connectToAllInterfaces = (remoteIp) => {
    if (!remoteIp) {
        throw new Error("remoteIp must be provided");
    }
    if (isLoopbackIp(remoteIp)) {
        return {unsubscribe() {}};
    }
    return store.pipe(
        selectAllEntities({ ref: interfacesEntitiesRef }),
        takeUntil(onStoreReset$),
        mergeAll(),
        filterNil(),
        filter(iface => !isLoopbackIp(iface.ip))
    ).subscribe(iface => iface.rpc.notify.connect(remoteIp));
};


/**
 * Handles WebRTC signaling methods for an interface.
 * @param {string} ifaceId - The ID of the network interface.
 * @param {string} localIp - The local IP address of the interface.
 * @returns {Object} An object containing RPC signaling methods.
 */
const signalRpcMethods = (ifaceId, localIp) => (
    {
        /**
         * Handles receiving ICE candidates from a remote socket.
         * @param {string} from - The ID of the sending socket.
         * @param {Object} candidate - The ICE candidate data.
         */
        receiveIce(from, candidate) {
            console.debug(`[ICE Service] Received ICE candidate from ${from}`, candidate);
            return receiveIce(from, candidate);
        },

        /**
         * Creates and sends an offer to a remote socket.
         * @param {string} to - The ID of the receiving socket.
         * @returns {Promise<Object>} The created offer.
         */
        async createOffer(to) {
            console.debug(`[RPC createOffer] Creating offer to IP: ${to}`);
            const socketId = createSocket(localIp, true);
            console.debug(`[RPC createOffer] Created socket: ${socketId} for IP: ${localIp}`);
            updateSocketIp(socketId, to);
            const rtc = getSocketRtc(socketId);
            const offer = await rtc.createOffer();
            await rtc.setLocalDescription(offer);
            console.debug(`[RPC createOffer] Offer created for socket ${socketId}:`, offer);
            return offer;
        },

        /**
         * Handles an offer response from a remote socket.
         * @param {string} from - The ID of the sending socket.
         * @param {Object} offer - The received offer.
         * @returns {Promise<Object>} The created answer.
         */
        async offerResponse(from, offer) {
            console.debug(`[RPC offerResponse] Received offer from IP: ${from}`);
            const socketId = createSocket(localIp, false);
            console.debug(`[RPC offerResponse] Created socket: ${socketId} for IP: ${localIp}`);
            updateSocketIp(socketId, from);
            const rtc = getSocketRtc(socketId);
            await rtc.setRemoteDescription(offer);
            console.debug(`[RPC offerResponse] Set remote description for socket ${socketId}`);
            const answer = await rtc.createAnswer();
            await rtc.setLocalDescription(answer);
            setSocketConnected(socketId);
            console.debug(`[RPC offerResponse] Answer created for socket ${socketId}:`, answer);
            return answer;
        },

        /**
         * Processes an answer from a remote socket.
         * @param {string} from - The ID of the sending socket.
         * @param {Object} answer - The received answer.
         */
        async getAnswer(from, answer) {
            console.debug(`[RPC getAnswer] Received answer from IP: ${from}`);
            const remoteSocket = getSocketByIp(from);
            if (!remoteSocket || remoteSocket.ifaceId !== localIp) {
                console.warn(`[RPC getAnswer] Socket mismatch or missing for IP: ${from}, expected ifaceId: ${localIp}`);
                return false;
            }
            const { rtc } = remoteSocket;
            if (rtc.signalingState !== "have-local-offer") {
                console.warn(`[RPC getAnswer] RTC state mismatch for socket ${idOf(remoteSocket)}. State: ${rtc.signalingState}`);
                return false;
            }
            await rtc.setRemoteDescription(answer);
            setSocketConnected(idOf(remoteSocket));
            console.debug(`[RPC getAnswer] Answer set successfully for socket ${idOf(remoteSocket)}`);
            return true;
        }
    }
);

/**
 * Updates a network interface with an RPC object.
 * @param {string} ifaceId - The ID of the interface to update.
 * @param {Object} rpc - The RPC object to attach.
 */
const attachRpcToInterface = (ifaceId, rpc) => {
    store.update(
        updateEntities(ifaceId, iface => (iface.rpc = rpc) && iface, {ref: interfacesEntitiesRef})
    );
};

