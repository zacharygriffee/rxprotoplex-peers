import {solo, test} from "brittle";
import {firstValueFrom, take, tap} from "rxjs";
import {connectAndSend, createPlexPair, destroy, listenAndConnectionAndRead$, withEncoding} from "rxprotoplex";
import {basePeer} from "../lib/peer/base-peer.js";
import {WebSocketServer} from "ws";
import {webSocketServer} from "../lib/servers/webSocketServer.js";
import {peerManager} from "../lib/managers/peerManager.js";
import {server} from "../lib/servers/server.js";
import {switchRpcRequest} from "rxprotoplex-rpc";
import {idOf} from "../lib/peer/idOf.js";
import {webSocketPeer} from "../lib/peer/websocket-peer.js";
import {getWebSocketURL} from "./getWebSocketUrl.js";

test("peer connectivity", async t => {
    const [p1, p2] = createPlexPair();

    const peerA = basePeer("a", p1);
    const peerB = basePeer("b", p2);

    const send = connectAndSend(peerB, withEncoding("json"))
    send("hello");
    const {data} = await firstValueFrom(listenAndConnectionAndRead$(peerA, withEncoding("json")).pipe(take(1)));
    t.is(data, "hello");

    t.teardown(() => {
        destroy(peerA);
        destroy(peerB);
    });
});

test("create webrtc from plex", async t => {
    t.plan(2);
    const serverPeerManager = peerManager("server");
    const serverSubject$ = server(serverPeerManager);
    const [c1, s1] = createPlexPair();
    const [c2, s2] = createPlexPair();
    serverSubject$.next(s1);
    serverSubject$.next(s2);
    const peer1 = basePeer("a", c1);
    const peer2 = basePeer("b", c2);

    const peer1Signal$ = peer1.signal$();
    const peer1Ip$ = peer1Signal$.pipe(switchRpcRequest("getId"),
        tap({
            complete() {
                console.log(`peer1Ip$ ended`);
            }
        }));
    const {ack: peer1Ip} = await firstValueFrom(peer1Ip$);

    const peer2Signal$ = peer2.signal$();
    const peer2Ip$ = peer2Signal$.pipe(switchRpcRequest("getId"),
        tap({
            complete() {
                console.log(`peer2Ip$ ended`);
            }
        }));
    const {ack: peer2Ip} = await firstValueFrom(peer2Ip$);

    peer1.connection$.subscribe(conn => {
        t.is(idOf(conn), peer2Ip);
    });

    peer2.connection$.subscribe(conn => {
        t.is(idOf(conn), peer1Ip);
    });

    serverPeerManager.connection$.subscribe(conn => {
        console.log("Server received connection", conn);
    })

    peer2Signal$.subscribe(rpc => rpc.notify.connect(peer1Ip));

    t.teardown(() => {
        [peer1,peer2].forEach(destroy);
        serverSubject$.complete();
    });
});

test("create webrtc from websocket", async t => {
    t.plan(2);
    const serverPeerManager = peerManager("server");
    const wss = new WebSocketServer({port: 5000});
    await new Promise(resolve => wss.once("listening", resolve));
    const wsUrl = getWebSocketURL(wss);
    webSocketServer(serverPeerManager, wss);
    const peer1 = webSocketPeer("a", wsUrl);
    const peer2 = webSocketPeer("b", wsUrl);

    const peer1Signal$ = peer1.signal$();
    const peer1Ip$ = peer1Signal$.pipe(switchRpcRequest("getId"),
        tap({
            complete() {
                console.log(`peer1Ip$ ended`);
            }
        }));
    const {ack: peer1Ip} = await firstValueFrom(peer1Ip$);

    const peer2Signal$ = peer2.signal$();
    const peer2Ip$ = peer2Signal$.pipe(switchRpcRequest("getId"),
        tap({
            complete() {
                console.log(`peer2Ip$ ended`);
            }
        }));
    const {ack: peer2Ip} = await firstValueFrom(peer2Ip$);

    peer1.connection$.subscribe(conn => {
        t.is(idOf(conn), peer2Ip);
    });

    peer2.connection$.subscribe(conn => {
        t.is(idOf(conn), peer1Ip);
    });

    serverPeerManager.connection$.subscribe(conn => {
        console.log("Server received connection", conn);
    })

    peer2Signal$.subscribe(rpc => rpc.notify.connect(peer1Ip));

    t.teardown(() => {
        [peer1,peer2].forEach(destroy);
        wss.close();
    });
});