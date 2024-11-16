import {from} from "rxjs";
import {filterNil} from "@ngneat/elf";
import {switchMap} from "rxjs/operators";
import {ID_SYMBOL} from "../constants.js";

export const webrtcExchangeByRelay = (impolite, polite) => {
    from(impolite.rpc.request.createOffer(polite[ID_SYMBOL]))
        .pipe(
            filterNil(),
            switchMap(offer => polite.rpc.request.offerResponse(impolite[ID_SYMBOL], offer)),
            filterNil(),
        ).subscribe(answer => impolite.rpc.notify.getAnswer(polite[ID_SYMBOL], answer));
}