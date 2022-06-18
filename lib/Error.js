
/**
 * Error class for Entangld.
 *
 * @extends Error
 */
class EntangldError extends Error {
    constructor(message) {
        super(message);

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = exports = EntangldError;
