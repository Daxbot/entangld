#include <cassert>
#include <cmath>
#include "Datastore.h"

using namespace entangld;

/** Basic 'set' test - set and retrieve top level value. */
int main()
{
    Datastore *store = new Datastore;

    store->set("key", "value");
    store->get("key", [](const Message &msg, void*){
        assert(msg.value == "value");
    });

    delete store;
    return EXIT_SUCCESS;
}