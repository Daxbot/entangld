const assert = require("assert");
const Entangld = require("../lib/Datastore.js");
const { EntangldError, EntangldTimeoutError } = require("../lib/error.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

describe("Timeouts", () => {

    describe("get", () => {

        it("rejects if a remote store never replies", async () => {
            const { a } = linked_stores(() => false);

            const err = await rejection(a.get("b.value", undefined, { timeout_ms: 10 }));

            assert(err instanceof EntangldTimeoutError);
            assert(err instanceof EntangldError);
            assert.strictEqual(err.name, "EntangldTimeoutError");
            assert.strictEqual(err.path, "b.value");
            assert.strictEqual(err.timeout_ms, 10);
        });

        it("removes the request after timing out", async () => {
            const { a } = linked_stores(() => false);

            await rejection(a.get("b.value", undefined, { timeout_ms: 10 }));

            assert.strictEqual(Object.keys(a._requests).length, 0);
        });

        it("resolves if the reply beats the timeout", async () => {
            const { a, b } = linked_stores();
            b.set("value", 7);

            const value = await a.get("b.value", undefined, { timeout_ms: 1000 });

            assert.strictEqual(value, 7);
            assert.strictEqual(Object.keys(a._requests).length, 0);
        });

        it("ignores a reply which arrives after the timeout", async () => {
            const { a, b } = linked_stores(() => false);
            const sent = [];
            a.transmit((msg) => sent.push(msg));

            await rejection(a.get("b.value", undefined, { timeout_ms: 10 }));

            assert.doesNotThrow(() => {
                a.receive({ type: "value", uuid: sent[0].uuid, value: 1 }, b);
            });
        });

        it("passes params through and keeps options off the wire", async () => {
            const sent = [];
            const { a, b } = linked_stores((msg) => {
                sent.push(JSON.stringify(msg));
                return true;
            });
            b.set("echo", (params) => params);

            const value = await a.get("b.echo", ["x"], { timeout_ms: 1000 });

            assert.deepStrictEqual(value, ["x"]);
            assert(!sent.join("").includes("timeout_ms"));
        });

        it("rejects if a local function never settles", async () => {
            const a = new Entangld();
            a.set("hang", () => new Promise(() => { }));

            const err = await rejection(a.get("hang", undefined, { timeout_ms: 10 }));

            assert(err instanceof EntangldTimeoutError);
        });

        it("resolves if a local function beats the timeout", async () => {
            const a = new Entangld();
            a.set("slow", () => wait(1).then(() => 8));

            assert.strictEqual(await a.get("slow", undefined, { timeout_ms: 1000 }), 8);
        });

        it("keeps the original error if a local function rejects", async () => {
            const a = new Entangld();
            a.set("bad", () => Promise.reject(new Error("boom")));

            const err = await rejection(a.get("bad", undefined, { timeout_ms: 1000 }));

            assert.strictEqual(err.message, "boom");
        });

        it("returns local data", async () => {
            const a = new Entangld();
            a.set("value", 3);

            assert.strictEqual(await a.get("value", undefined, { timeout_ms: 10 }), 3);
        });

        it("never settles a lost reply without timeout_ms", async () => {
            const { a } = linked_stores(() => false);
            let settled = false;

            a.get("b.value").finally(() => {
                settled = true;
            });
            await wait(20);

            assert.strictEqual(settled, false);
            assert.strictEqual(Object.keys(a._requests).length, 1);
        });

        it("throws on an invalid timeout_ms", () => {
            const a = new Entangld();

            for (const timeout_ms of [0, -1, NaN, Infinity, 2147483648, "5", null]) {
                assert.throws(() => a.get("value", undefined, { timeout_ms }), TypeError);
            }
        });
    });

    describe("call_rpc", () => {

        it("rejects if a remote store never replies", async () => {
            const { a } = linked_stores(() => false);

            const err = await rejection(a.call_rpc("b.rpc", [1], { timeout_ms: 10 }));

            assert(err instanceof EntangldTimeoutError);
            assert.strictEqual(err.path, "b.rpc");
        });

        it("returns the result if the reply beats the timeout", async () => {
            const { a, b } = linked_stores();
            b.set_rpc("double", (value) => value * 2);

            const value = await a.call_rpc("b.double", [4], { timeout_ms: 1000 });

            assert.strictEqual(value, 8);
        });

        it("rejects on an invalid timeout_ms", async () => {
            const a = new Entangld();

            const err = await rejection(a.call_rpc("rpc", [], { timeout_ms: 0 }));

            assert(err instanceof TypeError);
        });
    });
});
