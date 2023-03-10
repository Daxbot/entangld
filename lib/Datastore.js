const { v4:uuidv4 } = require("uuid");
const EventEmitter = require("events");
const uuid_regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Entangld_Message = require("./Message.js");
const Subscription = require("./Subscription.js");
const { EntangldError, RPCError } = require("./error.js");
const {
    is_beneath,
    extract_from_path,
    partial_copy,
    dereferenced_copy,
    parameter_parser
} = require("./utils.js");

/**
 * Synchronized Event Store
 *
 * @extends EventEmitter
 */
class Entangld extends EventEmitter {

    constructor() {
        super();

        this._stores = new Map();
        this._namespaces = new Map();

        this._transmit = () => { };
        this._local_data = {};
        this._requests = {};
        this._subscriptions = [];

        // If this is turned on, when someone .get()s an object we will query
        // its children to see if they are functions. We will then call those
        // functions and return their values.  This should be the default
        // behavior, but it is rather expensive.  TODO
        this._deref_mode = false;
    }

    /**
     * Get namespaces
     *
     * @readonly
     * @return {array} namespaces - an array of attached namespaces
     */
    get namespaces() {

        return Array.from(this._stores.keys());
    }

    /**
     * Get list of subscriptions associated with this object
     *
     * Note, this will include `head`, `terminal` and `pass through` subscriptions,
     * which can be checked using getter methods of the subscription object.
     *
     * @readonly
     * @return {Subscription[]} array of Subscriptions associated with this object
     */
    get subscriptions() {
        return this._subscriptions.map(v => v.static_copy());
    }

    /**
     * Get namespace for a store
     *
     * @readonly
     * @return {string} namespace for the given store
     */
    namespace(store) {

        // return this._namespaces(store);
        return this._namespaces.get(store);
    }

    /**
     * Attach a namespace and a store
     *
     * @param {string} namespace a namespace for this store.
     * @param {object} obj an object that will be sent along with "transmit"
     * callbacks when we need something from this store.
     * @throws {TypeError} if namespace/obj is null or empty.
     * @throws {EntangldError} if you try to attach to the same namespace twice.
     */
    attach(namespace, obj) {

        // Sanity checks
        if (!namespace)
            throw TypeError("You cannot attach() a null or empty namespace");

        if (!obj)
            throw TypeError("You cannot attach() a null or empty object");

        if (this._stores.has(namespace))
            throw new EntangldError("You already attach()ed that namespace");

        // Attach the store and namespace
        this._stores.set(namespace, obj);
        this._namespaces.set(obj, namespace);

        // Create an empty local node so that this attach point is visible
        this._set_local(namespace, {});

        // Find and update any subscriptions that fall beneath the new namespace
        const subscriptions = this._subscriptions.filter(
            s => s.is_beneath(namespace)
        );

        // Clean up the old entries
        this._unsubscribe(subscriptions);

        // Re-subscribe
        subscriptions.forEach(s => {
            this._subscribe(s.path, s.callback, s.upstream, s.uuid, s.every);
        });
    }

    /**
     * Detach a namespace / obj pair.
     *
     * If you only pass a namespace or a store, it will find the missing item
     * before detaching.
     *
     * @param {string} [namespace] the namespace.
     * @param {object} [obj] the store object.
     * @return {boolean} true if the element existed and was removed.
     * @throws {EntangldError} Error will be thrown if you don't pass at least
     * one parameter.
     */
    detach(namespace, obj) {

        if (!namespace && !obj) {
            const msg = "You must specify at least one of either namespace or "
                + "object when calling detach()";
            throw new EntangldError(msg);
        }

        if (!obj) obj = this._stores.get(namespace);
        if (!namespace) namespace = this._namespaces.get(obj);

        // Detach this namespace placeholder from the local store
        this._set_local(namespace, undefined);

        return this._stores.delete(namespace)
            && this._namespaces.delete(obj);
    }

