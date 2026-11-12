const assert = require("assert");
const uuidv4 = require("../lib/uuid.js");
const { make_uuid } = uuidv4;

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const node_crypto = require("crypto");

describe("uuid", () => {
    it("makes distinct v4 uuids", () => {
        const ids = new Set(Array.from({ length: 1000 }, () => uuidv4()));
        assert.strictEqual(ids.size, 1000);
        for ( const id of ids ) assert.match(id, V4);
    });

    it("uses globalThis.crypto.randomUUID when there is one (browsers, Node 19+)", () => {
        const uuid = make_uuid({ randomUUID: () => "from-web-crypto" }, () => assert.fail("Node's crypto was loaded"));
        assert.strictEqual(uuid(), "from-web-crypto");
    });

    it("falls back to Node's crypto module (Node 18)", () => {
        const uuid = make_uuid(null, () => ({ randomUUID: () => "from-node-crypto" }));
        assert.strictEqual(uuid(), "from-node-crypto");
    });

    it("builds one from getRandomValues on a page that isn't secure", () => {
        // In a browser bundle, the "browser" field turns require("crypto") into {}
        const page = { getRandomValues: (a) => node_crypto.getRandomValues(a) };
        const uuid = make_uuid(page, () => ({}));
        const ids = new Set(Array.from({ length: 1000 }, () => uuid()));
        assert.strictEqual(ids.size, 1000);
        for ( const id of ids ) assert.match(id, V4);
    });

    it("says what's missing when there's no crypto at all", () => {
        assert.throws(() => make_uuid(null, () => { throw new Error("no module"); }), /crypto.randomUUID or crypto.getRandomValues/);
    });
});
