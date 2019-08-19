#include <cassert>
#include <cmath>
#include "Datastore.h"

using namespace entangld;

/** Nested 'set' test - set and retrieve nested value. */
int main()
{
    Datastore *store = new Datastore;

    store->set("root.key", "value");
    store->get("root", [](const Message &msg, void*){
        assert(msg.value.at("key") == "value");
    });

    delete store;
    return EXIT_SUCCESS;
}