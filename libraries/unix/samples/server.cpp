#include <fcntl.h>
#include <unistd.h>
#include <signal.h>
#include <netinet/ip.h>
#include <getopt.h>

#include "Message.h"
#include "Datastore.h"
#include "debug.h"

using json = nlohmann::json;
using namespace entangld;

/** Default Host port. */
constexpr int DEFAULT_PORT = 50001;

/** Set by Ctrl-C to trigger shutdown. */
volatile bool g_shutdown_flag = false;

/** Valid command line arguments. */
static struct option long_shared[] = {
    // Arguments
    {"help",    0, nullptr, 'H'},
    {"silent",  0, nullptr, 's'},
    {"verbose", 0, nullptr, 'v'},
    {"port",    1, nullptr, 'p'},

    {nullptr,   0, nullptr, 0},
};

static void print_help(const char *name)
{
    printf("\n");
    printf("Author: Wilkins White\n");
    printf("Copyright: Nova Dynamics, 2019\n");
    printf("\n");
    printf("Usage:\n");
    printf("  %s [options]\n", name);
    printf("\n");
    printf("Supported options:\n");
    printf("  -H, --help            Displays this menu\n");
    printf("  -s, --silent          Disables all printed messages\n");
    printf("  -v, --verbose         Increase the verbosity of printed messages\n");
    printf("  -p, --port            Server listen port, e.g. --port=%d\n", DEFAULT_PORT);
    printf("\n");
}

int main(int argc, char *argv[])
{
    // Initialize settings
    unsigned int port = DEFAULT_PORT;
    int print_level = 1;
    bool silent = false;

    while(1) {
        int c = getopt_long(argc, argv, "Hsvp:", long_shared, NULL);
        if(c == -1)
            break;

        switch(c) {
            default:
            case 'H':
                print_help(argv[0]);
                return EXIT_FAILURE;

            case 's':
                silent = true;
                break;

            case 'v':
                print_level += 1;
                break;

            case 'p':
                port = strtol(optarg, nullptr, 0);
                break;
        }
    }

    // Set debug print level
    if(!silent)
        set_debug_level(print_level);

    // Create Datastore
    DEBUG_VERBOSE("Creating store");
    Datastore *store = new Datastore();

    // Set up listen socket
    DEBUG_VERBOSE("creating socket");
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if(listen_fd < 0) {
        DEBUG_ERROR("socket creation error: %s", strerror(errno));
        return EXIT_FAILURE;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(struct sockaddr_in));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = INADDR_ANY;

    if(bind(listen_fd, (struct sockaddr *)&addr, sizeof(struct sockaddr_in)) < 0) {
        DEBUG_ERROR("socket bind error: %s", strerror(errno));
        return EXIT_FAILURE;
    }

    if(listen(listen_fd, 1) < 0) {
        DEBUG_ERROR("socket listen error: %s", strerror(errno));
        return EXIT_FAILURE;
    }

    int flags = fcntl(listen_fd, F_GETFL, 0);
    fcntl(listen_fd, F_SETFL, flags | O_NONBLOCK);

    // Capture SIGINT and set shutdown_flag for cleanup
    struct sigaction sa;
    sa.sa_handler = [](int){g_shutdown_flag = true; };
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0;
    sigaction(SIGINT, &sa, nullptr);

    DEBUG_INFO("listening on port %d", port);
    while(!g_shutdown_flag) {
        int client_fd = accept(listen_fd, nullptr, nullptr);
        if(client_fd > 0) {
            DEBUG_INFO("new client connected");

            // Set client socket non-blocking
            int flags = fcntl(listen_fd, F_GETFL, 0);
            fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);

            // Attach datastore to client
            store->attach("client",
                [](const Message &msg, void *ctx){
                    int fd = *static_cast<int*>(ctx);
                    std::string resp = json(msg).dump() + '\n';
                    DEBUG_VERBOSE("TX: %s", resp.c_str());
                    write(fd, resp.c_str(), resp.length());
                },
                &client_fd
            );

            // Read and parse Entangld_Message objects
            char buffer[2048];
            memset(buffer, 0, sizeof(buffer));

            while(!g_shutdown_flag) {
                int count = read(client_fd, buffer, sizeof(buffer));
                buffer[count] = '\0';

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
                            store->receive(msg, "client");
                        }

                        size -= (end - start);
                        start = end;
                    }
                }
                else if(count == 0) {
                    // Socket closed
                    DEBUG_WARN("client closed connection");
                    break;
                }
            }

            // Clean up and disconnect client
            store->reset();
            close(client_fd);
            client_fd = -1;

            DEBUG_INFO("client disconnected");
        }
    }

    delete store;
    return EXIT_SUCCESS;
}