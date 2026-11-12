/**
 * A random (v4) uuid, in Node and in browsers.
 *
 * Browsers on secure pages and Node 19 and later have crypto.randomUUID() on
 * globalThis. Node 18 has it in its crypto module, which the "browser" field in
 * package.json leaves out of browser bundles. A browser page that isn't secure
 * (plain http, not localhost) has only crypto.getRandomValues().
 *
 * @author Claude <noreply@anthropic.com>
 * Reviewed-by: Jonathan D. B. Van Schenck <jvschenck@novadynamics.com>
 */

/**
 * A v4 uuid from 16 random bytes.
 *
 * @param {Uint8Array} bytes
 * @return {string}
 */
function format_v4(bytes) {
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Pick the uuid source for this runtime.
 *
 * @param {object} [web_crypto] - globalThis.crypto, if any.
 * @param {Function} [load_node_crypto] - returns Node's crypto module, or {} in a browser bundle.
 * @return {Function} returns a new uuid string.
 */
// randomUUID needs Node 14.17 anyway, which has globalThis
function make_uuid(web_crypto = globalThis.crypto, load_node_crypto = () => require("crypto")) { // eslint-disable-line node/no-unsupported-features/es-builtins
    if ( typeof web_crypto?.randomUUID == "function" ) return () => web_crypto.randomUUID();
    let node_crypto = {};
    try {
        node_crypto = load_node_crypto() || {};
    } catch (err) {
        // Not in Node
    }
    if ( typeof node_crypto.randomUUID == "function" ) return () => node_crypto.randomUUID();
    if ( typeof web_crypto?.getRandomValues == "function" ) {
        return () => format_v4(web_crypto.getRandomValues(new Uint8Array(16)));
    }
    throw new Error("entangld needs crypto.randomUUID or crypto.getRandomValues");
}

module.exports = make_uuid();
module.exports.make_uuid = make_uuid;
module.exports.format_v4 = format_v4;