    /**
     * Transmit
     *
     * Specify a callback to be used so we can transmit data to another store.
     * Callback will be passed (message, obj) where 'message' is an
     * Entangld_Message object and obj is the object provided by attach().
     *
     * @param {function} func the callback function.
     * @throws {TypeError} if func is not a function.
     */
    transmit(func) {
        if (typeof (func) != "function")
            throw TypeError("func must be a function");

        this._transmit = func;
    }

    /**
     * Receive
     *
     * Call this function with the data that was sent via the transmit()
     * callback.
     *
     * @param {Entangld_Message} msg the message to process.
     * @param {object} obj the attach() object where the message originted.
     *
     * @throws {ReferenceError} if event object was not provided.
     * @throws {EntangldError} if an unknown message type was received.
     */
    receive(msg, obj) {

        if (msg.type == "set" || msg.type == "push") {
            // Remote "set" request
            this.set(msg.path, msg.value, msg.type, msg.params);

        } else if (msg.type == "get") {
            // Remote "get" request
            this.get(msg.path, msg.value).then((val) => {

                const response = Entangld_Message.value(msg,val);

                this._transmit(response, obj);
            });

        } else if (msg.type == "value") {
            // Incoming value reply
            let resolve = this._requests[msg.uuid];
            resolve(msg.value);

            //Clean up request
            delete this._requests[msg.uuid];

        } else if (msg.type == "event") {
            // Incoming event
            if (obj === undefined)
                throw new ReferenceError("receive() called without object");

            // From our perspective the path is now prepended with the namespace
            msg.path = this._namespaces.get(obj) + "." + msg.path;

            // Find and dispatch any subscriptions
            let count = 0;
            for (let s of this._subscriptions) {

                if (s.matches_event_message(msg)) {

                    // Call the callback
                    s.call(msg.path, msg.value);
                    count++;
                }
            }

            // No one is listening. This may happen if an event triggers while
            // we are still unsubscribing, or if a downstream subscription gets
            // orphaned
            if (count === 0) {

                // Reply with unsubscribe request
                const response = Entangld_Message.unsubscribe(msg.uuid);
                this._transmit(response, obj);
            }

        } else if (msg.type == "subscribe") {
            // Incoming remote subscription request

            // Create a new subscription that simply transmits when triggered
            //  the "tree" from the subscribe message is scoped to be a "path"
            //  here in this datastore
            this._subscribe(msg.path, (path, val) => {
                // The "path" here is relative to this datastore, and can
                //  potentially be beneath msg.params.tree
                const response = Entangld_Message.event(path,val,msg.uuid);
                this._transmit(response, obj);
            }, obj, msg.uuid, msg.every);

        } else if (msg.type == "unsubscribe") {
            // Incoming remote unsubscribe request

            // Unsubscribe to any matching subscriptions.
            this._unsubscribe(this._subscriptions.filter(
                s => s.matches_unsubscribe_message(msg))
            );

        } else {
            // Default
            throw new EntangldError(
                "Received unknown message: " + JSON.stringify(msg));
        }
    }


    /**
     * Push an object into an array in the store.
     *
     * Convenience method for set(path, o, "push").
     *
     * @param {string} path the path to set (like "system.fan.voltage").
     * @param {object} data the object or function you want to store at path.
     * @param {number} [limit] maximum size of the array. Older entries will be
     * removed until the array size is less than or equal to limit.
     *
     * @throws {TypeError} if path is not a string.
     */
    push(path, data, limit=null) {

        this.set(path, data, "push", { limit });

    }


