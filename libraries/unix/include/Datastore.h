/** Entangld - Synchronized key-value stores with RPCs and pub/sub events.
 *
 * @file Datastore.h
 * @author Wilkins White
 * @copyright 2019 Nova Dynamics LLC
 */

#ifndef _ENTANGLD_DATASTORE_H_
#define _ENTANGLD_DATASTORE_H_

#include <string>
#include <unordered_map>
#include <vector>
#include <utility>

#include <nlohmann/json.hpp>
#include "Message.h"

namespace entangld
{
    /** Syncronized event store. */
    class Datastore {
        public:
            /** Initializes the local store with data.
             *
             * @param [in] data json to store.
             */
            explicit Datastore(const nlohmann::json &data = nlohmann::json::object())
            : m_local_data(data) {};

            /** Asyncronously retrieves a value from the store.
             *
             * @param [in] path location of the data to be retrieved.
             * @param [in] callback function to call when data is ready.
             * @param [in] callback_ctx user context passed to callback. May be null.
             * @param [in] uuid unique request identifier. Will be generated if empty.
             */
            void get(
                std::string path,
                void (*callback)(const Message &msg, void *ctx),
                void *callback_ctx = nullptr,
                std::string uuid = "");

            /** Sets a value in a store.
             *
             * @param [in] path location of the data to be modified.
             * @param [in] value new data to be set.
             * @param [in] push append value instead of overwriting.
             */
            void set(std::string path, nlohmann::json value, bool push=false);

            /** Registers a function to be called when a path changes.
             *
             * @param [in] path highest level that should trigger the callback.
             * @param [in] callback function to call when new data is ready.
             * @param [in] callback_ctx user context passed to callback. May be null.
             * @param [in] uuid unique request identifier.  Will be generated if empty.
             */
            void subscribe(
                std::string path,
                void (*callback)(const Message &msg, void *ctx),
                void *callback_ctx = nullptr,
                std::string uuid = "");

            /** Unsubscribe from a path.
             *
             * @param [in] path subscription path to unsubscribe.
             * @param [in] uuid original subscription identifier if known.
             */
            int unsubscribe(std::string path, std::string uuid="");

            /** Attach to a remote store.
             *
             * @param [in] name namespace to use for this remote.
             * @param [in] handler function that handles sending a Message to the remote.
             * @param [in] ctx user context passed to handler. May be null.
             */
            void attach(std::string name, Message::handler_t handler, void *ctx=nullptr);

            /** Detach from a remote store.
             *
             * @param [in] name namespace to detach from.
             */
            void detach(std::string name);

            /** Should be called on messages received from an attached remote.
             *
             * @param [in] msg Message object to process.
             * @param [in] name namespace of the remote where msg originated.
             */
            void receive(const Message &msg, std::string name);

            /** Push a value to an existing array.
             *
             * Equivalent to calling set with push=true.
             *
             * @param [in] path location of the data to be modified.
             * @param [in] value new data to be pushed.
             */
            inline void push(std::string path, nlohmann::json value)
            {
                set(path, value, true);
            }

        protected:
            /** Represents a remote store. */
            typedef struct {
                std::string name;           /**< Namespace the store is mapped to. */
                Message::handler_t handler; /**< Send a Message to this remote. */
                void *handler_ctx;          /**< User context passed to handler. */
            } remote_t;

            /** Represents a request for data. */
            typedef struct {
                /** The original Message that generated the request. */
                Message msg;

                /** The remote that holds the data. If null, data is local. */
                remote_t *remote;

                /** The local data pointer.  Only valid if remote is null. */
                nlohmann::json::json_pointer ptr;

                /** Function to call when new data is available. */
                void (*callback)(const Message &msg, void *ctx);

                /** User context passed to callback. */
                void *callback_ctx;
            } request_t;

            /** Returns the remote namespace of a path.
             *
             * Checks all registered namespaces and returns if one matches the path.
             *
             * @param [in] path string to search.
             */
            std::string parse_namespace(std::string path);

            /** Send Message to remote.
             *
             * @param [in] remote handler to call.
             * @param [in] msg Message object to send.
             */
            static inline void transmit(remote_t *remote, const Message &msg)
            {
                remote->handler(msg, remote->handler_ctx);
            }

            /** Local data. */
            nlohmann::json m_local_data;

            /** Map of namespaces to remotes. */
            std::unordered_map<std::string, remote_t> m_remotes;

            /** Map of request ids to data requests.
             *
             * Used for one-shot requests generated by 'get'.
             */
            std::unordered_map<std::string, request_t> m_requests;

            /** Active subscriptions.
             *
             * Used for repeated requests generated by 'subscribe'.
             */
            std::vector<request_t> m_subs;
    };
}

#endif /* _ENTANGLD_DATASTORE_H_ */
