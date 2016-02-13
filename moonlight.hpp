#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var.h"

#include "ppapi/c/ppb_gamepad.h"

#include "nacl_io/nacl_io.h"

class MoonlightInstance : public pp::Instance {
    public:
        explicit MoonlightInstance(PP_Instance instance) : pp::Instance(instance) {            
            // This function MUST be used otherwise sockets don't work (nacl_io_init() doesn't work!)            
            nacl_io_init_ppapi(pp_instance(), pp::Module::Get()->get_browser_interface());
            
            m_GamepadApi = static_cast<const PPB_Gamepad*>(pp::Module::Get()->GetBrowserInterface(PPB_GAMEPAD_INTERFACE));
        }
        
        virtual ~MoonlightInstance();
        
        bool HandleInputEvent(const pp::InputEvent& event);
        
        void PollGamepads();
        
    private:
        double m_LastPadTimestamps[4];
        const PPB_Gamepad* m_GamepadApi;
};