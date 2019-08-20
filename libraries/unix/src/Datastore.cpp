/** Entangld - Synchronized key-value stores with RPCs and pub/sub events.
 *
 * @file Datastore.cpp
 * @author Wilkins White
 * @copyright 2019 Nova Dynamics LLC
 */

#include <stdexcept>
#include <uuid/uuid.h>

#include "Datastore.h"

/** Generates a UUID and returns it in a std::string. */
static std::string get_uuidstring()
{
    union {
        uuid_t raw;
        uint16_t u16[8];
    } uuid;

    uuid_generate(uuid.raw);

    char buffer[37];
    sprintf(buffer, "%04x%04x-%04x-%04x-%04x-%04x%04x%04x",
        uuid.u16[0],
        uuid.u16[1],
        uuid.u16[2],
        uuid.u16[3],
        uuid.u16[4],
        uuid.u16[5],
        uuid.u16[6],
        uuid.u16[7]
    );

    return std::string(buffer);
}

namespace entangld
{
    void Datastore::reset()
    {
        m_remotes.clear();
        m_requests.clear();
        m_subs.clear();
    }

    void Datastore::get(
        std::string path,
        void (*callback)(const Message &msg, void *ctx),
        void *callback_ctx,
        std::string uuid)
    {
        assert(callback != nullptr);

        std::string ns = parse_namespace(path);
        if(ns.empty()) {
            // Data is in local store
            std::string local_path = path;
            if(!local_path.empty()) {
                replace(local_path.begin(), local_path.end(), '.', '/');
                local_path = '/' + local_path;
            }

            auto ptr = nlohmann::json::json_pointer(local_path);

            Message msg;
            msg.type = "value";
            msg.path = path;
            msg.uuid = (uuid.empty()) ? get_uuidstring() : uuid;
            msg.value = m_local_data.value(ptr, nlohmann::json(nullptr));

            callback(msg, callback_ctx);
        }
        else {
            // Data is in remote store
            request_t request;
            request.msg.type = "get";
            request.msg.path = path.substr(ns.size()+1, path.size()-ns.size()-1);
            request.msg.uuid = (uuid.empty()) ? get_uuidstring() : uuid;
            request.remote = &m_remotes[ns];
            request.callback = callback;
            request.callback_ctx = callback_ctx;

            m_requests.insert(std::make_pair(request.msg.uuid, request));
            transmit(request.remote, request.msg);
        }
    }

    void Datastore::set(std::string path, nlohmann::json value, bool push)
    {
        std::string ns = parse_namespace(path);
        if(ns.empty()) {
            // Data is in local store
            std::string local_path = path;
            if(!local_path.empty()) {
                replace(local_path.begin(), local_path.end(), '.', '/');
                local_path = '/' + local_path;
            }

            auto ptr = nlohmann::json::json_pointer(local_path);

            if(push) {
                m_local_data[ptr].push_back(value);
            }
            else {
                m_local_data[ptr] = value;
            }

            for(auto it = m_subs.begin(); it != m_subs.end(); ++it) {
                request_t &sub = *it;
                if(sub.remote)
                    continue;

                std::string sub_path = sub.msg.path.at("path").get<std::string>();
                if(path.rfind(sub_path, 0) != std::string::npos) {
                    Message msg;
                    msg.type = "event";
                    msg.path = sub.msg.path.at("path");
                    msg.value = m_local_data[sub.ptr];
                    msg.uuid = sub.msg.path.at("uuid");

                    sub.callback(msg, sub.callback_ctx);
                }
            }
        }
        else {
            // Data is in remote store
            Message msg;
            msg.type = (push) ? "push" : "set";
            msg.path = path.substr(ns.size()+1, path.size()-ns.size()-1);
            msg.value = value;

            remote_t *remote = &m_remotes[ns];
            transmit(remote, msg);
        }
    }

    void Datastore::subscribe(
        std::string path,
        void (*callback)(const Message &msg, void *ctx),
        void *callback_ctx,
        std::string uuid)
    {
        assert(callback != nullptr);

        if(uuid.empty())
            uuid = get_uuidstring();

        request_t sub;
        sub.msg.type = "subscribe";
        sub.callback = callback;
        sub.callback_ctx = callback_ctx;

        std::string ns = parse_namespace(path);
        if(ns.empty()) {
            // Data is in local store
            std::string local_path = path;
            if(!local_path.empty()) {
                replace(local_path.begin(), local_path.end(), '.', '/');
                local_path = '/' + local_path;
            }

            sub.remote = nullptr;
            sub.ptr = nlohmann::json::json_pointer(local_path);
            sub.msg.path = {
                {"path", path},
                {"uuid", uuid}
            };
        }
        else {
            // Data is in remote store
            sub.remote = &m_remotes[ns];
            sub.msg.path = {
                {"path", path.substr(ns.size()+1, path.size()-ns.size()-1)},
                {"uuid", uuid}
            };
            transmit(sub.remote, sub.msg);
        }

        m_subs.push_back(sub);
    }

