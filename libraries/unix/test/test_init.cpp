#include <cassert>
#include "Datastore.h"

using namespace entangld;

int main(int argc, char *argv[])
{
    Datastore *store = nullptr;

    // Default constructor
    store = new Datastore;
    delete store;

    // JSON constructor
    store = new Datastore({
        {"a", 1},
        {"b", 2},
        {"c", 3},
    });
    delete store;

    return EXIT_SUCCESS;
}