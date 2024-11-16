import {IpAllocator} from "../util/IpAllocator.js";
import {catchError, map, mergeMap, NEVER, share, Subject, takeUntil, tap} from "rxjs";
import {listenAndConnectionAndRpc$} from "rxprotoplex-rpc";
import {webrtcSignalingRelay} from "../relay/webrtcSignalingRelay.js";
import {basePeer} from "../peer/base-peer.js";
import {isPeer} from "../peer/isPeer.js";
import {listenAndConnectionAndPingPong$} from "rxprotoplex-pingpong";
import {deleteEntities, getAllEntities} from "@ngneat/elf-entities";
import {idOf} from "../peer/idOf.js";
import {destroy} from "rxprotoplex";

/**
 * Creates a server for managing peer connections and relaying messages.
 *
 * @param {Object} peerManager - The peer manager instance to manage peer connections and states.
 * @param {Object} [config={}] - Configuration options for the server.
 * @param {string} [config.subnet="72.16.0.0/14"] - The subnet for IP allocation.
 * @param {string} [config.channel] - The communication channel for signaling.
 * @param {Observable} [config.close$=NEVER] - An observable that signals the server to close.
 * @returns {Subject} A subject for managing incoming Plex connections.
 */
const server = (peerManager, config = {}) => {
    const {
        subnet = "72.16.0.0/14",
        channel,
        close$ = NEVER
    } = config;

    /**
     * IP allocator for dynamically assigning IPs to peers.
     * @type {IpAllocator}
     */
    const ipAllocator = new IpAllocator(subnet);

    /**
     * Subject for managing peer connections.
     * @type {Subject}
     */
    const peers$ = new Subject();

    /**
     * Subject for managing incoming Plex connections.
     * @type {Subject}
     */
    const incomingPlex$ = new Subject();
    incomingPlex$.ipAllocator = ipAllocator;

    // Attach peer connections to the peer manager.
    peerManager.attach(peers$);

    incomingPlex$.pipe(
        takeUntil(close$),
        map(peer => {
            if (!isPeer(peer)) return basePeer(ipAllocator.allocateIp(), peer);
            return peer;
        }),
        mergeMap(peer =>
            listenAndConnectionAndRpc$(peer, channel, { timeout: 2000 }).pipe(
                takeUntil(peer.close$),
                takeUntil(close$),
                webrtcSignalingRelay(peerManager, peer),
                map(rpc => (peer.rpc = rpc) && peer),
                catchError(e => {
                    console.error("Signaler failed to connect to incoming webrtcSignalingRelay.", e);
                })
            )
        ),
        tap(peer => {
            listenAndConnectionAndPingPong$(peer, {
                onPingPongFailure() {
                    peerManager.update(deleteEntities(idOf(peer)));
                    destroy(peer);
                }
            })
                .pipe(takeUntil(peer.close$), takeUntil(close$))
                .subscribe({
                    next({ plex }) {
                        peers$.next(plex);
                    }
                });
        }),
        tap(peer => console.log("Peer connected", peer)),
        tap({
            complete() {
                console.warn("Server closed");
            },
            error(e) {
                console.error(`Server encountered an error and has closed: ${e.message}`, e);
            }
        })
    ).subscribe(peers$);

    return incomingPlex$;
};


export {server};