    int Datastore::unsubscribe(std::string path, std::string uuid)
    {
        int count = 0;
        std::string ns = parse_namespace(path);

        m_subs.erase(std::remove_if(
            m_subs.begin(), m_subs.end(),
            [&](const request_t &sub) {
                if(!uuid.empty()) {
                    if(uuid != sub.msg.uuid) {
                        // Ignore subscriptions that don't match UUID
                        return false;
                    }
                    else if(path.empty()) {
                        // Remove all subscriptions matching UUID
                        return true;
                    }
                }

                if(ns.empty()) {
                    // Data is in local store
                    std::string sub_path = sub.msg.path.at("path").get<std::string>();
                    if(path.rfind(sub_path, 0) != std::string::npos) {
                        count += 1;
                        return true;
                    }
                }
                else {
                    // Data is in remote store
                    std::string sub_path = sub.msg.path.at("path").get<std::string>();
                    if(sub.remote && path.rfind(ns + '.' + sub_path, 0) != std::string::npos) {
                        Message msg;
                        msg.type = "unsubscribe";
                        msg.uuid = sub.msg.uuid;
                        msg.path = sub.msg.path;

                        transmit(sub.remote, msg);
                        count += 1;
                        return true;
                    }
                }
                return false;
            }),
            m_subs.end()
        );

        return count;
    }

    void Datastore::attach(
        std::string name, void (*handler)(const Message &msg, void *ctx), void *ctx)
    {
        assert(handler != nullptr);

        remote_t remote;
        remote.name = name;
        remote.handler = handler;
        remote.handler_ctx = ctx;

        m_remotes[name] = remote;
    }

    void Datastore::detach(std::string name)
    {
        m_remotes.erase(name);
    }

    void Datastore::receive(const Message &msg, std::string name)
    {
        if(msg.type == "set") {
            set(msg.path, msg.value);
        }
        else if(msg.type == "push") {
            push(msg.path, msg.value);
        }
        else if(msg.type == "get") {
            get(
                msg.path,
                [](const Message &msg, void *ctx) {
                    Message resp;
                    resp.type = "value";
                    resp.path = msg.path;
                    resp.uuid = msg.uuid;
                    resp.value = msg.value;

                    remote_t *remote = static_cast<remote_t*>(ctx);
                    transmit(remote, resp);
                },
                &m_remotes[name],
                msg.uuid
            );
        }
        else if(msg.type == "value") {
            try {
                request_t request = m_requests.at(msg.uuid);
                if(request.callback)
                    request.callback(msg, request.callback_ctx);

                m_requests.erase(msg.uuid);
            }
            catch(std::out_of_range &e) {
                fprintf(stderr, "Could not find mapped request: %s\n", e.what());
            }
        }
        else if(msg.type == "event") {
            for(auto it = m_subs.begin(); it != m_subs.end(); ++it) {
                const request_t &sub = *it;
                if(sub.remote && sub.remote->name == name) {
                    std::string msg_path = msg.path.get<std::string>();
                    std::string sub_path = sub.msg.path.at("path").get<std::string>();
                    if(msg_path.rfind(sub_path, 0) != std::string::npos) {
                        sub.callback(msg, sub.callback_ctx);
                    }
                }
            }
        }
        else if(msg.type == "subscribe") {
            subscribe(
                msg.path.at("path"),
                [](const Message &msg, void *ctx) {
                    remote_t *remote = static_cast<remote_t*>(ctx);
                    transmit(remote, msg);
                },
                &m_remotes[name],
                msg.path.at("uuid")
            );
        }
        else if(msg.type == "unsubscribe") {
            if(msg.path.is_string()) {
                // Path is a string
                unsubscribe(msg.path.get<std::string>(), msg.uuid);
            }
            else {
                // Path is an object containing path and uuid
                unsubscribe(msg.path.value("path", ""), msg.path.value("uuid", ""));
            }
        }
    }

    std::string Datastore::parse_namespace(std::string path)
    {
        if(!path.empty()) {
            for(auto it = m_remotes.begin(); it != m_remotes.end(); ++it) {
                if(path.rfind(it->first + '.', 0) != std::string::npos)
                    return it->first;
            }
        }
        return "";
    }
}
