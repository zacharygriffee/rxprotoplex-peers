import {catchError, map, mergeMap, NEVER, Observable, Subject, takeUntil, tap} from "rxjs";
import {listenAndConnectionAndRpc$} from "rxprotoplex-rpc";
import {webrtcSignalingRelay} from "../relay/webrtcSignalingRelay.js";
import {addEntities, getEntity, updateEntities, updateEntitiesIds} from "@ngneat/elf-entities";
import {withHandshake} from "rxprotoplex";
import {nanoid} from "nanoid";
import {ID_SYMBOL} from "../constants.js";
import {createInfiniteIdSystem, createIpIdSystem, createTwoStage} from "../managers/createIdManager.js";
import {serverSocketEntitiesRef, store} from "../store.js";

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
        close$ = NEVER,
        unverifiedIdAllocator = () => createInfiniteIdSystem(() => nanoid()),
        verifiedIdAllocator = () => createIpIdSystem(subnet)
    } = config;

    const [firstStage, secondStage] = createTwoStage(unverifiedIdAllocator(), verifiedIdAllocator());

    /**
     * Subject for managing incoming Plex connections.
     * @type {Subject}
     */
    const incomingPlex$ = new Subject();
    // Attach socket connections to the socket manager.

    const receiveRawPeer$ = incomingPlex$.pipe(
        takeUntil(close$),
        map(remote => {
            const id = firstStage.allocate();
            remote[ID_SYMBOL] = id;

            Object.assign(remote, withHandshake({
                handshakeEncoding: "utf8",
                handshake: id,
                onhandshake(reqId) {
                    const verifiedId = secondStage.allocate(id, reqId);
                    if (verifiedId) {
                        store.update(
                            updateEntities(id, { ip: verifiedId, verified: true }, {ref: serverSocketEntitiesRef})
                        );
                        const entity = store.query(getEntity(id, {ref: serverSocketEntitiesRef}));
                        entity.rpc.notify.receiveUpgrade(verifiedId);
                        return true;
                    }
                    return false;
                }
            }, {}));

            store.update(addEntities(remote, {ref: serverSocketEntitiesRef}));

            return remote;
        })
    );

    const beginSignalingRpc$ = receiveRawPeer$.pipe(
        mergeMap(remote =>
            listenAndConnectionAndRpc$(remote, channel, { timeout: 10000 }).pipe(
                takeUntil(remote.close$),
                takeUntil(close$),
                webrtcSignalingRelay(remote),
                map(rpc => (remote.rpc = rpc) && remote),
                catchError(e => {
                    console.error("Signaler failed to connect to incoming webrtcSignalingRelay.", e);
                })
            )
        )
    );

    beginSignalingRpc$.subscribe({
        complete() {

        },
        next(peer) {

        }
    });

    return incomingPlex$;
};


export {server};