    /**
     * Set an object into the store
     *
     * @param {string} path the path to set (like "system.fan.voltage").
     * @param {object} data the object or function you want to store at path.
     * @param {string} [operation_type="set"] whether to set or push the new
     * data (push only works if the data item exists and is an array).
     * @param {object} [params] additional parameters.
     *
     * @throws {TypeError} if path is not a string.
     */
    set(path, data, operation_type="set", params={}) {

        // Sanity check
        if (typeof (path) != "string")
            throw TypeError("path must be a string");

        let [obj, , tree] = this._get_remote_object(path);

        if (obj === undefined) {
            // Set local or remote item

            // Is this going to mess with an attached store?
            for (let [namespace] of this._stores) {

                if (is_beneath(namespace, path)) {

                    const msg = `Cannot set ${path} - doing so would overwrite `
                              + `remote store attached at ${path}. `
                              + "Please detach first";
                    throw new EntangldError(msg);
                }
            }

            this._set_local(path, data, operation_type, params);

            // Check subscriptions to see if we need to run an event
            for (let s of this._subscriptions) {

                // is this broken? if path="data.element" and s.path="data",
                //  then the callback will get triggered, but with the sub path,
                //  i.e. cb("data.element",data), except, the callbacks often
                //  don't check the path, so it will think it is getting a 'data'
                //  object, not a "data.path" object . . .
                if (s.is_above(path)) s.call(path, data);
            }

        } else {

            const msg = Entangld_Message.setpush({
                type : operation_type,
                tree : tree,
                value : data,
                params : params
            });

            this._transmit(msg, obj);
        }

    }


    /**
     * Set a function as an RPC in the datastore
     *
     * @param {string} path the path to set (like "system.fan.voltage").
     * @param {function} func the function you want to store at path.
     * @param {object} opts
     * @param {?string} [opts.description=null] description for the function
     * @param {?string} [opts.function_string=null] optional string of function source code to pass to parameter_parser
     *
     * @throws {TypeError} if path is not a string.
     */
    set_rpc(path, func, {description, function_string}={}) {
        // Sanity check
        if (typeof (path) != "string")
            throw TypeError("path must be a string");
        if (typeof (func) != "function")
            throw TypeError("func must be a function");

        const all_params = parameter_parser(function_string == null ? func.toString() : function_string);
        // const req_params = all_params.filter((p)=>p.includes("="))

        if (!all_params.length) all_params.push("value");

        const usage = all_params.map((p)=>`<${p}>`).join(" ");

        return this.set(path, async (params)=>{
            if (!params) return "Usage: " + usage + " : " +  (description == null ? "No description provided" : description);

            try {
                // Uncomment for requiring all params
                // if (params.length < req_params.length) throw new Error(`Invalid Parameters. (needed: ${req_params.length}, got: ${params.length})`);
                return [true, await func(...params)];
            } catch(e) {
                return [false, RPCError.serialize_local_error(e)];
            }

        });
    }

    /**
     * Set a class instance as an RPC object in the datastore
     *
     * @param {*} object The object to attach
     * @param {Array} key_description_pairs An array of key, description pairs
     * @param {object} opts
     * @param {?string} [opts.description=null] description for the function
     * @param {?string} [opts.function_string=null] optional string of function source code to pass to parameter_parser
     *
     * @throws {TypeError} if path is not a string.
     */
    set_rpc_class(obj, key_description_pairs=[], { namespace="" }={}) {
        for ( const [ key, description ] of (key_description_pairs) ) {
            this.set_rpc(
                (namespace?(namespace+"."):"")+key,
                obj[key].bind(obj),
                { description, function_string:obj[key].toString() }
            );
        }
    }

    /**
     * Call an RPC procedure in the datastore
     *
     * @param {string} path the path to query (like "system.voltage").
     * @param {Array} [args=[]] the arguments to pass to the RPC.
     * @throws {RPCError} if the rpc call experienced an error
     * @return {Promise} promise resolving to return value of the rpc
     */
    call_rpc(path, args=[]) {
        return this.get(path,args).then((args) => {
            if (args[0] === false) throw RPCError.from_remote_error(args[1]);
            if ( typeof(args[0]) == "string" ) return args[0];
            return args[1];
        });
    }

