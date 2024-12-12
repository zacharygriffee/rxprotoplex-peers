import {catchError, map, merge, mergeMap, NEVER, Observable, Subject, take, takeUntil, tap} from "rxjs";
import {listenAndConnectionAndRpc$} from "rxprotoplex-rpc";
import {webrtcSignalingRelay} from "../relay/webrtcSignalingRelay.js";
import {addEntities, getEntity, updateEntities, updateEntitiesIds} from "@ngneat/elf-entities";
import {withHandshake} from "rxprotoplex";
import {nanoid} from "nanoid";
import {ID_SYMBOL} from "../constants.js";
import {createInfiniteIdSystem, createIpIdSystem, createTwoStage} from "../managers/createIdManager.js";
import {onStoreReset$, serverSocketEntitiesRef, store} from "../store.js";

/**
 * Creates a server for managing socket connections and relaying messages.
 *
 * @param {Object} [config={}] - Configuration options for the server.
 * @param {string} [config.subnet="72.16.0.0/14"] - The subnet for IP allocation.
 * @param {string} [config.channel] - The communication channel for signaling.
 * @param {Observable} [config.close$=NEVER] - An observable that signals the server to close.
 * @returns {Subject} A subject for managing incoming Plex connections.
 */
const server = (config = {}) => {
    const {
        subnet = "72.16.0.0/14",
        channel,
        close$ = new Subject(),
        unverifiedIdAllocator = () => createInfiniteIdSystem(() => nanoid()),
        verifiedIdAllocator = () => createIpIdSystem(subnet),
    } = config;

    // Create ID allocators for unverified and verified IDs.
    const [firstStage, secondStage] = createTwoStage(
        unverifiedIdAllocator(),
        verifiedIdAllocator()
    );

    /**
     * Subject for managing incoming Plex connections.
     * @type {Subject}
     */
    const incomingPlex$ = new Subject();

    // Handle incoming connections and assign temporary IDs.
    const receiveRawPeer$ = incomingPlex$.pipe(
        takeUntil(close$),
        takeUntil(onStoreReset$),
        map((remote) => {
            const id = firstStage.allocate();
            remote[ID_SYMBOL] = id;

            // Attach handshake mechanism to the remote.
            Object.assign(
                remote,
                withHandshake({
                    handshakeEncoding: "utf8",
                    handshake: id,
                    onhandshake(reqId) {
                        const verifiedId = secondStage.allocate(id, reqId);
                        if (verifiedId) {
                            store.update(
                                updateEntities(id, { ip: verifiedId, verified: true }, { ref: serverSocketEntitiesRef })
                            );
                            const entity = store.query(getEntity(id, { ref: serverSocketEntitiesRef }));
                            entity.rpc.notify.receiveUpgrade(verifiedId);
                            return true;
                        }
                        return false;
                    },
                }, {})
            );

            // Add the remote to the store as an unverified entity.
            store.update(addEntities(remote, { ref: serverSocketEntitiesRef }));

            return remote;
        })
    );

    // Begin signaling and attach RPC to verified peers.
    const beginSignalingRpc$ = receiveRawPeer$.pipe(
        mergeMap((remote) =>
            listenAndConnectionAndRpc$(remote, channel, { timeout: 10000 }).pipe(
                takeUntil(remote.close$),
                takeUntil(close$),
                takeUntil(onStoreReset$),
                webrtcSignalingRelay(remote),
                map((rpc) => attachRpc(remote, rpc, merge(remote.close$, close$).pipe(take(1)))),
                catchError((e) => {
                    console.error("Signaler failed to connect to incoming webrtcSignalingRelay.", e);
                    return EMPTY;
                })
            )
        )
    );

    // Subscribe to the signaling pipeline.
    beginSignalingRpc$.pipe(
        takeUntil(onStoreReset$),
        takeUntil(close$)
    ).subscribe();

    // Attach the close$ observable to incomingPlex$ for external management.
    incomingPlex$.close$ = close$;

    return incomingPlex$;
};

/**
 * Attaches an RPC instance to a remote and ensures cleanup upon closure.
 *
 * @param {Object} remote - The remote to attach the RPC to.
 * @param {Object} rpc - The RPC instance.
 * @param {Observable} close$ - An observable signaling when to close the RPC.
 * @returns {Object} The updated remote object.
 */
const attachRpc = (remote, rpc, close$) => {
    remote.rpc = rpc;
    close$.subscribe(() => rpc.close());
    return remote;
};

export {server};