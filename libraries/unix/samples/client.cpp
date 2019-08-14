#include <fcntl.h>
#include <unistd.h>
#include <netinet/ip.h>
#include <arpa/inet.h>
#include <getopt.h>
#include <string>
#include <chrono>

#include "Message.h"
#include "Datastore.h"
#include "debug.h"

using json = nlohmann::json;
using namespace entangld;
using namespace std::chrono;

constexpr char DEFAULT_HOST[] = "127.0.0.1";    /**< Default host address. */
constexpr int DEFAULT_PORT = 50001;             /**< Default host port. */
constexpr int DEFAULT_TIMEOUT = 2000;           /**< Default timeout. */

/** Set to trigger shutdown. */
volatile bool g_shutdown_flag = false;

/** Valid command line arguments. */
static struct option long_shared[] = {
    {"help",    0, nullptr, 'H'},
    {"silent",  0, nullptr, 's'},
    {"verbose", 0, nullptr, 'v'},
    {"host",    1, nullptr, 'h'},
    {"port",    1, nullptr, 'p'},
    {"timeout", 1, nullptr, 't'},

    {nullptr,   0, nullptr, 0},
};

static void print_help(const char *name)
{
    printf("\n");
    printf("Author: Wilkins White\n");
    printf("Copyright: Nova Dynamics, 2019\n");
    printf("\n");
    printf("Usage:\n");
    printf("  %s [options] get <path>\n", name);
    printf("  %s [options] set <path> <value>\n", name);
    printf("\n");
    printf("Supported options:\n");
    printf("  -H, --help        Displays this menu\n");
    printf("  -s, --silent      Disables all printed messages\n");
    printf("  -v, --verbose     Increase the verbosity of printed messages\n");
    printf("  -h, --host        Server address, e.g. --host=%s\n", DEFAULT_HOST);
    printf("  -p, --port        Server port, e.g. --port=%d\n", DEFAULT_PORT);
    printf("  -t, --timeout     Set timeout in ms, e.g. --timeout=%d\n", DEFAULT_TIMEOUT);
    printf("\n");
    printf("  --debug               Enable debug printing\n");
    printf("\n");
}

int main(int argc, char *argv[])
{
    // Initialize settings
    char host[64];
    snprintf(host, sizeof(host), "%s", DEFAULT_HOST);

    unsigned int port = DEFAULT_PORT;
    int timeout_ms = DEFAULT_TIMEOUT;
    int print_level = 1;
    bool silent = false;

    while(1) {
        int c = getopt_long(argc, argv, "Hsvh:p:t:", long_shared, NULL);
        if(c == -1)
            break;

        switch(c) {
            default:
            case 'H':
                print_help(argv[0]);
                return EXIT_FAILURE;

            case 'v':
                print_level += 1;
                break;

            case 'h':
                snprintf(host, sizeof(host), "%s", optarg);
                break;

            case 'p':
                port = strtol(optarg, nullptr, 0);
                break;

            case 't':
                timeout_ms = strtol(optarg, nullptr, 0);
                break;
        }
    }

    // Set debug print level
    if(!silent)
        set_debug_level(print_level);

    // Check required arguments
    bool set_flag;
    if(argv[optind] == nullptr) {
        DEBUG_ERROR("must provide a command (--help for usage)");
        return EXIT_FAILURE;
    }
    else if(strcmp(argv[optind], "get") == 0) {
        set_flag = false;
    }
    else if(strcmp(argv[optind], "set") == 0) {
        set_flag = true;
    }
    else {
        DEBUG_ERROR("unknown command '%s' (--help for usage)\n", argv[optind]);
        return EXIT_FAILURE;
    }

    if(argv[optind+1] == nullptr) {
        DEBUG_ERROR("must provide a path (--help for usage)");
        return EXIT_FAILURE;
    }

    if(set_flag && argv[optind+2] == nullptr) {
        DEBUG_ERROR("must provide a value for set (--help for usage)");
        return EXIT_FAILURE;
    }

    // Create socket
    DEBUG_VERBOSE("creating socket");
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if(fd < 0) {
        DEBUG_ERROR("socket creation error: %s", strerror(errno));
        return EXIT_FAILURE;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(struct sockaddr_in));

    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);

    // Convert IPv4 and IPv6 addresses from text to binary form
    if(inet_pton(AF_INET, host, &addr.sin_addr) <= 0) {
        DEBUG_ERROR("invalid hostname: %s", strerror(errno));
        return EXIT_FAILURE;
    }

    // Connect to Entangld server
    DEBUG_INFO("connecting to server at %s:%d", host, port);
    if(connect(fd, (struct sockaddr*)&addr, sizeof(struct sockaddr)) < 0) {
        DEBUG_ERROR("connection failed: %s", strerror(errno));
        return EXIT_FAILURE;
    }

    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);

    // Create Datastore object
    DEBUG_VERBOSE("creating store");
    Datastore *store = new Datastore();

    // Register remote namespace
    store->attach("remote",
        [](const Message &msg, void *ctx){
            int fd = *static_cast<int*>(ctx);
            std::string resp = json(msg).dump() + '\n';
            DEBUG_VERBOSE("TX: %s", resp.c_str());
            write(fd, resp.c_str(), resp.length());
        },
        &fd
    );

    std::string remote_path = "remote." + std::string(argv[optind+1]);
    if(set_flag) {
        // Subscribe to value so we know if set was successful
        store->subscribe(
            remote_path,
            [](const Message &msg, void *ctx) {
                Datastore *store = static_cast<Datastore*>(ctx);
                printf("%s\n", msg.value.dump(4).c_str());
                g_shutdown_flag = true;
            },
            store
        );

        // Set value
        store->set(remote_path, std::string(argv[optind+2]));
    }
    else {
        // Get value from remote
        store->get(
            remote_path,
            [](const Message &msg, void *ctx) {
                printf("%s\n", msg.value.dump(4).c_str());
                g_shutdown_flag = true;
            }
        );
    }

    // Wait for response
    char buffer[2048];
    memset(buffer, 0, sizeof(buffer));

    const auto start = steady_clock::now();
    while(!g_shutdown_flag) {
        int count = read(fd, buffer, sizeof(buffer));

        if(count > 0) {
            char *start = buffer;
            int size = count;
            while(size > 1) {
                // Split buffer on newlines
                char *end = static_cast<char *>(memchr(start+1, '\n', size-1));
                if(end == nullptr)
                    break;

                json j = json::parse(start, end);
                DEBUG_VERBOSE("RX: %s", j.dump().c_str());

                if(j["type"] == "Entangld_Message") {
                    Message msg = j.get<Message>();
                    store->receive(msg, "remote");
                }

                size -= (end - start);
                start = end;
            }
        }
        else if(count == 0) {
            // Socket closed
            DEBUG_WARN("server closed connection");
            fd = -1;
            break;
        }

        auto elapsed_ms = duration_cast<milliseconds>(steady_clock::now()-start);
        if(elapsed_ms.count() > timeout_ms) {
            DEBUG_ERROR("timeout");
            break;
        }
    }

    close(fd);
    delete store;
    return EXIT_SUCCESS;
}
