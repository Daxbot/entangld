# libentangld

libentangld is a C++ port of entangld, a NodeJS package for syncronized key-value stores.

## Build & Install

libentangld uses CMake to generate its build instructions.  The following section provides commands for building and installing various features of the library.  CMake best practices require a separate build directory from the source.  Create this directory with the following commands.

```
mkdir build
cd build
cmake ..
```

Now you can invoke make.

```
make -j4
sudo make install
```

### Building Docs
libentangld uses Doxygen and Graphviz for generating documentation.

```
sudo apt install -y doxygen graphviz
make doc
```

### Building Samples

Sample client and server applications will be built with ENTANGLD_BUILD_SAMPLES=ON

```
cmake -DENTANGLD_BUILD_SAMPLES=ON ..
make
```

### Building Tests

Tests can be built and run with ENTANGLD_BUILD_TESTS=ON

```
cmake -DENTANGLD_BUILD_TESTS=ON ..
make
make test
```

## Linking

libentangld uses pkg-config to manage external linking.

```
$ pkg-config entangld --libs --cflags
-I/usr/local/include -L/usr/local/lib -luuid -lnlohmann_json::nlohmann_json -lentangld
```

### CMake

If your application uses CMake you can invoke pkg-config from your CMakeLists file.

```
find_package(PkgConfig)
pkg_check_modules(ENTANGLD REQUIRED entangld)
target_include_directories(${PROJECT_NAME} PUBLIC ${ENTANGLD_INCLUDE_DIRS})
target_link_libraries(${PROJECT_NAME} ${ENTANGLD_LIBRARIES})
```