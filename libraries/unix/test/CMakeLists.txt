cmake_minimum_required(VERSION 3.5)

add_executable(init test_init.cpp)
target_include_directories(init PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(init entangld)
add_test("init" init)

add_executable(local_get test_local_get.cpp)
target_include_directories(local_get PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(local_get entangld)
add_test("local_get" local_get)

add_executable(local_set test_local_set.cpp)
target_include_directories(local_set PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(local_set entangld)
add_test("local_set" local_set)

add_executable(local_subscribe test_local_subscribe.cpp)
target_include_directories(local_subscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(local_subscribe entangld)
add_test("local_subscribe" local_subscribe)

add_executable(local_unsubscribe test_local_unsubscribe.cpp)
target_include_directories(local_unsubscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(local_unsubscribe entangld)
add_test("local_unsubscribe" local_unsubscribe)

add_executable(remote_get test_remote_get.cpp)
target_include_directories(remote_get PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_get entangld)
add_test("remote_get" remote_get)

add_executable(remote_set test_remote_set.cpp)
target_include_directories(remote_set PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_set entangld)
add_test("remote_set" remote_set)

add_executable(remote_subscribe test_remote_subscribe.cpp)
target_include_directories(remote_subscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_subscribe entangld)
add_test("remote_subscribe" remote_subscribe)

add_executable(remote_unsubscribe test_remote_unsubscribe.cpp)
target_include_directories(remote_unsubscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_unsubscribe entangld)
add_test("remote_unsubscribe" remote_unsubscribe)