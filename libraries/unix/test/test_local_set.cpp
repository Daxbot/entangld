#include <cassert>
#include <cmath>
#include "Datastore.h"

using namespace entangld;

int main(int argc, char *argv[])
{
    Datastore *store = new Datastore;

    store->set("vegetable", "potato");
    store->set("fruit.citrus", "orange");
    store->set("dessert", 3.14159);

    store->get("vegetable", [](const Message &msg, void*){
        assert(msg.value == "potato");
    });

    store->get("fruit.citrus", [](const Message &msg, void*){
        assert(msg.value == "orange");
    });

    store->get("dessert", [](const Message &msg, void*){
        assert(msg.value == 3.14159);
    });

    delete store;

    return EXIT_SUCCESS;
}