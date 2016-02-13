#include "moonlight.hpp"

#include "ppapi/c/ppb_input_event.h"

#include "ppapi/cpp/input_event.h"

#include <Limelight.h>

static int ConvertPPButtonToLiButton(PP_InputEvent_MouseButton ppButton) {
    switch (ppButton) {
        case PP_INPUTEVENT_MOUSEBUTTON_LEFT:
            return BUTTON_LEFT;
        case PP_INPUTEVENT_MOUSEBUTTON_MIDDLE:
            return BUTTON_MIDDLE;
        case PP_INPUTEVENT_MOUSEBUTTON_RIGHT:
            return BUTTON_RIGHT;
        default:
            return 0;
    }
}

void MoonlightInstance::DidLockMouse(int32_t result) {
    m_MouseLocked = (result == PP_OK);
}

void MoonlightInstance::MouseLockLost() {
    m_MouseLocked = false;
}

bool MoonlightInstance::HandleInputEvent(const pp::InputEvent& event) {
    switch (event.GetType()) {
        case PP_INPUTEVENT_TYPE_MOUSEDOWN: {
            // Lock the mouse cursor when the user clicks on the stream
            if (!m_MouseLocked) {
                g_Instance->LockMouse(g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::DidLockMouse));
                
                // Assume it worked until we get a callback telling us otherwise
                m_MouseLocked = true;
                return true;
            }
            
            pp::MouseInputEvent mouseEvent(event);
            
            LiSendMouseButtonEvent(BUTTON_ACTION_PRESS, ConvertPPButtonToLiButton(mouseEvent.GetButton()));
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_MOUSEMOVE: {
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::MouseInputEvent mouseEvent(event);
            pp::Point posDelta = mouseEvent.GetMovement();
            
            LiSendMouseMoveEvent(posDelta.x(), posDelta.y());
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_MOUSEUP: {
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::MouseInputEvent mouseEvent(event);
            
            LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, ConvertPPButtonToLiButton(mouseEvent.GetButton()));
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_WHEEL: {
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::WheelInputEvent wheelEvent(event);
            
            // FIXME: Handle fractional scroll ticks
            LiSendScrollEvent((signed char) wheelEvent.GetTicks().y());
            return true;
        }
        
        default: {
            return false;
        }
    }
}