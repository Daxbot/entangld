var EventEmitter=require("events");
var Uuid=require("uuid");

class Message {

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
class Ses extends EventEmitter{

    constructor(){

        super();
        //var _self=this;
        this.stores=new Map();
        this._transmit=()=>{};
        this._local_data={};
        this.requests={};
    }

    attach(namespace, store){

        // Sanity checks
        if(!store) throw new Error("You cannot attach() a null or empty store");
        if(!namespace) throw new Error("You cannot attach() a null or empty namespace");
        if(this.stores.has(namespace)) throw new Error("You already attach()ed that namespace");

        // Attach the store and namespace
        this.stores.set(namespace,store);
    }

    transmit(f) {

        this._transmit=f;
    }

    receive(msg) {

        if(msg.type=="set") {

            this.set(msg.path, msg.value);

        } else if(msg.type=="get") {

            this.get(msg.path).then((val)=>{

                this._transmit(new Message("value", msg.path, val, msg.uuid));
            });
        } else if (msg.type=="value") {

            let resolve=this.requests[msg.uuid];
            resolve(msg.value);
        }
    }

    set(path, o) {

        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this.stores.get(tree.shift());

        // Undefined store means we are setting a local item
        if(store===undefined) {

            this._set_local(path,o);
            return;
        }

        // Transmit the data to the remote store
        this._transmit(new Message("set", tree.join("."), o), store);

    }

    get(path) {

        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this.stores.get(tree.shift());

        // If store is undefined, we are setting a local item
        if(store===undefined) {

            return new Promise((res)=>res(this._get_local(path)));
        }

        // Request the data from the remote store
        var msg=new Message("get", tree.join("."));
        var _this=this;
        return new Promise((res)=>{

            _this.requests[msg.uuid]=res;
            this._transmit(msg, store);            
        });

    }

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

    _get_local(path) {

        try {
    
            return path.split(".").reduce((p,v)=>p[v],this._local_data);

        } catch(e) {

            return undefined;
        }
    }

}


module.exports=exports=Ses;

