cmake_minimum_required(VERSION 3.5)

project(entangld VERSION 1.0.0 LANGUAGES CXX)

enable_testing()

set(PROJECT_DESCRIPTION "Synchronized key-value stores with RPCs and pub/sub events")

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(JSON_BuildTests OFF CACHE INTERNAL "")
set(JSON_Install OFF CACHE INTERNAL "")

add_subdirectory(extern/json)
add_subdirectory(test)

add_library(${PROJECT_NAME} SHARED src/Datastore.cpp)

set_target_properties(${PROJECT_NAME} PROPERTIES VERSION ${PROJECT_VERSION})
set_target_properties(${PROJECT_NAME} PROPERTIES VERSION ${PROJECT_VERSION})
set_target_properties(${PROJECT_NAME} PROPERTIES SOVERSION ${PROJECT_VERSION_MAJOR})
set_target_properties(${PROJECT_NAME} PROPERTIES PUBLIC_HEADER "include/Datastore.h;include/Message.h")

target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_SOURCE_DIR}/include)

target_link_libraries(${PROJECT_NAME} uuid nlohmann_json::nlohmann_json)

include(GNUInstallDirs)

install(TARGETS ${PROJECT_NAME}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/entangld)

configure_file(entangld.pc.in entangld.pc @ONLY)

install(FILES ${CMAKE_BINARY_DIR}/entangld.pc DESTINATION ${CMAKE_INSTALL_DATAROOTDIR}/pkgconfig)
