import {catchError, concatMap, defer, from, map, of, retry, tap} from "rxjs";
import {filterNil} from "@ngneat/elf";
import {switchMap} from "rxjs/operators";
import {ID_SYMBOL} from "../constants.js";

export const webrtcExchangeByRelay = (impolite, polite) =>
    defer(() => impolite.rpc.request.createOffer(polite.ip))
        .pipe(
            filterNil(),
            switchMap(offer => polite.rpc.request.offerResponse(impolite.ip, offer)),
            filterNil(),
            tap(answer => impolite.rpc.notify.getAnswer(polite.ip, answer)),
            map(() => true),
            retry({
                count: 3,
                delay: 250
            }),
            catchError((e) => {
                console.debug("Failed webrtc exchange after retries.", e);
                return of(false);
            })
        );