#include "moonlight.hpp"

#include "ppapi/c/ppb_input_event.h"

#include "ppapi/cpp/input_event.h"
#include "ppapi/cpp/mouse_lock.h"

void MoonlightInstance::ClStageStarting(int stage) {
    pp::Var response(std::string("ProgressMsg: Starting ") + std::string(LiGetStageName(stage)) + std::string("..."));
    g_Instance->PostMessage(response);
}

void MoonlightInstance::ClStageFailed(int stage, long errorCode) {
    pp::Var response(std::string("Starting ") + std::string(LiGetStageName(stage)) + std::string("failed"));
    g_Instance->PostMessage(response);
}

void MoonlightInstance::ClConnectionStarted(void) {
    pp::Module::Get()->core()->CallOnMainThread(0,
        g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::OnConnectionStarted));
}

void MoonlightInstance::ClConnectionTerminated(long errorCode) {
    // Teardown the connection
    LiStopConnection();
    
    pp::Module::Get()->core()->CallOnMainThread(0,
        g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::OnConnectionStopped), (uint32_t)errorCode);
}

void MoonlightInstance::ClDisplayMessage(const char* message) {
    pp::Var response(std::string("DialogMsg: ") + std::string(message));
    g_Instance->PostMessage(response);
}

void MoonlightInstance::ClDisplayTransientMessage(const char* message) {
    pp::Var response(std::string("TransientMsg: ") + std::string(message));
    g_Instance->PostMessage(response);
}

CONNECTION_LISTENER_CALLBACKS MoonlightInstance::s_ClCallbacks = {
    MoonlightInstance::ClStageStarting,
    NULL,
    MoonlightInstance::ClStageFailed,
    MoonlightInstance::ClConnectionStarted,
    MoonlightInstance::ClConnectionTerminated,
    MoonlightInstance::ClDisplayMessage,
    MoonlightInstance::ClDisplayTransientMessage
};
