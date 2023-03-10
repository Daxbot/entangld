const { v4:uuidv4 } = require("uuid");

/**
 * Message class for Entangld.
 *
 * These messages are used for executing datastore operations between
 * remote datastores. In these relationships, there is always an upstream
 * and downstream pair, so that `get`, `set`, `push` and `subscribe` messages
 * are created upstream and passed downstream while `event` and `value` messages
 * are created downstream and are passed back up. `unsubscribe` events can travel
 * in both directions. To maintain consistency, the internal `.path` attribute
 * will always refer a path relative to the downstream datastore, since the
 * downstream datastores do not necessarilly have access to the upstream store
 * structure, and so cannot generally construct upstream paths. This means that
 * the `.path` attribute is a `tree` relative to the upstream datastore, and
 * the upstream path can be reconstructed as:
 * ```javascript
 *  > upstream._namespaces.get(downstream) + "." + msg.path;
 * ```
 * Since `unsubscribe` messages can pass either upstream or downstream, the notion
 * of a path is ill-defined, and so unsubscribe messages should have their `.path`
 * attributes set to undefined or null.
 *
 * Most messages will also have a `.uuid` attribute. For `get`/`value` messages,
 * this allows for the value to be properly linked back up with the original `get`
 * message. For the `subscribe`/`unsubscribe`/`event` messages, this allows for
 * callback functions to be trigger properly, and for unsubscribe messages to
 * propogate both directions. `set`/`push` messages do not use the `.uuid` attribute
 * since they require no response.
 */
class Entangld_Message {

    constructor({type, path, value, uuid, params, every}) {

        this.type = type;
        this.path = path;
        this.value = value;
        this.uuid = uuid;
        this.params = params;
        this.every = every;
    }

    // ----------------------
    //    Class Methods
    // ----------------------
    /**
     * Create a `get` message for remote datastores
     *
     * @param {string} tree - the path relative to the remote datastore
     * @param {*} [get_params=undefined] - any parameters to be passed to the
     *                                        remote datastore's local get function
     * @return {Entangld_Message} - The get message to pass to the remote datastore
     */
    static get(tree, get_params) {
        return new this({
            type: "get",
            path : tree, // path needs to be relative to downstream store
            value : get_params,
            uuid : uuidv4() // Gets generate a new uuid
        });
    }

    /**
     * Create a `value` message in response to a `get` message
     *
     * @param {Entangld_Message} get_msg - the `get` message which this is in response to
     * @param value - the value of the `get`
     * @return {Entangld_Message} - The `value` message to pass back
     */
    static value(get_msg, value) {
        return new this({
            type: "value",
            path : get_msg.path, // Resond with the get's path, which is relative to this store
            value : value,
            uuid : get_msg.uuid // Respond with the get's uuid
        });
    }

    /**
     * Create a `set`/`push` message for a remote datastore
     *
     * @param {Object} obj - The parameter object for the set/push
     * @param {string} obj.type - either "set" or "push"
     * @param {string} obj.tree - the path (relative to the downstream datastore)
     * @param {*} obj.value - the value to insert into the datastore
     * @param {*} obj.params - any additional parameters
     * @return {Entangld_Message} - the "set" or "push" message
     */
    static setpush({type = "set", tree, value, params}) {
        if (!["set", "push"].includes(type)) { throw new Error(`Invalid type (${type}) for setpush`); }
        return new this({
            type: type,
            path : tree,
            value : value,
            params : params
        });
    }

    /**
    * Construct subscribe message
    *
    * @param {string} tree - the path (relative to the downstream datastore)
    * @param {uuidv4} uuid - the subscription uuid
    * @return {Entangld_Message} the `subscribe` message
    */
    static subscribe(tree, uuid, every = null) {
        return new this({
            type : "subscribe",
            path : tree,
            uuid : uuid,
            every : every
        });
    }

    /**
     * Create an `event` message to return data to subscribe callbacks
     *
     * @param {string} path - the path (relative to the downstream store)
     * @param {*} value - the updated datastore value at the path
     * @param {uuidv4} uuid - the uuid of the subscribe being triggered
     * @return {Entangld_Message} the `event` message
     */
    static event(path, value, uuid) {
        return new this({
            type : "event",
            path : path,
            value : value,
            uuid : uuid
        });
    }


    /**
     * Create an unsubscribe message for a subscription uuid
     *
     * @param {String} uuid - the subscription uuid
     */
    static unsubscribe(uuid) {
        return new this({
            type: "unsubscribe",
            // path is ommitted from unsubscribe messages
            uuid : uuid
        });
    }

}

module.exports = exports = Entangld_Message;
