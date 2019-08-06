#include <cassert>
#include "Datastore.h"

using namespace entangld;

int main(int argc, char *argv[])
{
    auto a = nlohmann::json::array();
    a.push_back(1);
    a.push_back(2);
    a.push_back(3);

    Datastore *store = new Datastore({
        {"a", "aardvark"},
        {"b", 0xb},
        {"c", {
            {"d", a},
            {"e", {
                {"f", nullptr}
            }},
        }},
    });

    store->get("a", [](const Message &msg, void*){
        assert(msg.value == "aardvark");
    });

    store->get("b", [](const Message &msg, void*){
        assert(msg.value == 0xb);
    });

    store->get("c.d", [](const Message &msg, void*){
        assert(msg.value[0] == 1);
        assert(msg.value[1] == 2);
        assert(msg.value[2] == 3);
    });

    store->get("c.e.f", [](const Message &msg, void*){
        assert(msg.value == nullptr);
    });

    delete store;

    return EXIT_SUCCESS;
}