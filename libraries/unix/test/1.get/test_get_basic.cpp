#include <cassert>
#include "Datastore.h"

using namespace entangld;

/** Basic 'get' test - access top level value assigned in constructor. */
int main()
{
    nlohmann::json j;
    j["key"] = "value";

    Datastore *store = new Datastore(j);

    // Get "key" should return "value" as a string
    store->get("key", [](const Message &msg, void*){
        assert(msg.value == "value");
    });

    // Get "badkey" should return null
    store->get("badkey", [](const Message &msg, void*){
        assert(msg.value == nullptr);
    });

    delete store;
    return EXIT_SUCCESS;
}