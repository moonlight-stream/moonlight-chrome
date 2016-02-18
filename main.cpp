#include "moonlight.hpp"

#include <pthread.h>
#include <stdio.h>
#include <string.h>

#include "ppapi/cpp/input_event.h"

// you pair to a target
#define PAIR_DIRECTIVE "pair:"
// you need to show the apps of a target
#define SHOW_GAMES_DIRECTIVE "showAppsPushed:"
// you need to use a certain target to start a certain gameID
#define START_STREAM_DIRECTIVE "setGFEHostIPField:"
// No parameters. just request a stop.
#define STOP_DIRECTIVE "stopPushed"

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
    
    pp::Var response("Connection terminated");
    g_Instance->PostMessage(response);
    
    printf("Connection teardown complete\n");
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
    if (!var_message.is_string())
        return;    // Ignore the message if it is not a string.
    std::string message = var_message.AsString();


    if(strncmp(message.c_str(), PAIR_DIRECTIVE, strlen(PAIR_DIRECTIVE)) == 0) {
        handlePair(message);
    } else if (strncmp(message.c_str(), SHOW_GAMES_DIRECTIVE, strlen(SHOW_GAMES_DIRECTIVE)) == 0) {
        handleShowGames(message);
    } else if (strncmp(message.c_str(), START_STREAM_DIRECTIVE, strlen(START_STREAM_DIRECTIVE)) == 0) {
        handleStartStream(message);
    } else if (strncmp(message.c_str(), STOP_DIRECTIVE, strlen(STOP_DIRECTIVE)) == 0) {
        handleStopStream(message);
    } else {
        pp::Var response("Unhandled message received: " + message);
        PostMessage(response);
    }

}

void MoonlightInstance::handlePair(std::string pairMessage) {
    pp::Var response("Pair button pushed. Pairing is unimplemented.");
    PostMessage(response);
    std::string intendedHost = pairMessage.substr(pairMessage.find(PAIR_DIRECTIVE) + strlen(PAIR_DIRECTIVE));
}

void MoonlightInstance::handleShowGames(std::string showGamesMessage) {
    pp::Var response("Show Games button pushed.  Show Games is unimplemented");
    PostMessage(response);
    std::string host = showGamesMessage.substr(showGamesMessage.find(SHOW_GAMES_DIRECTIVE) + strlen(SHOW_GAMES_DIRECTIVE));
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

    // Store the host, which is between two colons
    m_Host = startStreamMessage.substr(strlen(START_STREAM_DIRECTIVE), startStreamMessage.substr(strlen(START_STREAM_DIRECTIVE)).find(":"));
    
    // Start the worker thread to establish the connection
    pthread_create(&m_ConnectionThread, NULL, MoonlightInstance::ConnectionThreadFunc, this);
}

void MoonlightInstance::handleStopStream(std::string stopStreamMessage) {
    pp::Var response("Stop button pushed. Ignoring.");
    PostMessage(response);
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