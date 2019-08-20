/** Entangld - Synchronized key-value stores with RPCs and pub/sub events.
 *
 * @file Message.h
 * @author Wilkins White
 * @copyright 2019 Nova Dynamics LLC
 */

#ifndef _ENTANGLD_MESSAGE_H_
#define _ENTANGLD_MESSAGE_H_

#include <string>
#include <nlohmann/json.hpp>

namespace entangld
{
    /** Wrapper class for Entangld_Message. */
    class Message {
        public:
            /** Defines a callback for handling Message objects. */
            typedef void (*handler_t)(const Message &msg, void *ctx);

            std::string type;       /**< Message type. @see Datastore::receive */
            nlohmann::json path;    /**< Datastore path that the message is referencing. */
            std::string uuid;       /**< Unique identifier for request tracking. */
            nlohmann::json value;   /**< Message payload. */
    };

    /** Allows embedding of a Message object into json.
     *
     * @param [out] j json object to fill.
     * @param [in] msg source Message.
     */
    static void to_json(nlohmann::json &j, const Message &msg)
    {
        j["type"] = msg.type;
        j["path"] = msg.path;
        j["uuid"] = msg.uuid;

        if(!msg.value.empty())
            j["value"] = msg.value;
    }

    /** Allows extraction of a Message object from json.
     *
     * @param [in] j source json.
     * @param [in] msg Message object to fill.
     */
    static void from_json(const nlohmann::json &j, Message &msg)
    {
        j.at("type").get_to(msg.type);
        j.at("uuid").get_to(msg.uuid);

        msg.path = j.value("path", nlohmann::json(nullptr));
        msg.value = j.value("value", nlohmann::json(nullptr));
    }
}

#endif /* _ENTANGLD_MESSAGE_H_ */