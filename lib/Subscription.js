const { is_beneath } = require("./utils.js");

/**
 * A datastore subscription object
 */
class EntangldSubscription {
    /**
     * Constructor
     *
     * @param {Object} obj - the configuration object
     * @param {string} obj.path - the datastore path (relative to this datastore)
     *                             of the subscription
     * @param {uuidv4} obj.uuid - the uuid of the subscription chain
     * @param {function} obj.callback - the callback function, with signature (path, value),
     *                               where path is relative to this datastore
     * @param {(EntangldDatastore|null)} obj.downstream - the downstream datastore (if any)
     *                                          associated with this subscription
     * @param {(EntangldDatastore|null)} obj.upstream - the upstream datastore (if any)
     *                                          associated with this subscription
     * @param {(number|null)} obj.every - how many `set` messages to wait before calling callback
     * @return {EntangldSubscription} - the subscription object
     */
    constructor({path, uuid, callback, downstream, upstream, every}) {
        this.path = path;
        this.downstream = downstream || null;
        this.upstream = upstream || null;
        this.uuid = uuid;
        this.callback = callback;
        this._has_cb = (typeof(callback) === "function");
        this._is_counting = (this.downstream === null);
        every = parseInt(every);
        if ( isNaN(every) || every < 1 ) {
            this.every = 1;
        } else {
            this.every = every;
        }
        this.index = -1; // guarentee that the first `set` triggers
    }

    /**
     * Apply this callback function
     *
     * Note, this method also tracks the number of times that a callback
     * function is called (if this subscription is terminal), so that if
     * the subscriptions are throttled by specifying an `this.every`,
     * this method will only call the callback function every `this.every`
     * times it receives a `set` message. If this subscription is not
     * terminal, then the callback function is called every time.
     *
     * This method also is safed when a callback function is not give (i.e.
     * by the `this.static_copy()` method).
     */
    call(...args) {
        if ( !this._has_cb ) return;
        if ( this._is_counting ) {
            this.index = (this.index + 1) % this.every;
            if ( this.index !== 0 ) return;
        }
        this.callback(...args);
    }

    /**
     * Check if subscription is a `pass through` type
     *
     * Pass throughs are as the links in a chain of subscriptions to allows
     * subscriptions to remote datastores. One store acts as the `head`, where
     * the callback function is registered, an all others are `path through` datastores
     * which simply pass event messages back up to the head subscription.
     *
     * @return {Boolean}
     */
    get is_pass_through() {
        return this.has_upstream;
    }

    /**
     * Check if this subscription will be directly given data by a datastore
     *
     * @return {Boolean}
     */
    get is_terminal() {
        return !this.has_downstream;
    }

    /**
     * Check if this subscription will apply a user-supplied callback to data
     *
     * @return {Boolean}
     */
    get is_head() {
        return !this.has_upstream;
    }

    /**
     * Check if subscription has any downstream subscriptions
     *
     * It the subscription refers to a remote datastore (the downstream), this
     * getter will return a true. Note that !this.has_downstream will check if
     * the subscription is the `tail` subscription object in a subscription chain.
     *
     * @return {Boolean}
     */
    get has_downstream() {
        return this.downstream !== null;
    }

    /**
     * Check if subscription has any upstream subscriptions
     *
     * It the subscription passes data back to a remote datastore (the upstream), this
     * getter will return a true.
     *
     * @return {Boolean}
     */
    get has_upstream() {
        return this.upstream !== null;
    }


    /**
     * Check if a different `EntangldSubscription` object matches this subscription
     *
     * @param {EntangldSubscription} sub - a different subscription
     * @return {Boolean} - True if the subscriptions match
     */
    matches_subscription(sub) {
        return this.matches_uuid(sub.uuid) && this.matches_path(sub.path);
    }

    /**
     * Check if an `event` message matches this subscription
     *
     * @param {EntangldMessage} msg - a received message from a downstream datastore
     * @return {Boolean} - True if the message is associated with the subscription
     */
    matches_event_message(msg) {
        // should be above, otherwise events below a subscription won't
        // trigger the callback. I.e. subscribing to `flower` won't
        // trigger when someone sets `flower.color`
        return this.matches_uuid(msg.uuid) && this.is_above(msg.path);
    }

    /**
     * Check if an `unsubscribe` message matches this subscription
     *
     * @param {EntangldMessage} msg - a received message from a downstream datastore
     * @return {Boolean} - True if the message is associated with the subscription
     */
    matches_unsubscribe_message(msg) {
        return this.matches_uuid(msg.uuid);
    }

    /**
     * Check if a provided path matches this path
     *
     * @param {String} path - a path string to check against
     * @return {Boolean} - true if the path matches
     */
    matches_path(path) {
        return this.path === path;
    }

    /**
     * Check if a provided uuid matches this uuid
     *
     * @param {uuidv4} uuid - a uuid string to check against
     * @return {Boolean} - true if the path matches
     */
    matches_uuid(uuid) {
        return this.uuid === uuid;
    }

    /**
     * Check if subscription path is beneath a provided path
     *
     * @param {String} path - a path string to check against
     * @return {Boolean} - true if the subscription is beneath the path
     */
    is_beneath(path) {
        return is_beneath(this.path, path);
    }

    /**
     * Check if subscription path is above a provided path
     *
     * @param {String} path - a path string to check against
     * @return {Boolean} - true if the subscription is beneath the path
     */
    is_above(path) {
        return is_beneath(path, this.path);
    }

    /**
     * Get a copy of this subscription without external references
     *
     * This creates a copy, except the upstream/downstream references
     * are set to true (if they exist) or null (if they don't. Addtionally,
     * the callback function is excluded.
     *
     * @return {EntangldSubscription} a copy of this subscription object
     */
    static_copy() {
        return new EntangldSubscription({
            path : this.path,
            uuid : this.uuid,
            downstream : (this.downstream === null ? null : true),
            upstream : (this.upstream === null ? null : true),
            every : this.every
        });
    }
}


module.exports = exports = EntangldSubscription;
