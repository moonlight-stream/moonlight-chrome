#include "moonlight.hpp"

#include <pthread.h>
#include <stdio.h>

#include "ppapi/cpp/input_event.h"

static char s_Host[256];
static STREAM_CONFIGURATION s_StreamConfig;

MoonlightInstance* g_Instance;

MoonlightInstance::~MoonlightInstance() {}

class MoonlightModule : public pp::Module {
    public:
        MoonlightModule() : pp::Module() {}
        virtual ~MoonlightModule() {}

        virtual pp::Instance* CreateInstance(PP_Instance instance) {
            return new MoonlightInstance(instance);
        }
};

void MoonlightInstance::OnConnectionStarted(uint32_t unused) {
    // Start receiving input events
    g_Instance->RequestInputEvents(PP_INPUTEVENT_CLASS_MOUSE);
    g_Instance->RequestFilteringInputEvents(PP_INPUTEVENT_CLASS_WHEEL | PP_INPUTEVENT_CLASS_KEYBOARD);
}

void MoonlightInstance::OnConnectionStopped(uint32_t error) {
    // Stop receiving input events
    g_Instance->ClearInputEventRequest(PP_INPUTEVENT_CLASS_MOUSE | PP_INPUTEVENT_CLASS_WHEEL | PP_INPUTEVENT_CLASS_KEYBOARD);
    
    // Unlock the mouse
    g_Instance->UnlockMouse();
}

void* MoonlightInstance::ConnectionThreadFunc(void* context) {
    MoonlightInstance* me = (MoonlightInstance*)context;
    int err;
    
    err = LiStartConnection(s_Host,
                            &s_StreamConfig,
                            &MoonlightInstance::s_ClCallbacks,
                            &MoonlightInstance::s_DrCallbacks,
                            NULL,
                            NULL, 0, 4);
    if (err != 0) {
        pp::Var response("Starting connection failed");
        g_Instance->PostMessage(response);
        return NULL;
    }
    
    for (;;) {
        me->PollGamepads();
        
        // Poll every 10 ms
        usleep(10 * 1000);
    }
    
    return NULL;
}

void MoonlightInstance::HandleMessage(const pp::Var& var_message) {
    // Ignore the message if it is not a string.
    if (!var_message.is_string())
        return;
 
    std::string host = var_message.AsString();

    // Populate the stream configuration
    LiInitializeStreamConfiguration(&s_StreamConfig);
    s_StreamConfig.width = 1280;
    s_StreamConfig.height = 720;
    s_StreamConfig.fps = 60;
    s_StreamConfig.bitrate = 15000; // kilobits per second
    s_StreamConfig.packetSize = 1024;
    s_StreamConfig.streamingRemotely = 0;
    s_StreamConfig.audioConfiguration = AUDIO_CONFIGURATION_STEREO;

    // Store the host
    host = host.substr(host.find(":") + 1);
    strcpy(s_Host, host.c_str());
    
    // Post a status update before we begin
    pp::Var response("Starting connection...");
    PostMessage(response);
    
    // Start the worker thread to establish the connection
    pthread_t t;
    pthread_create(&t, NULL, MoonlightInstance::ConnectionThreadFunc, this);
}

bool MoonlightInstance::Init(uint32_t argc,
                             const char* argn[],
                             const char* argv[]) {
    g_Instance = this;
    return true;
}

namespace pp {
Module* CreateModule() {
    return new MoonlightModule();
}
}  // namespace pp