var Uuid=require("uuid");

class Ses_Message {

    constructor(type, path, value, uuid) {

        this.type=type;
        this.path=path;
        this.value=value;
        this.uuid=uuid||((type=="get")?Uuid():"");
    }
}

/**
 * Synchronized Event Store
 * @extends EventEmitter
 */
class Ses {

    constructor(){

        this._stores=new Map();
        this._namespaces=new Map();

        this._transmit=()=>{};
        this._local_data={};
        this._requests={};
        this._subscriptions=[] ;
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
     * @param {string} namespace a namespace for this store
     * @param {object} store an object that will be sent along with "transmit" callbacks when we need something from this store
     * @throws {Error} Error will be thrown if you try to attach a namespace twice
     */
    attach(namespace, store){

        // Sanity checks
        if(!store) throw new Error("You cannot attach() a null or empty store");
        if(!namespace) throw new Error("You cannot attach() a null or empty namespace");
        if(this._stores.has(namespace)) throw new Error("You already attach()ed that namespace");

        // Attach the store and namespace
        this._stores.set(namespace,store);
        this._namespaces.set(store, namespace);
    }

    /**
     * Detach a namespace / store pair
     *
     * If you only pass a namespace or a store, it will find the missing item before detaching
     * @param {string} [namespace] the namespace 
     * @param {object} [store] the store
     * @throws {Error} Error will be thrown if you don't pass at least one parameter
     */
    detach(namespace, store){

        if(!namespace && !store) throw new Error("You must specify at least one store or namespace when calling detach()");

        if(!store) store=this._stores.get(namespace);
        if(!namespace) namespace=this._namespaces.get(store);

        return (this._stores.delete(namespace) && this._namespaces.delete(store));
    }

    /**
     * Transmit 
     *
     * Specify a callback to be used so we can transmit data to another store
     * Callback will be passed (msg, store) where msg is an object and store is the Ses store that should receive() it
     * @param {function} f the callback function
     */
    transmit(f) {

        this._transmit=f;
    }

    /**
     * Receive
     * 
     * Call this function with the data that was sent via the transmit() callback
     *
     * @param {object} msg the message that was given to the callback
     * @param {object} [store] the Ses store that sent the message
     */
    receive(msg, store) {

        // Remote "set" request
        if(msg.type=="set") {

            this.set(msg.path, msg.value);

        // Remote "get" request
        } else if(msg.type=="get") {

            this.get(msg.path).then((val)=>{

                this._transmit(new Ses_Message("value", msg.path, val, msg.uuid), store);
            });

        // Incoming value reply
        } else if (msg.type=="value") {

            let resolve=this._requests[msg.uuid];
            resolve(msg.value);

        // Incoming event 
        } else if (msg.type=="event") {

            // From our perspective, the path is now prepended with the store name
            let path=this._namespaces.get(store)+"."+msg.path;

            // Find and dispatch any subscriptions
            var count=0;            
            for(let s of this._subscriptions){

                if (this._is_contained_by(path, s.path)){

                    // Call the callback
                    s.callback(path, msg.value);
                    count++;
                }
            }

            // If no callbacks were called, we should maybe inform the child that no one is listening (?)
            if(count===0) throw new Error("Store sent an event that no one subscribed to");

        // Incoming remote subscription request
        } else if(msg.type=="subscribe"){

            this._subscriptions.push({path: msg.path, callback: (path, val)=>{

                // This is a remote subscription, so when we are called we need to send the value
                this._transmit(new Ses_Message("event", path, val));
            }});            

        // Default
        } else {

            throw new Error ("Received unknown message: "+JSON.stringify(msg));
        }
    }

    /**
     * Set an object into the store
     *
     * @param {string} path the path to set (like "system.fan.voltage")
     * @param {object} the object you want to set it to
     * @throws {Error} Throws error on empty path
     */
    set(path, o) {

        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this._stores.get(tree.shift());

        // Set local or remote item
        if(store===undefined) {

            this._set_local(path,o);

            // Check subscriptions to see if we need to run an event
            for(let s of this._subscriptions){

                if (this._is_contained_by(path, s.path)){

                    s.callback(path, o);
                }
            }

        } else {
         
            this._transmit(new Ses_Message("set", tree.join("."), o), store);
        }

    }

    /**
     * Get an object from the store
     *
     * @param {string} path the path to query (like "system.voltage")
     * @throws {Errror} throws error on empty path
     * @return {object} the object living at that path
     */ 
    get(path) {

        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this._stores.get(tree.shift());

        // If store is undefined, we are getting a local item
        if(store===undefined) {

            let o=this._get_local(path);
            return new Promise((res)=>res((typeof(o)=="function")?o():o));
        }

        // Request the data from the remote store
        var msg=new Ses_Message("get", tree.join("."));
        var _this=this;
        return new Promise((res)=>{

            _this._requests[msg.uuid]=res;
            this._transmit(msg, store);            
        });

    }

    /**
     * Subscribe to change events for a path
     *
     * If objects at or below this path change, you will get a callback
     * @param {string} path the path to watch
     * @param {function} f the callback - will be of the form (path, value)
     * @throws {Error} error thrown on empty path
     */
    subscribe(path, f) {


        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store_name=tree.shift();
        let store=this._stores.get(store_name);

        // Undefined store means we are trying to subscribe to something 
        if(store===undefined) throw new Error("Unable to subscribe to nonexistent store (please attach '"+store_name+"' first)");

        // Add to our subscriptions list
        this._subscriptions.push({path: path, callback: f});

        // Tell the store that we are subscribing
        var msg=new Ses_Message("subscribe", tree.join("."));
        this._transmit(msg, store);            

    }

    /**
     * Set local object
     *
     * Sets object into local data store
     *
     * @private
     * @param {string} path the path at which to store the object
     * @param {object} object the object to store
     */
    _set_local(path, o){

        let elements=path.split(".");
        let last=elements.pop();
        let pointer=this._local_data;

        for(let el of elements){

            if(!pointer[el]) pointer[el]={};
            pointer=pointer[el];
        }

        pointer[last]=o;
    }

    /**
     * Get local object
     *
     * Gets object at path from local data store
     *
     * @private
     * @param {string} path the path at which to fetch the object
     * @return {object} object the object at that path
     */
    _get_local(path) {

        try {
    
            return path.split(".").reduce((p,v)=>p[v],this._local_data);

        } catch(e) {

            return undefined;
        }
    }

    /**
     * Is contained by
     *
     * Is a under b? E.g. is "system.bus.voltage" inside "system.bus"?
     *
     * @private
     * @param a string tested for "insideness"
     * @param b string tested for "outsideness"
     * @return boolean
     */
    _is_contained_by(a, b) {

        let A=a.split(".");
        let B=b.split(".");

        while(A.length && B.length){

            if(A.shift()!=B.shift()) return false;
        }

        return true;
    }

}


module.exports=exports=Ses;

