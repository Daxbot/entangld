/** Debug printing macros.
 *
 * @file debug.cpp
 * @author Wilkins White
 * @copyright 2019 Nova Dynamics LLC
 */

#include <stdio.h>
#include <stdarg.h>
#include "debug.h"

static int g_debug_level = 0;

void set_debug_level(int debug_level)
{
    g_debug_level = debug_level;
}

/** Handles debug formatting and passes string to user defined function.
 *
 * @param [in] level the log level of the message.
 * @param [in] file where in the source the message originated.
 * @param [in] line where in 'file' the message originated.
 * @param [in] format standard c formatting string.
 * @private
 */
void debug_print(int level, const char *file, int line, const char *format, ...)
{
    if(level <= g_debug_level) {
        va_list argp;
        char buffer[256];

        va_start(argp, format);
        vsnprintf(buffer, sizeof(buffer), format, argp );
        va_end(argp);

        /* Extract basename from file */
        const char *basename = file;
        for(const char *p = file; *p != '\0'; p++) {
            if(*p == '/' || *p == '\\') {
                basename = p + 1;
            }
        }

        fprintf(
            (level == DEBUG_LEVEL_ERROR) ? stderr : stdout,
            "%s:%04d: |%d| %s\n",
            basename, line, level, buffer
        );
    }
}
