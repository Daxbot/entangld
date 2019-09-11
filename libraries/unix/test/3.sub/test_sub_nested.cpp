#include <cassert>
#include <ctime>

#include "Datastore.h"

using namespace entangld;

volatile bool test_done = false;

int main(int argc, char *argv[])
{
    Datastore *store = new Datastore;

    store->subscribe("", [](const Message &msg, void*) {
        assert(msg.value.at("key") == "value");
        test_done = true;
    });

    store->set("key", "value");

    time_t start = time(nullptr);
    while(!test_done) {
        if(difftime(time(nullptr), start) >= 1)
            return EXIT_FAILURE;
    }

    delete store;
    return EXIT_SUCCESS;
}