    /**
     * Get the remote store in a path
     *
     * If path contains a remote store, return the object as well as the
     * relative path to the remote store
     *
     * Example: let A,B be stores. If A.attach("some.path.to.B", B) then
     * _get_remote_object("some.path.to.B.data") will return
     * [B, "some.path.to.B", "data"] and _get_remote_object("nonexistent.path")
     * will return [undefined, undefined, path]
     *
     * @private
     * @param {string} path the path to investigate.
     *
     * @return {array<object, string, string>} array whose elements are
     * [obj, namespace, relative path below store].  If no store is found,
     * return value is [undefined, undefined, path].
     */
    _get_remote_object(path) {

        // We don't know what part of path might be a store key.  So we need to
        // get all store keys and search (vs .get)
        for (let [namespace, obj] of this._stores) {

            if (is_beneath(path, namespace)) {

                // Exact match means path is the root of the attached store
                if (path.length == namespace.length) {

                    return [obj, namespace, ""];
                }

                // Path is longer than namespace. Make sure we match to a period
                if (path.substr(namespace.length, 1) == ".") {

                    path = path.substr(namespace.length + 1);
                    return [obj, namespace, path];
                }
            }
        }

        // Default: we did not find a store
        return [undefined, undefined, path];
    }

    /**
     * Get an object from the store.
     *
     * Note: using max_depth, especially large max_depth, involves a lot of
     * recursion and may be expensive.
     *
     * @param {string} path the path to query (like "system.voltage").
     * @param {object} [params] the parameters to be passed to the remote
     * function (RPC) or the maximum depth of the returned object (normal mode).
     *
     * @throws {TypeError} if path is not a string.
     * @return {Promise} promise resolving to the object at that path.
     */
    get(path, params) {
        // Sanity check
        if (typeof (path) != "string")
            throw TypeError("path must be a string");

        // If an attach()ed store path masks (matches but is shorter than) the
        // path, we are returning that store
        let [obj, , tree] = this._get_remote_object(path);

        // If object is undefined, we are getting a local item
        if (obj === undefined) {

            // Get a reference to the object
            let [data, remaining_path] = extract_from_path(
                this._local_data, path);

            // If it is a function, call it
            if (typeof (data) == "function") {

                let result = data(params);

                // Get a promise resolving to the result
                let p = (result && result.constructor && result.constructor.name
                    && result.constructor.name == "Promise") ?
                    result : new Promise((res) => res(result));

                return p.then((val) => {

                    // If we have a remaining path, try to navigate it before
                    // returning
                    [data, remaining_path] = extract_from_path(
                        val, remaining_path);

                    return Promise.resolve(
                        (remaining_path === "")? data : undefined);
                });
            }

            // Path does not point to function.  So use params as a max depth
            // and return a Promise resolving to a dereferenced partial copy
            if (typeof (params) == "number") {

                if (this._deref_mode) {

                    return dereferenced_copy(partial_copy(data, params));
                } else {

                    return new Promise(
                        (res) => res(partial_copy(data, params)));
                }
            }

            // Default: return a promise resolving to the entire object as-is
            if (this._deref_mode) {

                return dereferenced_copy(data);

            } else {

                return new Promise((res) => res(data));
            }
        }

        // Request the data from the remote store
        const msg = Entangld_Message.get(tree, params);

        return new Promise((res) => {
            this._requests[msg.uuid] = res;
            this._transmit(msg, obj);
        });

    }

    /**
     * Subscribe to change events for a path
     *
     * If objects at or below this path change, you will get a callback
     *
     * Subscriptions to keys within attach()ed stores are remote subscriptions.
     * If several stores are attached in some kind of arrangement, a given key
     * may actually traverse multiple stores!  Since each store only knows its
     * immediate neighbors - and has no introspection into those neighbors - each
     * store is only able to keeps track of the neighbor on each side with
     * respect to a particular path and has no knowledge of the eventual
     * endpoints.  This means that subscribing across several datstores is accomplished
     * by daisy-chaining 2-way subscriptions across each datastore interface.
     *
     * For example, let's suppose capital letters represent Entangld stores and
     * lowercase letters are actual objects.  Then  the path "A.B.c.d.E.F.g.h"
     * will represent a subscription that traverses four Entangld stores.
     * From the point of view of a store in the middle - say, E - the "upstream"
     * is B and the "downstream" is F.
     *
     * Each store involved keeps track of any subscriptions with which it is
     * involved.  It tracks the upstream and downstream, and the uuid of the
     * subscription.  The uuid is the same across all stores for a given
     * subscription.  For a particular store, the upstream is null if it is the
     * original link in the chain (called the `head`), and the downstream is
     * null if this store owns the endpoint value (called the `tail`). Any
     * subscription which is not the head of a chain is called a `pass through`
     * subscription, because it exist only to pass `event` messages back up the
     * chain to the head (where the user-provided callback function exists).
     * subscriptions can be checked to see if they are `pass through` type via
     * the getter `sub.is_pass_through`.
     *
     * @param {string} path the path to watch.  Use of '*' is allowed as a wildcard (e.g. "system.*")
     * @param {function} func the callback - will be of the form (path, value).
     * @param {number|null} [every=null] the number of `set` messages to wait before calling callback
     *
     * @throws {TypeError} if path is not a string.
     * @return {uuidv4} - the uuid of the subscription
     */
    subscribe(path, func, every = null) {

        return this._subscribe(path, func, null, null, every);
    }

