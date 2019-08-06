#ifndef _ENTANGLD_MESSAGE_H_
#define _ENTANGLD_MESSAGE_H_

#include <string>
#include <nlohmann/json.hpp>

namespace entangld
{
    class Message {
        public:
            typedef void (*handler_t)(const Message &msg, void *ctx);

            std::string type;
            std::string path;
            std::string uuid;
            nlohmann::json value;
    };

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