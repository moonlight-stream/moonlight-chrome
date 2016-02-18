#include "moonlight.hpp"

#include <pthread.h>
#include <stdio.h>
#include <string.h>

#include "ppapi/cpp/input_event.h"


// Requests the NaCl module to connection to the server specified after the :
#define MSG_START_REQUEST "startRequest:"
// Requests the NaCl module stop streaming
#define MSG_STOP_REQUEST "stopRequest"
// Sent by the NaCl module when the stream has stopped whether user-requested or not
#define MSG_STREAM_TERMINATED "streamTerminated"

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
    // Not running anymore
    g_Instance->m_Running = false;
    
    // Stop receiving input events
    g_Instance->ClearInputEventRequest(PP_INPUTEVENT_CLASS_MOUSE | PP_INPUTEVENT_CLASS_WHEEL | PP_INPUTEVENT_CLASS_KEYBOARD);
    
    // Unlock the mouse
    g_Instance->UnlockMouse();
    
    // Join threads
    pthread_join(g_Instance->m_ConnectionThread, NULL);
    pthread_join(g_Instance->m_GamepadThread, NULL);
    
    // Notify the JS code that the stream has ended
    pp::Var response(MSG_STREAM_TERMINATED);
    g_Instance->PostMessage(response);
}

void MoonlightInstance::StopConnection() {
    pthread_t t;
    
    // Stopping needs to happen in a separate thread to avoid a potential deadlock
    // caused by us getting a callback to the main thread while inside LiStopConnection.
    pthread_create(&t, NULL, MoonlightInstance::StopThreadFunc, NULL);
    
    // We'll need to call the listener ourselves since our connection terminated callback
    // won't be invoked for a manually requested termination.
    OnConnectionStopped(0);
}

void* MoonlightInstance::StopThreadFunc(void* context) {
    // Stop the connection
    LiStopConnection();
    return NULL;
}

void* MoonlightInstance::GamepadThreadFunc(void* context) {
    MoonlightInstance* me = (MoonlightInstance*)context;

    while (me->m_Running) {
        me->PollGamepads();
        
        // Poll every 10 ms
        usleep(10 * 1000);
    }
    
    return NULL;
}

void* MoonlightInstance::ConnectionThreadFunc(void* context) {
    MoonlightInstance* me = (MoonlightInstance*)context;
    int err;
    
    // Post a status update before we begin
    pp::Var response("Starting connection to " + me->m_Host);
    me->PostMessage(response);
    
    err = LiStartConnection(me->m_Host.c_str(),
                            &me->m_StreamConfig,
                            &MoonlightInstance::s_ClCallbacks,
                            &MoonlightInstance::s_DrCallbacks,
                            &MoonlightInstance::s_ArCallbacks,
                            NULL, 0,
                            me->m_ServerMajorVersion);
    if (err != 0) {
        pp::Var response("Starting connection failed");
        me->PostMessage(response);
        return NULL;
    }
    
    // Set running state before starting connection-specific threads
    me->m_Running = true;
    
    pthread_create(&me->m_GamepadThread, NULL, MoonlightInstance::GamepadThreadFunc, me);
    
    return NULL;
}

// hook from javascript into the CPP code.
void MoonlightInstance::HandleMessage(const pp::Var& var_message) {
     // Ignore the message if it is not a string.
    if (!var_message.is_string())
        return;
    
    std::string message = var_message.AsString();

    if (message.substr(0, strlen(MSG_START_REQUEST)) == MSG_START_REQUEST) {
        handleStartStream(message);
    } else if (message.substr(0, strlen(MSG_STOP_REQUEST)) == MSG_STOP_REQUEST) {
        handleStopStream(message);
    } else {
        pp::Var response("Unhandled message received: " + message);
        PostMessage(response);
    }
}

void MoonlightInstance::handleStartStream(std::string startStreamMessage) {
    // Populate the stream configuration
    m_StreamConfig.width = 1280;
    m_StreamConfig.height = 720;
    m_StreamConfig.fps = 60;
    m_StreamConfig.bitrate = 15000; // kilobits per second
    m_StreamConfig.packetSize = 1024;
    m_StreamConfig.streamingRemotely = 0;
    m_StreamConfig.audioConfiguration = AUDIO_CONFIGURATION_STEREO;
    
    m_ServerMajorVersion = 4;

    // Store the host from the start message
    m_Host = startStreamMessage.substr(strlen(MSG_START_REQUEST));
    
    // Start the worker thread to establish the connection
    pthread_create(&m_ConnectionThread, NULL, MoonlightInstance::ConnectionThreadFunc, this);
}

void MoonlightInstance::handleStopStream(std::string stopStreamMessage) {
    // Begin connection teardown
    StopConnection();
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