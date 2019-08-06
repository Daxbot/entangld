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
            std::string path;       /**< Datastore path that the message is referencing. */
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
        j = nlohmann::json {
            {"type", "Entangld_Message"},
            {"data", {
                {"type",    msg.type},
                {"path",    msg.path},
                {"value",   msg.value},
                {"uuid",    msg.uuid},
            }}
        };
    }

    /** Allows extraction of a Message object from json.
     *
     * @param [in] j source json.
     * @param [in] msg Message object to fill.
     */
    static void from_json(const nlohmann::json &j, Message &msg)
    {
        j.at("data").at("type").get_to(msg.type);
        j.at("data").at("path").get_to(msg.path);
        j.at("data").at("uuid").get_to(msg.uuid);

        if(j.at("data").find("value") != j.at("data").end())
            msg.value = j.at("data").at("value");
    }
}

#endif /* _ENTANGLD_MESSAGE_H_ */