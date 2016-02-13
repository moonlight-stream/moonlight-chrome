#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var.h"

#include "nacl_io/nacl_io.h"

class MoonlightInstance : public pp::Instance {
    public:
        explicit MoonlightInstance(PP_Instance instance) : pp::Instance(instance) {}
        virtual ~MoonlightInstance() {}
};

class MoonlightModule : public pp::Module {
    public:
        MoonlightModule() : pp::Module() {}
        virtual ~MoonlightModule() {}

        virtual pp::Instance* CreateInstance(PP_Instance instance) {
            return new MoonlightInstance(instance);
        }
};

namespace pp {
Module* CreateModule() {
    // Initialize nacl_io before entering moonlight-common-c for BSD sockets
    nacl_io_init();
    
    return new MoonlightModule();
}
}  // namespace pp