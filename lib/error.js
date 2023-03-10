

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
 * Remote Error class for Entangld.
 */
class RPCError extends Error {
    static serialize_local_error(err) {
        const json = {};
        for ( const key of Object.getOwnPropertyNames(err) ) {
            json[key] = err[key];
        }
        json.Type = err.constructor.name;
        return json;
    }

    static from_remote_error(err_obj) {
        const rpc_error = new this();
        const old_stack = rpc_error.stack;
        for ( const key of Object.keys(err_obj) ) {
            rpc_error[key] = err_obj[key];
        }

        rpc_error.stack = `\n${rpc_error.stack}\n    ∧∧∧ --- Remote\n    ∨∨∨ --- Local\n${old_stack.split("\n").slice(1).join("\n")}`;
        return rpc_error;
    }
}

module.exports = exports = {
    EntangldError,
    RPCError,
};
