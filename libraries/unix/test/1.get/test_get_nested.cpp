#include <cassert>
#include "Datastore.h"

using namespace entangld;

/** Nested 'get' test - access nested values assigned in constructor. */
int main()
{
    nlohmann::json j;
    j["a"]["b"]["c"] = 0xd;

    Datastore *store = new Datastore(j);

    // Get "" should return the full structure
    store->get("", [](const Message &msg, void*){
        assert(msg.value.at("a").at("b").at("c") == 0xd);
    });

    // Get "a.b.c" should return 0xd
    store->get("a.b.c", [](const Message &msg, void*){
        assert(msg.value == 0xd);
    });

    // Get "a.badkey" should return null
    store->get("a.badkey", [](const Message &msg, void*){
        assert(msg.value == nullptr);
    });

    delete store;
    return EXIT_SUCCESS;
}
