/** Debug printing macros.
 *
 * @file debug.h
 * @author Wilkins White
 * @copyright 2019 Nova Dynamics LLC
 */

#ifndef DEBUG_H_
#define DEBUG_H_

#if defined(__cplusplus)
extern "C" {
#endif /* __cplusplus */

#define DEBUG_LEVEL_ERROR 1
#define DEBUG_LEVEL_WARN 2
#define DEBUG_LEVEL_INFO 3
#define DEBUG_LEVEL_VERBOSE 4

void set_debug_level(int debug_level);

void debug_print(
    int level, const char *file, int line, const char *format, ...);

/**@{*/
/** Log problems that may need to be resolved by the user. */
#define DEBUG_ERROR(...) \
    debug_print(DEBUG_LEVEL_ERROR, __FILE__, __LINE__, __VA_ARGS__)
/**@}*/

/**@{*/
/** Log problems that will be resolved automatically. */
#define DEBUG_WARN(...) \
    debug_print(DEBUG_LEVEL_WARN, __FILE__, __LINE__, __VA_ARGS__)
/**@}*/

/**@{*/
/** Log one-shot informational messages. */
#define DEBUG_INFO(...) \
    debug_print(DEBUG_LEVEL_INFO, __FILE__, __LINE__, __VA_ARGS__)
/**@}*/

/**@{*/
/** Log verbose informational messages. */
#define DEBUG_VERBOSE(...) \
    debug_print(DEBUG_LEVEL_VERBOSE, __FILE__, __LINE__, __VA_ARGS__)
/**@}*/

#if defined(__cplusplus)
}
#endif /* __cplusplus */

#endif /* DEBUG_H_ */
