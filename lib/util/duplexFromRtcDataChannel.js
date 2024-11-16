import { Duplex } from 'streamx';
import b4a from 'b4a';

function duplexFromRtcDataChannel(isInitiator, dc, opts = {}) {
    let opening = null;
    let openedDone = null;
    let closed = false;

    const publicKey = opts.publicKey || null;
    const remotePublicKey = opts.remotePublicKey || null;
    const handshakeHash = opts.handshakeHash || null;
    const opened = new Promise(resolve => { openedDone = resolve; });

    function resolveOpened(opened) {
        if (openedDone) {
            const cb = openedDone;
            openedDone = null;
            cb(opened);
            if (opened) duplex.emit('connect');
        }
    }

    function onopen() {
        continueOpen();
    }

    function onmessage(event) {
        duplex.push(b4a.from(event.data));
    }

    function onerror(err) {
        console.error("Data channel error:", err);
        duplex.destroy(err);
    }

    function onclose() {
        cleanupListeners();
        duplex.destroy();
    }

    function cleanupListeners() {
        console.log("Cleaning up listeners");
        dc.removeEventListener('open', onopen);
        dc.removeEventListener('message', onmessage);
        dc.removeEventListener('error', onerror);
        dc.removeEventListener('close', onclose);
    }

    dc.addEventListener('open', onopen);
    dc.addEventListener('message', onmessage);
    dc.addEventListener('error', onerror);
    dc.addEventListener('close', onclose);

    const duplex = new Duplex({
        mapWritable: toBuffer,

        open(cb) {
            if (dc.readyState === 'closed' || dc.readyState === 'closing') {
                cb(new Error('Stream is closed'));
                return;
            }
            if (dc.readyState === 'connecting') {
                opening = cb;
                return;
            }
            resolveOpened(true);
            cb(null);
        },

        write(data, cb) {
            if (dc.readyState === 'open' && !closed) {
                try {
                    dc.send(data);
                    cb(null);
                } catch (err) {
                    console.error("Error during dc.send:", err);
                    cb(new Error('Failed to send data: ' + err.message));
                }
            } else {
                cb(new Error('Stream is closed'));
            }
        },

        predestroy() {
            if (!closed) {
                closed = true;
                cleanupListeners();
                continueOpen(new Error('Stream was destroyed'));
            }
        },

        destroy(cb) {
            console.log("Duplex destroy called");
            if (!closed) {
                closed = true;
                dc.close();
                cleanupListeners();
                resolveOpened(false);
            }
            cb(null);
        }
    });

    function continueOpen(err) {
        if (err) return duplex.destroy(err);
        if (!opening) return;

        const cb = opening;
        opening = null;
        if (dc.readyState === 'open') {
            cb(null);
        } else {
            cb(new Error('DataChannel is not open'));
        }
    }

    duplex.resume().pause();
    return Object.assign(duplex, { publicKey, remotePublicKey, handshakeHash, opened, isInitiator });
}

function toBuffer(data) {
    return typeof data === 'string' ? b4a.from(data) : data;
}

export { duplexFromRtcDataChannel };
