const assert = require("assert");
const { getEventListeners } = require("events");
const Entangld = require("../lib/Datastore.js");
const { EntangldError, EntangldTimeoutError } = require("../lib/error.js");

const listeners = (signal) => getEventListeners(signal, "abort").length;

// Resolve to the error a promise rejects with, or fail if it resolves
function rejection(promise) {
    return promise.then(
        (val) => assert.fail(`Expected a rejection, got ${val}`),
        (err) => err
    );
}

// Attach store b to store a. Messages from a are delivered only if allow(msg)
function linked_stores(allow = () => true) {
    const a = new Entangld();
    const b = new Entangld();

    a.transmit((msg, store) => {
        if (allow(msg)) store.receive(msg, a);
    });
    b.transmit((msg, store) => store.receive(msg, b));

    a.attach("b", b);
    b.attach("a", a);

    return { a, b };
}

describe("Signals", () => {

    describe("get", () => {

        it("rejects with the reason when a remote get is aborted", async () => {
            const { a } = linked_stores(() => false);
            const controller = new AbortController();
            const reason = new Error("gave up");

            const request = a.get("b.value", undefined, { signal: controller.signal });
            controller.abort(reason);

            assert.strictEqual(await rejection(request), reason);
        });

        it("removes the request after aborting", async () => {
            const { a } = linked_stores(() => false);
            const controller = new AbortController();

            const request = a.get("b.value", undefined, { signal: controller.signal });
            controller.abort();
            await rejection(request);

            assert.strictEqual(Object.keys(a._requests).length, 0);
        });

        it("ignores a reply which arrives after aborting", async () => {
            const { a, b } = linked_stores(() => false);
            const controller = new AbortController();
            const sent = [];
            a.transmit((msg) => sent.push(msg));

            const request = a.get("b.value", undefined, { signal: controller.signal });
            controller.abort();
            await rejection(request);

            assert.doesNotThrow(() => {
                a.receive({ type: "value", uuid: sent[0].uuid, value: 1 }, b);
            });
        });

        it("sends nothing if the signal has already aborted", async () => {
            const sent = [];
            const { a } = linked_stores((msg) => {
                sent.push(msg);
                return true;
            });
            const before = sent.length;
            const reason = new Error("gave up");

            const err = await rejection(a.get("b.value", undefined, { signal: AbortSignal.abort(reason) }));

            assert.strictEqual(err, reason);
            assert.strictEqual(sent.length, before);
            assert.strictEqual(Object.keys(a._requests).length, 0);
        });

        it("rejects if a local function is aborted", async () => {
            const a = new Entangld();
            const controller = new AbortController();
            const reason = new Error("gave up");
            a.set("hang", () => new Promise(() => { }));

            const request = a.get("hang", undefined, { signal: controller.signal });
            controller.abort(reason);

            assert.strictEqual(await rejection(request), reason);
        });

        it("doesn't call a local function if the signal has already aborted", async () => {
            const a = new Entangld();
            let called = false;
            a.set("f", () => {
                called = true;
            });

            await rejection(a.get("f", undefined, { signal: AbortSignal.abort() }));

            assert.strictEqual(called, false);
        });

        it("resolves if the reply beats the abort", async () => {
            const { a, b } = linked_stores();
            const controller = new AbortController();
            b.set("value", 7);

            const value = await a.get("b.value", undefined, { signal: controller.signal });
            controller.abort();

            assert.strictEqual(value, 7);
        });

        it("keeps signals off the wire", async () => {
            const sent = [];
            const { a, b } = linked_stores((msg) => {
                sent.push(JSON.stringify(msg));
                return true;
            });
            b.set("value", 7);

            await a.get("b.value", undefined, { signal: new AbortController().signal });

            assert(!sent.join("").includes("signal"));
        });

        it("throws if signal isn't an AbortSignal", () => {
            const a = new Entangld();

            for (const signal of [null, 1, "signal", {}]) {
                assert.throws(() => a.get("value", undefined, { signal }), TypeError);
            }
        });
    });

    describe("listeners", () => {

        it("removes its listener when a request resolves", async () => {
            const { a, b } = linked_stores();
            const { signal } = new AbortController();
            b.set("value", 7);

            await a.get("b.value", undefined, { signal });

            assert.strictEqual(listeners(signal), 0);
        });

        it("removes its listener when a local function rejects", async () => {
            const a = new Entangld();
            const { signal } = new AbortController();
            a.set("bad", () => Promise.reject(new Error("boom")));

            await rejection(a.get("bad", undefined, { signal }));

            assert.strictEqual(listeners(signal), 0);
        });

        it("removes its listener when a request times out", async () => {
            const { a } = linked_stores(() => false);
            const { signal } = new AbortController();

            await rejection(a.get("b.value", undefined, { signal, timeout_ms: 5 }));

            assert.strictEqual(listeners(signal), 0);
        });
    });

    describe("with timeout_ms", () => {

        it("times out if the signal doesn't abort", async () => {
            const { a } = linked_stores(() => false);
            const { signal } = new AbortController();

            const err = await rejection(a.get("b.value", undefined, { signal, timeout_ms: 5 }));

            assert(err instanceof EntangldTimeoutError);
        });

        it("rejects with the abort reason if the signal aborts first", async () => {
            const { a } = linked_stores(() => false);
            const controller = new AbortController();
            const reason = new Error("gave up");

            const request = a.get("b.value", undefined, { signal: controller.signal, timeout_ms: 1000 });
            controller.abort(reason);

            assert.strictEqual(await rejection(request), reason);
        });

        it("cancels the timer after an abort", async () => {
            const { a } = linked_stores(() => false);
            const controller = new AbortController();
            const { setTimeout: set_timer, clearTimeout: clear_timer } = global;
            const cleared = [];
            let timer;

            global.setTimeout = (...args) => (timer = set_timer(...args));
            global.clearTimeout = (id) => {
                cleared.push(id);
                clear_timer(id);
            };

            try {
                const request = a.get("b.value", undefined, { signal: controller.signal, timeout_ms: 1000 });
                controller.abort();
                await rejection(request);
            } finally {
                global.setTimeout = set_timer;
                global.clearTimeout = clear_timer;
            }

            assert(cleared.includes(timer));
        });
    });

    describe("subscribe", () => {

        it("stops calling back when a local subscription is aborted", async () => {
            const a = new Entangld();
            const controller = new AbortController();
            const seen = [];

            a.subscribe("value", (path, value) => seen.push(value), { signal: controller.signal });
            a.set("value", 1);
            controller.abort();
            a.set("value", 2);

            assert.deepStrictEqual(seen, [1]);
            assert.strictEqual(a.subscribed_to("value"), false);
        });

        it("removes the subscription from the remote store when aborted", () => {
            const { a, b } = linked_stores();
            const controller = new AbortController();
            const seen = [];

            a.subscribe("b.value", (path, value) => seen.push(value), { signal: controller.signal });
            b.set("value", 1);
            assert.strictEqual(b._subscriptions.length, 1);

            controller.abort();
            b.set("value", 2);

            assert.deepStrictEqual(seen, [1]);
            assert.strictEqual(a._subscriptions.length, 0);
            assert.strictEqual(b._subscriptions.length, 0);
        });

        it("only removes the subscription which was aborted", () => {
            const a = new Entangld();
            const controller = new AbortController();
            const seen = [];

            a.subscribe("value", () => seen.push("signal"), { signal: controller.signal });
            a.subscribe("value", () => seen.push("plain"));
            controller.abort();
            a.set("value", 1);

            assert.deepStrictEqual(seen, ["plain"]);
        });

        it("still takes every as the third argument", () => {
            for (const [every, calls] of [[2, 2], ["2", 2], [null, 4], [undefined, 4]]) {
                const a = new Entangld();
                const seen = [];

                a.subscribe("value", (path, value) => seen.push(value), every);
                for (const value of [1, 2, 3, 4]) a.set("value", value);

                assert.strictEqual(seen.length, calls);
            }
        });

        it("takes an options object without a signal", () => {
            const a = new Entangld();
            const seen = [];

            a.subscribe("value", (path, value) => seen.push(value), { every: 2 });
            for (const value of [1, 2, 3, 4]) a.set("value", value);

            assert.strictEqual(seen.length, 2);
        });

        it("takes every and signal together", () => {
            const a = new Entangld();
            const { signal } = new AbortController();
            const seen = [];

            a.subscribe("value", (path, value) => seen.push(value), { every: 2, signal });
            for (const value of [1, 2, 3, 4]) a.set("value", value);

            assert.strictEqual(seen.length, 2);
        });

        it("creates nothing if the signal has already aborted", () => {
            const sent = [];
            const { a } = linked_stores((msg) => {
                sent.push(msg);
                return true;
            });
            const before = sent.length;

            const uuid = a.subscribe("b.value", () => { }, { signal: AbortSignal.abort() });

            assert.strictEqual(typeof uuid, "string");
            assert.strictEqual(a._subscriptions.length, 0);
            assert.strictEqual(sent.length, before);
        });

        it("unsubscribe throws after an abort", () => {
            const a = new Entangld();
            const controller = new AbortController();

            const uuid = a.subscribe("value", () => { }, { signal: controller.signal });
            controller.abort();

            assert.throws(() => a.unsubscribe(uuid), EntangldError);
        });

        it("unsubscribe throws if the signal had already aborted", () => {
            const a = new Entangld();

            const uuid = a.subscribe("value", () => { }, { signal: AbortSignal.abort() });

            assert.throws(() => a.unsubscribe(uuid), EntangldError);
        });

        it("doesn't throw if aborted after unsubscribing", () => {
            const a = new Entangld();
            const controller = new AbortController();

            const uuid = a.subscribe("value", () => { }, { signal: controller.signal });
            a.unsubscribe(uuid);

            assert.doesNotThrow(() => controller.abort());
        });

        it("removes its listener when aborted", () => {
            const a = new Entangld();
            const controller = new AbortController();

            a.subscribe("value", () => { }, { signal: controller.signal });
            assert.strictEqual(listeners(controller.signal), 1);
            controller.abort();

            assert.strictEqual(listeners(controller.signal), 0);
        });

        it("removes its listener on unsubscribe", () => {
            const a = new Entangld();
            const { signal } = new AbortController();

            a.unsubscribe(a.subscribe("value", () => { }, { signal }));

            assert.strictEqual(listeners(signal), 0);
        });

        it("removes its listener on unsubscribe_tree", () => {
            const a = new Entangld();
            const { signal } = new AbortController();

            a.subscribe("tree.value", () => { }, { signal });
            a.unsubscribe_tree("tree");

            assert.strictEqual(listeners(signal), 0);
        });

        it("still works after the store is reattached", () => {
            const { a, b } = linked_stores();
            const controller = new AbortController();
            const { signal } = controller;
            const seen = [];

            const uuid = a.subscribe("b.value", (path, value) => seen.push(value), { signal });

            const replacement = new Entangld();
            replacement.transmit((msg, store) => store.receive(msg, replacement));
            replacement.attach("a", a);
            a.detach("b");
            a.attach("b", replacement);

            assert.strictEqual(a.subscriptions[0].uuid, uuid);
            assert.strictEqual(listeners(signal), 1);

            replacement.set("value", 1);
            controller.abort();
            replacement.set("value", 2);

            assert.deepStrictEqual(seen, [1]);
            assert.strictEqual(a._subscriptions.length, 0);
            assert.strictEqual(replacement._subscriptions.length, 0);
            assert.strictEqual(b._subscriptions.length, 0);
        });

        it("throws if signal isn't an AbortSignal", () => {
            const a = new Entangld();

            for (const signal of [null, 1, "signal", {}]) {
                assert.throws(() => a.subscribe("value", () => { }, { signal }), TypeError);
            }
        });
    });

    describe("call_rpc", () => {

        it("rejects with the reason when aborted", async () => {
            const { a } = linked_stores(() => false);
            const controller = new AbortController();
            const reason = new Error("gave up");

            const request = a.call_rpc("b.rpc", [1], { signal: controller.signal });
            controller.abort(reason);

            assert.strictEqual(await rejection(request), reason);
        });

        it("returns the result if the reply beats the abort", async () => {
            const { a, b } = linked_stores();
            b.set_rpc("double", (value) => value * 2);

            const { signal } = new AbortController();

            assert.strictEqual(await a.call_rpc("b.double", [4], { signal }), 8);
        });
    });
});
