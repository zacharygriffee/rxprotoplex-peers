import {createEchoProps} from "echo-prop";
import {
    catchError,
    EMPTY,
    filter,
    fromEvent,
    map,
    race,
    ReplaySubject,
    shareReplay,
    take,
    takeUntil,
    takeWhile,
    timeout
} from "rxjs";
import {pollUntilCondition} from "../util/pollUntilCondition.js";
import {duplexFromRtcDataChannel} from "../util/duplexFromRtcDataChannel.js";
import {RTCPeerConnection} from "get-webrtc";
import {destroy} from "rxprotoplex";
import {basePeer} from "./base-peer.js";

export const createRtcPeer = (id, isInitiator, config = {}) => {
    const rtc = new RTCPeerConnection(config);
    const peerEchos = createEchoProps(rtc, {
        signalingState: null,
        connectionState: null
    });

    Object.assign(rtc, {
        stable$: rtc.signalingState$.pipe(filter(o => o === "stable")),
        haveLocalOffer$: rtc.signalingState$.pipe(
            filter(o => o === "have-local-offer")
        ),
        localDescription$: rtc.signalingState$.pipe(
            filter(o => o === "have-local-offer"),
            pollUntilCondition(() => !!rtc.localDescription, 250, 60000),
            map(() => rtc.localDescription),
            take(1),
            shareReplay(1),
            timeout({
                each: 60000,
                with: () => {
                    console.error('Local description not set within 60 seconds. Closing RTCPeerConnection.');
                    rtc.close();
                    return new Error('Local description not set within 60 seconds.');
                }
            })
        ),
        haveRemoteOffer$: rtc.signalingState$.pipe(
            filter(o => o === "have-remote-offer")
        ),
        remoteDescription$: rtc.signalingState$.pipe(
            filter(o => o === "have-remote-offer"),
            pollUntilCondition(() => !!rtc.remoteDescription, 250, 60000),
            map(() => rtc.remoteDescription),
            take(1),
            shareReplay(1),
            timeout({
                each: 60000,
                with: () => {
                    console.error('Remote description not set within 60 seconds. Closing RTCPeerConnection.');
                    rtc.close();
                    return new Error('Remote description not set within 60 seconds.');
                }
            })
        ),
        haveOffer$: race(
            rtc.signalingState$.pipe(
                filter(o => o === "have-local-offer"),
                pollUntilCondition(() => !!rtc.localDescription, 250, 60000),
                map(() => rtc.localDescription),
                take(1)
            ),
            rtc.signalingState$.pipe(
                filter(o => o === "have-remote-offer"),
                pollUntilCondition(() => !!rtc.remoteDescription, 250, 60000),
                map(() => rtc.remoteDescription),
                take(1)
            )
        ),
        closed$: rtc.connectionState$.pipe(filter(o => o === "closed"))
    });

    const peer = basePeer(id,
        duplexFromRtcDataChannel(
            isInitiator,
            rtc.createDataChannel("wire", {
                negotiated: true,
                id: 0
            })
        )
    );

    peer.rtc = rtc;

    // Handle connection closure and ensure the peer is marked as unusable
    peer.rtc.closed$.pipe(take(1)).subscribe(() => {
        peerEchos.forEach(o => o.complete());
        destroy(peer);
    });

    peer.close$.subscribe(() => {
        peer.rtc.close();
    });

    {
        const {
            iceCandidateRetentionTime = 60000,
            iceCandidateRetentionCount = 20
        } = config;
        peer.rtc.ices$ = new ReplaySubject(iceCandidateRetentionCount, iceCandidateRetentionTime);
        fromEvent(peer.rtc, "icecandidate").pipe(
            takeUntil(peer.rtc.closed$),
            takeWhile((ice) => !!ice.candidate),
            map(o => o.candidate),
            catchError(error => {
                // error$.next(error);
                debugger;
                return EMPTY;
            })
        ).subscribe(candidate => peer.rtc.ices$.next(candidate));
    }

    return peer;
};

