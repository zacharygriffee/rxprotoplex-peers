import {ID_SYMBOL, PEER_SYMBOL} from "../constants.js";
import {connectAndRpc$, tapExpose} from "rxprotoplex-rpc";
import {peerManager} from "../managers/peerManager.js";
import {finalize, share, takeUntil, tap} from "rxjs";
import {createRtcPeer} from "./webrtc-peer.js";
import {addEntities, getEntity} from "@ngneat/elf-entities";
import {RTCIceCandidate} from "get-webrtc";
import {asPlex} from "rxprotoplex";
import {idOf} from "./idOf.js";

/**
 * Creates a base peer object by combining a Plex instance with a peer manager and additional functionalities.
 *
 * @param {string} id - The unique identifier for the peer.
 * @param {Object} plex - A Plex instance used for multiplexing connections.
 * @returns {Object} The enhanced Plex instance with peer-related functionality.
 */
const basePeer = (id, plex) => {
    plex = asPlex(plex);

    /**
     * The peer manager for managing connections and peer state.
     * @type {Object}
     */
    const manager = peerManager(id, o => o[ID_SYMBOL]);

    // Subscribe to the Plex close event and close the peer manager.
    plex.close$.subscribe(manager.close);

    // Extend the Plex instance with peer management and additional methods.
    Object.assign(plex, manager, {
        /**
         * Marker indicating that this is a peer.
         * @type {boolean}
         */
        [PEER_SYMBOL]: true,

        /**
         * The unique identifier for this peer.
         * @type {string}
         */
        [ID_SYMBOL]: id,

        /**
         * Creates an RPC (Remote Procedure Call) observable on a specific channel.
         *
         * @param {string} channel - The channel to establish the RPC.
         * @param {Object} [config={}] - Optional configuration for the RPC.
         * @returns {Observable} An observable for the RPC communication.
         */
        rpc$: (channel, config = {}) =>
            connectAndRpc$(plex, channel, config).pipe(
                takeUntil(plex.close$)
            ),

        /**
         * Creates a signaling observable for WebRTC peer connections.
         *
         * @param {string} channel - The signaling channel to use.
         * @param {Object} [config={}] - Optional configuration for the signaling.
         * @returns {Observable} An observable for signaling events.
         */
        signal$: (channel, config = {}) => {
            return connectAndRpc$(plex, channel, config)
                .pipe(
                    takeUntil(plex.close$),
                    tap({
                        complete() {
                            console.log(`Signal Ended for ${idOf(plex)}`);
                        }
                    }),
                    tapExpose({
                        /**
                         * Handles receiving ICE candidates from a remote peer.
                         * @param {string} from - The ID of the sending peer.
                         * @param {Object} candidate - The ICE candidate data.
                         */
                        async receiveIce(from, candidate) {
                            const peer = manager.query(getEntity(from));
                            if (!peer) return;
                            peer.rtc.addIceCandidate(
                                new RTCIceCandidate(candidate)
                            ).catch(console.error);
                        },

                        /**
                         * Creates and sends an offer to a remote peer.
                         * @param {string} to - The ID of the receiving peer.
                         * @returns {Promise<Object>} The created offer.
                         */
                        async createOffer(to) {
                            const peer = createRtcPeer(to, true);
                            manager.update(addEntities(peer));
                            const offer = await peer.rtc.createOffer();
                            await peer.rtc.setLocalDescription(offer);
                            return offer;
                        },

                        /**
                         * Handles an offer response from a remote peer.
                         * @param {string} from - The ID of the sending peer.
                         * @param {Object} offer - The received offer.
                         * @returns {Promise<Object>} The created answer.
                         */
                        async offerResponse(from, offer) {
                            const peer = createRtcPeer(from, false);
                            manager.update(addEntities(peer));
                            await peer.rtc.setRemoteDescription(offer);
                            const answer = await peer.rtc.createAnswer();
                            await peer.rtc.setLocalDescription(answer);
                            manager.activate(from);
                            return answer;
                        },

                        /**
                         * Processes an answer from a remote peer.
                         * @param {string} from - The ID of the sending peer.
                         * @param {Object} answer - The received answer.
                         */
                        async getAnswer(from, answer) {
                            const peer = manager.query(getEntity(from));
                            if (!peer || peer?.rtc?.signalingState !== "have-local-offer") return;
                            await peer.rtc.setRemoteDescription(answer);
                            manager.activate(from);
                        }
                    }),
                    share()
                );
        }
    });

    return plex;
};


export {basePeer};
