const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");
const { getEventListeners } = require("events");
const Entangld = require("../lib/Datastore.js");
const { EntangldError, EntangldAbortError } = require("../lib/error.js");

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

describe("abort", () => {

    it("rejects every waiting request with the reason", async () => {
        const { a } = linked_stores(() => false);
        const reason = new Error("stopping");

        const first = a.get("b.one");
        const second = a.call_rpc("b.two", [ 1 ], { timeout_ms: 60000 });

        assert.strictEqual(a.abort(reason), 2);
        assert.strictEqual(await rejection(first), reason);
        assert.strictEqual(await rejection(second), reason);
        assert.strictEqual(Object.keys(a._requests).length, 0);
    });

    it("rejects with an EntangldAbortError by default", async () => {
        const { a } = linked_stores(() => false);

        const request = a.get("b.value");
        a.abort();

        const err = await rejection(request);
        assert.ok(err instanceof EntangldAbortError);
        assert.ok(err instanceof EntangldError);
        assert.strictEqual(err.name, "EntangldAbortError");
    });

    it("clears the time limit and the signal listener", async () => {
        const { a } = linked_stores(() => false);
        const controller = new AbortController();

        const request = a.get("b.value", undefined, { timeout_ms: 60000, signal: controller.signal });
        assert.strictEqual(getEventListeners(controller.signal, "abort").length, 1);

        a.abort();
        await rejection(request);

        assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0);
    });

    it("lets the process exit while a request with a time limit waits", function () {
        this.timeout(10000);

        // The request's timer would hold the process open for a minute
        const script = `
            const Entangld = require(${JSON.stringify(path.join(__dirname, "../lib/Datastore.js"))});
            const a = new Entangld();
            a.transmit(() => { });
            a.attach("b", {});
            a.get("b.value", undefined, { timeout_ms: 60000 }).catch(() => { });
            setTimeout(() => a.abort(), 10);
        `;

        return new Promise((resolve, reject) => {
            const started = Date.now();
            const child = spawn(process.execPath, [ "-e", script ], { stdio: "inherit" });
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error("The process was still running after 5 s"));
            }, 5000);

            child.on("exit", (code) => {
                clearTimeout(timer);
                try {
                    assert.strictEqual(code, 0);
                    assert.ok(Date.now() - started < 5000);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    });

    it("ignores a reply which arrives after aborting", async () => {
        const { a, b } = linked_stores(() => false);
        const sent = [];
        a.transmit((msg) => sent.push(msg));

        const request = a.get("b.value");
        a.abort();
        await rejection(request);

        assert.doesNotThrow(() => {
            a.receive({ type: "value", uuid: sent[0].uuid, value: 1 }, b);
        });
    });

    it("leaves later requests, attachments and subscriptions alone", async () => {
        const { a, b } = linked_stores();
        const seen = [];

        await a.subscribe("b.value", (path, value) => seen.push(value));
        b.set("value", 1);

        assert.strictEqual(a.abort(), 0);
        assert.strictEqual(a.abort(), 0);

        b.set("value", 2);
        assert.deepStrictEqual(seen, [ 1, 2 ]);
        assert.deepStrictEqual(a.namespaces, [ "b" ]);
        assert.strictEqual(await a.get("b.value"), 2);
    });

    it("doesn't end local functions which are running", async () => {
        const store = new Entangld();
        let finish;
        store.set("slow", () => new Promise((resolve) => { finish = resolve; }));

        const request = store.get("slow", undefined, { timeout_ms: 60000 });
        assert.strictEqual(store.abort(), 0);

        finish(5);
        assert.strictEqual(await request, 5);
    });

    it("isn't done by detach(), so a reply after attaching again still arrives", async () => {
        const { a, b } = linked_stores(() => false);
        const sent = [];
        a.transmit((msg) => sent.push(msg));

        const request = a.get("b.value");
        a.detach("b");
        a.attach("b", b);

        a.receive({ type: "value", uuid: sent[0].uuid, value: 7 }, b);
        assert.strictEqual(await request, 7);
    });
});
