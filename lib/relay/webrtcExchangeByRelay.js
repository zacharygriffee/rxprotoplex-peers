import {catchError, defer, map, of, retry, tap} from "rxjs";
import {filterNil} from "@ngneat/elf";
import {switchMap} from "rxjs/operators";

/**
 * Facilitates a WebRTC exchange between two peers via relayed signaling.
 *
 * @param {Object} impolite - The peer initiating the WebRTC exchange.
 * @param {Object} polite - The peer responding to the WebRTC exchange.
 * @returns {Observable<boolean>} An observable that emits `true` if the exchange is successful, or `false` on failure.
 */
export const webrtcExchangeByRelay = (impolite, polite) =>
    defer(() => impolite.rpc.request.createOffer(polite.ip)) // Start the exchange by creating an offer from the impolite peer
        .pipe(
            filterNil(), // Ensure the offer is not null or undefined
            switchMap(offer => polite.rpc.request.offerResponse(impolite.ip, offer)), // Pass the offer to the polite peer for a response
            filterNil(), // Ensure the response is not null or undefined
            tap(answer => impolite.rpc.notify.getAnswer(polite.ip, answer)), // Notify the impolite peer of the polite peer's answer
            map(() => true), // Map successful exchange to `true`
            retry({
                count: 3, // Retry up to 3 times on failure
                delay: 250, // Delay of 250ms between retries
            }),
            catchError((e) => {
                console.debug("Failed WebRTC exchange after retries.", e);
                return of(false); // Emit `false` if the exchange fails after retries
            })
        );