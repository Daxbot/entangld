cmake_minimum_required(VERSION 3.5)

project(entangld VERSION 1.0.0 LANGUAGES CXX)

# Clone submodules
find_package(Git QUIET)
if(GIT_FOUND AND EXISTS "${PROJECT_SOURCE_DIR}/../../.git")
    option(GIT_SUBMODULE "Check submodules during build" ON)
    if(GIT_SUBMODULE)
        message(STATUS "Submodule update")
        execute_process(COMMAND ${GIT_EXECUTABLE} submodule update --init --recursive
                        WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
                        RESULT_VARIABLE GIT_SUBMOD_RESULT)
        if(NOT GIT_SUBMOD_RESULT EQUAL "0")
            message(FATAL_ERROR "git submodule update --init failed with ${GIT_SUBMOD_RESULT}, please checkout submodules")
        endif()
    endif()
endif()

if(NOT EXISTS "${PROJECT_SOURCE_DIR}/extern/json/CMakeLists.txt")
    message(FATAL_ERROR "The submodules were not downloaded! GIT_SUBMODULE was turned off or failed. Please update submodules and try again.")
endif()

# Configure project
set(PROJECT_DESCRIPTION "Synchronized key-value stores with RPCs and pub/sub events")
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Configure nlohmann::json
# https://github.com/nlohmann/json
set(JSON_Install ON CACHE INTERNAL "")
set(JSON_BuildTests OFF CACHE INTERNAL "")
add_subdirectory(extern/json)

# Configure library
add_library(${PROJECT_NAME} SHARED src/Datastore.cpp)
set_target_properties(${PROJECT_NAME} PROPERTIES VERSION ${PROJECT_VERSION})
set_target_properties(${PROJECT_NAME} PROPERTIES VERSION ${PROJECT_VERSION})
set_target_properties(${PROJECT_NAME} PROPERTIES SOVERSION ${PROJECT_VERSION_MAJOR})
set_target_properties(${PROJECT_NAME} PROPERTIES PUBLIC_HEADER "include/Datastore.h;include/Message.h")

target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_SOURCE_DIR}/include)

set(LIBS uuid nlohmann_json::nlohmann_json)
target_link_libraries(${PROJECT_NAME} ${LIBS})

# Configure pkg-config
foreach(LIB ${LIBS})
  set(PC_LIBS "${PC_LIBS} -l${LIB} ")
endforeach()

configure_file(entangld.pc.in entangld.pc @ONLY)

# Create 'test' target
option(ENTANGLD_BUILD_TESTS "Build tests" OFF)
if(ENTANGLD_BUILD_TESTS)
    enable_testing()
    add_subdirectory(test)
endif()

# Create 'doc' target
find_package(Doxygen)
if(DOXYGEN_FOUND)
    configure_file(Doxyfile.in Doxyfile @ONLY)
    add_custom_target(doc COMMAND ${DOXYGEN_EXECUTABLE} Doxyfile VERBATIM)
endif (DOXYGEN_FOUND)

# Define install rules
include(GNUInstallDirs)

install(TARGETS ${PROJECT_NAME}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/entangld
)

install(
    FILES ${CMAKE_BINARY_DIR}/entangld.pc
    DESTINATION ${CMAKE_INSTALL_DATAROOTDIR}/pkgconfig
)