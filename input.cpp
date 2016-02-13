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

bool MoonlightInstance::HandleInputEvent(const pp::InputEvent& event) {
    switch (event.GetType()) {
        case PP_INPUTEVENT_TYPE_MOUSEDOWN: {
            pp::MouseInputEvent mouseEvent(event);
            
            LiSendMouseButtonEvent(ConvertPPButtonToLiButton(mouseEvent.GetButton()), BUTTON_ACTION_PRESS);
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_MOUSEMOVE: {
            pp::MouseInputEvent mouseEvent(event);
            pp::Point posDelta = mouseEvent.GetMovement();
            
            LiSendMouseMoveEvent(posDelta.x(), posDelta.y());
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_MOUSEUP: {
            pp::MouseInputEvent mouseEvent(event);
            
            LiSendMouseButtonEvent(ConvertPPButtonToLiButton(mouseEvent.GetButton()), BUTTON_ACTION_RELEASE);
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_WHEEL: {
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