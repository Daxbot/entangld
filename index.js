const Uuid = require("uuid");

/**
 * Message class for Entangld.
 */
class Entangld_Message {

    constructor(type, path, value, uuid) {

        this.type=type;
        this.path=path;
        this.value=value;
        this.uuid=uuid||((type=="get")?Uuid():"");
    }
}

/**
 * Error class for Entangld.
 */
class EntangldError extends Error {
    constructor(message) {
        super(message);

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Deep copy an object
 *
 * Uses JSON parse methods so things that don't work in JSON will disappear,
 * with the special exception of functions which are replaced by their return
 * values (or if the function returns a promise, the value that it resolves to).
 *
 * If you pass undefined, it will return a promise resolving to undefined.
 *
 * @private
 * @param {object} original the object to copy.
 *
 * @return {Promise} a promise resolving to a completely new, de-referenced
 * object containing only objects and values.
 */
function dereferenced_copy(original) {

    // Undefined passes through
    if (typeof (original) == "undefined")
        return new Promise((res) => { res(undefined); });

    // Make a copy of o.  It will be missing any functions
    let copy = JSON.parse(JSON.stringify(original));

    // A container to hold the copy (so we can have a recursive function
    // replace it using a key)
    let container = { "copy": copy };

    // We will store our promises here
    let promises = [];

    // Recursively call all functions in o, placing their values in copy.
    // Promises are tracked also.
    function recurse(o, c, parent, key) {

        // If o is a function, get its value and return a promise
        if (typeof (o) == "function") {

            // Call the function
            let result = o();

            // If the function itself returns a promise, save it and make it
            // replace the object with a result
            if (result && result.constructor && result.constructor.name
                && result.constructor.name == "Promise") {

                promises.push(promises, result);
                result.then((val) => {

                    parent[key] = val;
                });
            } else {

                // Replace the object directly
                parent[key] = result;
            }

            return;
        }


        // If o is not an object, return
        if (typeof (o) != "object") return;

        // Otherwise, iterate keys and call ourselves recursively
        for (let key in o) {

            recurse(o[key], c[key], c, key);
        }
    }

    recurse(original, copy, container, "copy");

    // Wait for all promises to fulfil, then return the copy
    return Promise.all(promises).then(() => Promise.resolve(copy));
}


/**
 * Extract from path.
 *
 * Given an object, extracts a child object using a string path.
 *
 * @private
 * @param {object} obj the object we are extracting from.
 * @param {string} path the path to find beneath obj.
 *
 * @return {Array<object, string>} array containing [result, remaining_path].
 * result will be undefined if path can't be found.  If we encounter a function
 * in our search, result will be the function and remaining_path will be the
 * remaining part of path.
 */
function extract_from_path(obj, path) {

    // Empty path means get everything
    if (path === "") return [obj, ""];


    let keys = path.split(".");
    let key;
    let o = obj;

    while ((key = keys.shift())) {

        if (key in o) {

            o = o[key];

            // If o is a function, we can't go any farther
            if (typeof (o) == 'function') {

                return [o, keys.join(".")];
            }

        } else {

            return [undefined, ""];
        }

    }

    return [o, ""];
}

/**
 * Partial copy.
 *
 * Return a partial copy of an object (depth limited).  DOES NOT DE-REFERENCE!
 *
 * @private
 * @param {object} object the object to copy
 * @param {number} max_depth the maximum depth to copy (max_depth==0 returns
 * object keys)
 */
function partial_copy(o, max_depth) {

    // Trivial case, return object untouched if no max_depth
    if (typeof (max_depth) != "number")
        return o;

    // If o is not an object, return it
    if (typeof (o) != "object")
        return o;

    let c =  (Array.isArray(o)) ? [] : {};

    // If max_depth has been exceeded, return the empty object or array
    if (max_depth < 0)
        return c;

    // Otherwise, iterate keys and call ourselves recursively
    for (let key in o) {

        if (typeof (o[key]) != "object") {

            c[key] = o[key];

        } else {

            c[key] = partial_copy(o[key], max_depth - 1);
        }
    }

    return c;
}

/**
 * Synchronized Event Store
 */
class Entangld {

    constructor() {

        this._stores = new Map();
        this._namespaces = new Map();

        this._transmit = () => { };
        this._local_data = {};
        this._requests = {};
        this._subscriptions = [];

        // These are global but need to be accessible for various reasons
        // (i.e. testing)
        this._partial_copy = partial_copy;
        this._dereferenced_copy = dereferenced_copy;

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
     * @return {array} namespaces an array of attached namespaces
     */
    get namespaces() {

        return Array.from(this._stores.keys());
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
     * @param {object} context an object that will be sent along with "transmit"
     * callbacks when we need something from this store.
     *
     * @throws {TypeError} if namespace is null or empty.
     * @throws {Error} if you try to attach to the same namespace twice.
     */
    attach(namespace, context) {

        // Sanity checks
        if (!namespace)
            throw TypeError("You cannot attach() a null or empty namespace");

        if (!context)
            throw TypeError("You cannot attach() a null or empty context");

        if (this._stores.has(namespace))
            throw new EntangldError("You already attach()ed that namespace");

        // Attach the store and namespace
        this._stores.set(namespace, context);
        this._namespaces.set(context, namespace);

        // Create an empty local node so that this attach point is visible
        this._set_local(namespace, {});
    }

    /**
     * Detach a namespace / store pair
     *
     * If you only pass a namespace or a store, it will find the missing item
     * before detaching
     *
     * @param {string} [namespace] the namespace
     * @param {object} [context] the store context
     *
     * @return {boolean} true if the element existed and was removed
     * @throws {Error} Error will be thrown if you don't pass at least one
     * parameter
     */
    detach(namespace, context) {

        if (!namespace && !context) {
            msg = "You must specify at least one store or namespace when "
                + "calling detach()"
            throw new Error(msg);
        }

        if (!context) context = this._stores.get(namespace);
        if (!namespace) namespace = this._namespaces.get(context);

        // Detach this namespace placeholder from the local store
        this._set_local(namespace, undefined);

        return this._stores.delete(namespace) && this._namespaces.delete(context);
    }

    /**
     * Transmit
     *
     * Specify a callback to be used so we can transmit data to another store.
     * Callback will be passed (message, context) where 'message' is an
     * Entangld_Message object and context is the object provided by attach().
     *
     * @param {function} func the callback function.
     */
    transmit(func) {

        this._transmit = func;
    }

    /**
     * Receive
     *
     * Call this function with the data that was sent via the transmit()
     * callback.
     *
     * @param {Entangld_Message} msg the message to process.
     * @param {object} context the attach() context where the message originted.
     *
     * @throws {ReferenceError} if event context was not provided.
     * @throws {EntangldError} if an unknown message type was received.
     */
    receive(msg, context) {

        if (msg.type == "set") {
            // Remote "set" request
            this.set(msg.path, msg.value);

        } else if (msg.type == "push") {
            // Remote "push" request
            this.push(msg.path, msg.value);

        } else if (msg.type == "get") {
            // Remote "get" request
            this.get(msg.path, msg.value).then((val) => {

                const response = new Entangld_Message(
                    "value", msg.path, val, msg.uuid);

                this._transmit(response, context);
            });

        } else if (msg.type == "value") {
            // Incoming value reply
            let resolve = this._requests[msg.uuid];
            resolve(msg.value);

        } else if (msg.type == "event") {
            // Incoming event
            if (typeof (context) == "undefined")
                throw new ReferenceError("receive() called without context");

            // From our perspective the path is now prepended with the namespace
            let path = this._namespaces.get(context) + "." + msg.path;

            // Find and dispatch any subscriptions
            let count = 0;
            for (let s of this._subscriptions) {

                if (path.startsWith(s.path)) {

                    // Call the callback
                    s.callback(path, msg.value);
                    count++;
                }
            }

            // No one is listening.  This may happen if an event triggers while
            // we are still unsubscribing.
            if (count === 0) {

                // Reply with unsubscribe request
                const response = new Entangld_Message("unsubscribe", msg.path);
                this._transmit(response, context);
            }

        } else if (msg.type == "subscribe") {
            // Incoming remote subscription request

            // Create a new subscription that simply transmits when triggered
            this._subscribe(msg.path.path, (path, val) => {
                const response = new Entangld_Message("event", path, val);
                this._transmit(response, context);
            }, context, msg.path.uuid);

        } else if (msg.type == "unsubscribe") {
            // Incoming remote unsubscribe request

            // Unsubscribe to any matching subscriptions.
            this._unsubscribe(
                this._subscriptions.filter((o) => (o.uuid == msg.path.uuid)));

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
     * @param {object} object the object or function you want to store at path.
     * @throws {Error}
     */
    push(path, o) {

        this.set(path, o, "push");

    }


    /**
     * Set an object into the store
     *
     * @param {string} path the path to set (like "system.fan.voltage").
     * @param {object} object the object or function you want to store at path.
     * @param {string} [operation_type="set"] whether to set or push the new
     * data (push only works if the data item exists and is an array).
     *
     * @throws {TypeError} if path is not a string.
     */
    set(path, o, operation_type = "set") {

        // Sanity check
        if (typeof (path) != "string")
            throw TypeError("path must be a string");

        let [context, , tree] = this._get_remote_context(path);

        if (context === undefined) {
            // Set local or remote item

            // Is this going to mess with an attached store?
            for (let [namespace] of this._stores) {

                if (namespace.startsWith(path)) {

                    const msg = `Cannot set ${path} - doing so would overwrite `
                              + `remote store attached at ${path}. Please `
                              + 'detach first'
                    throw new EntangldError(msg);
                }
            }

            this._set_local(path, o, operation_type);

            // Check subscriptions to see if we need to run an event
            for (let s of this._subscriptions) {

                if (path.startsWith(s.path)) {

                    s.callback(path, o);
                }
            }

        } else {

            const msg = new Entangld_Message(operation_type, tree, o);
            this._transmit(msg, context);
        }

    }


    /**
     * Get the remote store in a path
     *
     * If path contains a remote store, return the context as well as the
     * relative path to the remote store
     *
     * Example: let A,B be stores. If A.attach("some.path.to.B", B) then
     * _get_remote_context("some.path.to.B.data") will return
     * [B, "some.path.to.B", "data"] and _get_remote_context("nonexistent.path")
     * will return [undefined, undefined, path]
     *
     * @private
     * @param {string} path the path to investigate.
     *
     * @return {array<object, string, string>} array whose elements are
     * [context, namespace, relative path below store].  If no store is found,
     * return value is [undefined, undefined, path].
     */
    _get_remote_context(path) {

        // We don't know what part of path might be a store key.  So we need to
        // get all store keys and search (vs .get)
        for (let [namespace, context] of this._stores) {

            if (path.startsWith(namespace)) {

                // Exact match means path is the root of the attached store
                if (path.length == namespace.length) {

                    return [context, namespace, ""];
                }

                // Path is longer than namespace. Make sure we match to a period
                if (path.substr(namespace.length, 1) == ".") {

                    return [context, namespace, path.substr(namespace.length + 1)];
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
        let [context, , tree] = this._get_remote_context(path);

        // If context is undefined, we are getting a local item
        if (context === undefined) {

            // Get a reference to the object
            let [o, remaining_path] = extract_from_path(this._local_data, path);

            // If it is a function, call it
            if (typeof (o) == "function") {

                let result = o(params);

                // Get a promise resolving to the result
                let p = (result && result.constructor && result.constructor.name
                    && result.constructor.name == "Promise") ?
                    result : new Promise((res) => res(result));

                return p.then((val) => {

                    // If we have a remaining path, try to navigate it before
                    // returning
                    [o, remaining_path] = extract_from_path(val, remaining_path);
                    return Promise.resolve((remaining_path === "") ? o : undefined);
                });
            }

            // Path does not point to function.  So use params as a max depth
            // and return a Promise resolving to a dereferenced partial copy
            if (typeof (params) == "number") {

                if (this._deref_mode) {

                    return dereferenced_copy(partial_copy(o, params));
                } else {

                    return new Promise((res) => res(partial_copy(o, params)));
                }
            }

            // Default: return a promise resolving to the entire object as-is
            if (this._deref_mode) {

                return dereferenced_copy(o);

            } else {

                return new Promise((res) => res(o));
            }
        }

        // Request the data from the remote store
        const msg = new Entangld_Message("get", tree, params);
        return new Promise((res) => {
            this._requests[msg.uuid] = res;
            this._transmit(msg, context);
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
     * immediate neighbors - and has no introspection into those neigbors - each
     * store is only able to keeps track of the neighbor on each side with
     * respect to a particular path and has no knowledge of the eventual
     * endpoints.
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
     * original link in the chain, and the downstream is null if this store owns
     * the endpoint value.
     *
     * @param {string} path the path to watch.
     * @param {function} func the callback - will be of the form (path, value).
     *
     * @throws {TypeError} if path is not a string.
     * @return {Promise} promise resolving to the subscription UUID.
     */
    subscribe(path, func) {

        this._subscribe(path, func);
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
     * @param {Entangld} [upstream] the Engangld next upstream in the path.
     * @param {Uuid} [uuid] the UUID to use for this subscription.
     *
     * @throws {TypeError} if path is not a string.
     * @return {Promise} promise resolving to the subscription UUID.
     */
    _subscribe(path, func, upstream = null, uuid = null) {

        // Supply a UUID if none provided
        uuid = uuid || Uuid();

        // Sanity check
        if (typeof (path) != "string")
            throw TypeError("path must be a string");

        let [context, /*namespace*/, tree] = this._get_remote_context(path);

        // Add to our subscriptions list
        this._subscriptions.push({
            'path': path,
            'downstream': context || null,
            'upstream': upstream,
            'uuid': uuid,
            'callback': func
        });

        if (context) {
            // If we have a context, the subscription is to a remote event

            // Tell the store that we are subscribing.
            const msg = new Entangld_Message(
                "subscribe", { 'path': tree, 'uuid': uuid });

            this._transmit(msg, context);
        }
    }

    /**
     * Check for subscription
     *
     * Are we subscribed to a particular remote path?
     *
     * @param {string} subscription the subscription to check for.
     *
     * @return {boolean} true if we are subscribed.
     */
    subscribed_to(path) {

        for (let s of this._subscriptions) {

            if (path == s.path) return true;
        }

        return false;
    }

    /**
     * Unubscribe to change events for a given path.
     *
     * Caution - all events belonging to you with the given path will be deleted.
     *
     * @param {string} path the path to unwatch.
     *
     * @throws {EntangldError} if no subscriptions were found.
     * @return {number} number of subscriptions removed.
     */
    unsubscribe(path) {

        // Find subscriptions that
        // (1) belongs to us (no upstream),
        // (2) match the given path.
        // Passthrough subscriptions (from other stores) are kept safe
        let matching_subscriptions = this._subscriptions.filter(
            (s) => (s.path == path && s.upstream === null));

        // Throw an error if none found
        if (matching_subscriptions.length == 0) {

            throw new EntangldError(
                `unsubscribe found no subscriptions matching ${path}`);
        }

        this._unsubscribe(matching_subscriptions);

        return matching_subscriptions.length;
    }

    /**
     * Unsubscribe tree.
     *
     * Remove any subscriptions that are beneath a path.
     *
     * @throws {EntangldError} error if there are stores we cannot detach
     * (i.e. they belong to someone else / upstream != null)
     */
    unsubscribe_tree(path) {

        let matching_subscriptions = this._subscriptions.filter(
            (sub) => (sub.upstream == null && sub.path.startsWith(path)))

        this._unsubscribe(matching_subscriptions);

        // Error on any remaining subscriptions where upstream was not null
        matching_subscriptions = this._subscriptions.filter(
            (sub) => (sub.path.startsWith(path)))

        if (matching_subscriptions.length != 0) {

            const msg = `Unable to completely unsubscribe the tree '${path}' `
                + 'because some subscriptions are remote or passthrough '
                + '(we are not the owner, just a downstream)'
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
     * @param {array} subscriptions an array of objects containing at minimum
     * uuid and upstream keys
     */
    _unsubscribe(subscriptions) {

        // Get a list of uuids to remove
        const uuids = []
        for(let i = 0; i < subscriptions.length; ++i)
            uuids.push(subscriptions[i].uuid)

        // Remove the subscriptions
        this._subscriptions = this._subscriptions.filter(
            (sub) => !(uuids.includes(sub.uuid)));

        // Notify the downstream for any deleted subscriptions that are remote
        for(let i = 0; i < subscriptions.length; ++i) {
            const sub = subscriptions[i];
            if(sub.downstream === null)
                continue

            const msg = new Entangld_Message("unsubscribe", { uuid: sub.uuid })
            this._transmit(msg, sub.downstream);
        }
    }

    /**
     * Set local object
     *
     * Sets object into local data store.
     *
     * @private
     * @param {string} path the path at which to store the object.
     * @param {object} object the object to store. If undefined, it unsets path.
     * @param {string} [operation_type] whether to set or push the new
     * data (push only works if the data item exists and is an array).
     *
     * @throws {TypeError} if attempting to set root store to a non-object.
     */
    _set_local(path, o, operation_type = "set") {
        // Empty path means set everything
        if (path === "") {
            if(o === undefined)
                o = {}

            // Sanity check
            if (typeof (o) != "object") {
                msg = 'You are trying to set the root store to something '
                    + `(${typeof (o)}) besides an object!`

                throw TypeError(msg);
            }

            this._local_data = o;
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
        if (o === undefined) {

            delete (pointer[last]);
            return;
        }

        if (operation_type == "push") {

            if (pointer[last] && typeof (pointer[last].push) == "function") {

                pointer[last].push(o);

            } else {

                throw new Error("You cannot .push() to that object");
            }

        } else {

            // Default to set
            pointer[last] = o;
        }
    }
}


module.exports = exports = Entangld;