    /**
     * Create a subscription
     *
     * This is an internal function that allows us to specify the new
     * subscription's upstream and UUID.
     *
     * @private
     * @param {string} path the path to watch.
     * @param {function} func the callback - will be of the form (path, value).
     * @param {(Entangld|null)} [upstream=null] the Engangld next upstream in the path.
     * @param {(uuidv4|null)} [uuid=null] the UUID to use for this subscription.
     *
     * @emits {str} subscription - when this datastore is the terminal datastore of a
     *                             subscription request, this datastore emits the path
     *                             and uuid.
     * @throws {TypeError} if path is not a string.
     * @return {uuidv4} - the uuid of the subscription
     */
    _subscribe(path, func, upstream = null, uuid = null, every = null) {


        // Supply a UUID if none provided
        uuid = uuid || uuidv4();


        // Sanity check
        if (typeof (path) != "string")
            throw TypeError("path must be a string");

        let [obj, /*namespace*/, tree] = this._get_remote_object(path);

        // Create the subscription object
        let new_sub = new Subscription({
            path : path,
            downstream : obj,
            upstream : upstream,
            uuid : uuid,
            callback : func,
            every : every
        });
        // Filter out any residual subscriptions
        // Note, residual subscriptions should only exist if a remote datastore (connected via a
        // socket, or something like that) re-attaches this datastore after the connection between
        // the two was uncerimonally destroyed, otherwise the internal clean up of the attach
        // should have propegated down to prevent this.
        // Note, this should still allow circular references, since "match_subscriptions" requires
        // both the uuid and path to match
        this._subscriptions = this._subscriptions.filter(sub => !new_sub.matches_subscription(sub));

        // Add the new subscription here
        this._subscriptions.push(new_sub);

        // Commission any subscribes downstream, if this is a remote subscription
        if (new_sub.has_downstream) {
            const msg = Entangld_Message.subscribe(tree, uuid, every);
            this._transmit(msg, obj);

        } else { // this is the terminal datastore, so emit subscription received
            this.emit("subscription", path, uuid);
        }

        return new_sub.uuid;
    }

    /**
     * Check for subscription
     *
     * Are we subscribed to a particular remote path?
     *
     * @param {String} subscription the subscription to check for.
     *
     * @return {Boolean} true if we are subscribed.
     */
    subscribed_to(path) {

        for (let s of this._subscriptions) {

            if (s.matches_path(path)) return true;
        }

        return false;
    }

    /**
     * Unubscribe to change events for a given path or uuid.
     *
     * Caution - if a path is provided, _all_ events belonging to you with that
     * path will be deleted, so if you have multiple subscriptions on a single path,
     * and only want one of them to be removed, you must provide the uuid instead.
     *
     * @param {(String|uuidv4)} path_or_uuid - the path (or uuid) to unwatch.
     * @throws {EntangldError} if no subscriptions were found.
     * @return {number} count of subscriptions removed.
     */
    unsubscribe(path_or_uuid) {

        let matching_subs = [];

        if (path_or_uuid.match(uuid_regex)) {
            // `path_or_uuid` is a uuid, so find any matching subs with that uuid
            matching_subs = this._subscriptions.filter(
                s => s.matches_uuid(path_or_uuid) && !s.is_pass_through
            );
        } else {
            // the arg is a path
            matching_subs = this._subscriptions.filter(
            // search for subs which both have the correct path AND are not
            // pass through, so that pass through subs don't get orphaned
                s => s.matches_path(path_or_uuid) && !s.is_pass_through
            );
        }

        // Throw an error if none found
        if (matching_subs.length == 0) {

            throw new EntangldError(`unsubscribe found no subscriptions matching ${path_or_uuid}`);
        }

        this._unsubscribe(matching_subs);

        return matching_subs.length;
    }

