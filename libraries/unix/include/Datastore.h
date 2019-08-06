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
    class Datastore {
        public:
            explicit Datastore(const nlohmann::json &data = nlohmann::json::object())
            : m_local_data(data) {};

            void get(
                std::string path,
                void (*callback)(const Message &msg, void *ctx),
                void *callback_ctx = nullptr,
                std::string uuid = "");

            void set(std::string path, nlohmann::json value, bool push=false);

            void subscribe(
                std::string path,
                void (*callback)(const Message &msg, void *ctx),
                void *callback_ctx = nullptr,
                std::string uuid = "");

            int unsubscribe(std::string path, std::string uuid="");

            void attach(std::string name, Message::handler_t handler, void *ctx);
            void detach(std::string name);

            void receive(const Message &msg, std::string name);

            inline void push(std::string path, nlohmann::json value)
            {
                set(path, value, true);
            }

        protected:
            typedef struct {
                std::string name;
                Message::handler_t handler;
                void *handler_ctx;
            } remote_t;

            typedef struct {
                Message msg;
                remote_t *remote;
                nlohmann::json::json_pointer ptr;
                void (*callback)(const Message &msg, void *ctx);
                void *callback_ctx;
            } request_t;

            /** Returns the remote namespace of a path. */
            std::string parse_namespace(std::string path);

            /** Send Message to remote. */
            static inline void transmit(remote_t *remote, const Message &msg)
            {
                remote->handler(msg, remote->handler_ctx);
            }

            nlohmann::json m_local_data;

            std::unordered_map<std::string, remote_t> m_remotes;
            std::unordered_map<std::string, request_t> m_requests;
            std::vector<request_t> m_subs;
    };
}

#endif /* _ENTANGLD_DATASTORE_H_ */
