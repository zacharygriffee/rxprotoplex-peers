import {solo, test} from "brittle";
import {WebSocketServer} from "ws";
import b4a from "b4a";
import {
    addWebSocketNetworkInterface,
    closeInterface,
    networkInterfaceConnected$,
    connectStream$,
    listenOnSocket$, webSocketServer, getInterfaceOfId, connect
} from "../index.js";
import {getWebSocketURL} from "./getWebSocketUrl.js";

async function useWebServer(cb, t) {
    const wss = new WebSocketServer({ port: 5000 });
    await new Promise((resolve) => wss.once("listening", resolve));
    const wsUrl = getWebSocketURL(wss);
    webSocketServer(wss);
    await cb(wsUrl);
    wss.close();
    t?.teardown?.(() => wss.close());
}

test("WebSocket integration test", async (t) => {
    // Start WebSocket server
    await useWebServer(async wsUrl => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        // Wait until both interfaces are connected
        const connectionPromise = new Promise((resolve, reject) => {
            let connections = 0;
            const checkConnections = () => {
                connections++;
                if (connections === 2) resolve();
            };
            networkInterfaceConnected$(nic1).subscribe(checkConnections, reject);
            networkInterfaceConnected$(nic2).subscribe(checkConnections, reject);
        });

        await connectionPromise;
        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);

        t.teardown(() => {
            closeInterface(nic2);
            closeInterface(nic1);
        });

        connect(iface1.ip, iface2.ip);

        // Set up listening on nic2
        const listenPromise = new Promise((resolve, reject) => {
            listenOnSocket$("0.0.0.0", "howdie").subscribe(
                (socket) => {
                    socket.on("data", (data) => {
                        t.alike(data, b4a.from("hello2"), "Received correct message");
                        resolve();
                    });
                },
                reject
            );
        });


        // Send a message from nic1 to nic2
        connectStream$(iface1.ip, "howdie").subscribe(
            (stream) => {
                stream.write(b4a.from("hello2"));
                closeInterface(nic1);
            },
            (err) => t.fail(err.message)
        );

        await listenPromise;
        t.pass("WebSocket integration test completed");
    }, t);
});

test("addWebSocketNetworkInterface throws if invalid error is supplied ", async t => {
    t.exception.all(() => addWebSocketNetworkInterface("boom bad"));
});

test("Concurrent WebSocket network interface connections", async (t) => {
    await useWebServer(async (wsUrl) => {
        const interfaces = Array.from({ length: 10 }).map(() =>
            addWebSocketNetworkInterface(wsUrl)
        );

        const connectionPromises = interfaces.map((iface) =>
            new Promise((resolve, reject) => {
                networkInterfaceConnected$(iface).subscribe(resolve, reject);
            })
        );

        await Promise.all(connectionPromises);

        t.pass("All interfaces connected successfully");
        interfaces.forEach((i) => closeInterface(i));
    }, t);
});

test("closeInterface handles invalid or non-existent interfaces", async (t) => {
    t.exception.all(() => closeInterface("non_existent_iface"), "Throws error for non-existent interface");
    const ifaceId = addWebSocketNetworkInterface("ws://localhost:8080");
    closeInterface(ifaceId); // Close once
});

test("Data flow between connected interfaces using connectStream$", async (t) => {
    await useWebServer(async (wsUrl) => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);

        connect(iface1.ip, iface2.ip);

        const messageReceived = new Promise((resolve, reject) => {
            listenOnSocket$("0.0.0.0", "testChannel").subscribe((socket) => {
                socket.on("data", (data) => {
                    t.alike(data, b4a.from("test_message"), "Received expected data");
                    resolve();
                });
            }, reject);
        });

        connectStream$(iface1.ip, "testChannel").subscribe((stream) => {
            stream.write(b4a.from("test_message"));
        });

        await messageReceived;
        t.pass("Message received and validated successfully");
    }, t);
});

test("Reconnection of network interfaces", async (t) => {
    await useWebServer(async (wsUrl) => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        closeInterface(nic1);
        t.ok(true, "Interface 1 closed");

        const reconnectionPromise = new Promise((resolve) => {
            const newNic1 = addWebSocketNetworkInterface(wsUrl);
            networkInterfaceConnected$(newNic1).subscribe(() => resolve(newNic1));
        });

        const newNic1 = await reconnectionPromise;

        t.ok(newNic1, "Interface 1 reconnected successfully");
    }, t);
});