    /**
     * Unsubscribe tree.
     *
     * Remove any subscriptions that are beneath a path.
     *
     * @param {string} path the tree to unwatch.
     *
     * @throws {EntangldError} error if there are stores we cannot detach
     * (i.e. they belong to someone else / upstream != null)
     */
    unsubscribe_tree(path) {

        let matching_subscriptions = this._subscriptions.filter(
            // Get all the subs beneath this path, which are not pass throughs,
            // so that subscriptions don't get orphaned
            s => s.is_beneath(path) && !s.is_pass_through
        );

        this._unsubscribe(matching_subscriptions);

        // Error on any remaining `pass through` subscriptions
        matching_subscriptions = this._subscriptions.filter(
            s => s.is_beneath(path)
        );

        if (matching_subscriptions.length != 0) {

            const msg = `Unable to completely unsubscribe the tree '${path}' `
                + "because some subscriptions are remote or passthrough "
                + "(we are not the owner, just a downstream)";

            throw new EntangldError(msg);
        }
    }

    /**
     * Unubscribe to change events
     *
     * This is an internal function that does not check for safety.  It simply
     * deletes the requested paths and notifies any downstream.
     *
     * @private
     * @param {Subscription[]} subscriptions an array of objects containing at minimum
     * uuid and upstream keys
     */
    _unsubscribe(subscriptions) {

        // Get a list of uuids to remove
        const uuids = subscriptions.map(s => s.uuid);

        // Drop all subscriptions with matching uuid
        this._subscriptions = this._subscriptions.filter(
            s => !(uuids.includes(s.uuid))
        );

        // Notify the downstream for any deleted subscriptions that are remote
        subscriptions.forEach((s) => {
            if (!s.has_downstream) { // emit unsubscription
                this.emit("unsubscription", s.path, s.uuid);
            } else { // Notify downstreams
                const msg = Entangld_Message.unsubscribe(s.uuid);
                this._transmit(msg, s.downstream);
            }
        });
    }

    /**
     * Set local object
     *
     * Sets object into local data store.
     *
     * @private
     * @param {string} path the path at which to store the object.
     * @param {object} data the object to store. If undefined, it unsets path.
     * @param {string} [op_type] whether to set or push the new
     * data (push only works if the data item exists and is an array).
     * @param {object} [params] additional parameters.
     *
     * @throws {EntangldError} if attempting to set root store to a non-object.
     * @throws {TypeError} if attempting to push to a non-array.
     */
    _set_local(path, data, op_type="set", params={}) {
        // Empty path means set everything
        if (path === "") {
            if(data === undefined)
                data = {};

            // Sanity check
            if (typeof (data) != "object") {
                const msg = "You are trying to set the root store to something "
                    + `(${typeof (data)}) besides an object!`;

                throw EntangldError(msg);
            }

            this._local_data = data;
            return;
        }

        let elements = path.split(".");
        let last = elements.pop();
        let pointer = this._local_data;

        for (let el of elements) {

            if (!pointer[el]) pointer[el] = {};
            pointer = pointer[el];
        }

        // Handle unset operations
        if (data === undefined) {

            delete (pointer[last]);
            return;
        }

        if (op_type == "push") {

            if (pointer[last] && typeof (pointer[last].push) == "function") {

                pointer[last].push(data);
                if(params.limit) {
                    while(pointer[last].length > params.limit)
                        pointer[last].shift(data);
                }

            } else {

                throw new TypeError("You cannot .push() to that object");
            }

        } else {

            // Default to set
            pointer[last] = data;
        }
    }
}


module.exports = exports = Entangld;
