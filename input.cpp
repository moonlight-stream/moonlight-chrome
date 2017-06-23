#include "moonlight.hpp"

#include "ppapi/c/ppb_input_event.h"

#include "ppapi/cpp/input_event.h"

#include <Limelight.h>

#define KEY_PREFIX 0x80

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
    if (m_MouseLocked) {
        // Request an IDR frame to dump the frame queue that may have
        // built up from the GL pipeline being stalled.
        g_Instance->m_RequestIdrFrame = true;
    }
}

void MoonlightInstance::MouseLockLost() {
    m_MouseLocked = false;
}

static char GetModifierFlags(const pp::InputEvent& event) {
    uint32_t modifiers = event.GetModifiers();
    char flags = 0;
    
    if (modifiers & PP_INPUTEVENT_MODIFIER_SHIFTKEY) {
        flags |= MODIFIER_SHIFT;
    }
    if (modifiers & PP_INPUTEVENT_MODIFIER_CONTROLKEY) {
        flags |= MODIFIER_CTRL;
    }
    if (modifiers & PP_INPUTEVENT_MODIFIER_ALTKEY) {
        flags |= MODIFIER_ALT;
    }
    
    return flags;
}

void MoonlightInstance::ReportMouseMovement() {
    if (m_MouseDeltaX != 0 || m_MouseDeltaY != 0) {
        LiSendMouseMoveEvent(m_MouseDeltaX, m_MouseDeltaY);
        m_MouseDeltaX = m_MouseDeltaY = 0;
    }
}

bool MoonlightInstance::HandleInputEvent(const pp::InputEvent& event) {
    switch (event.GetType()) {
        case PP_INPUTEVENT_TYPE_MOUSEDOWN: {
            // Lock the mouse cursor when the user clicks on the stream
            if (!m_MouseLocked) {
                LockMouse(m_CallbackFactory.NewCallback(&MoonlightInstance::DidLockMouse));
                
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
            
            // Wait to report mouse movement until the next input polling window
            // to allow batching to occur which reduces overall input lag.
            m_MouseDeltaX += posDelta.x();
            m_MouseDeltaY += posDelta.y();
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
            signed char fullTicks;
            
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::WheelInputEvent wheelEvent(event);
            
            // Accumulate the current tick value
            m_AccumulatedTicks += wheelEvent.GetTicks().y();
            
            // Compute the number of full ticks
            fullTicks = (signed char) m_AccumulatedTicks;
            
            // Send a scroll event if we've completed a full tick
            if (fullTicks != 0) {
                LiSendScrollEvent(fullTicks);
                m_AccumulatedTicks -= fullTicks;
            }
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_KEYDOWN: {
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::KeyboardInputEvent keyboardEvent(event);
            char modifiers = GetModifierFlags(event);
            
            if (modifiers == (MODIFIER_ALT | MODIFIER_CTRL | MODIFIER_SHIFT)) {
                if (keyboardEvent.GetKeyCode() == 0x51) { // Q key
                    // Terminate the connection
                    StopConnection();
                    return true;
                }
                else {
                    // Wait until these keys come up to unlock the mouse
                    m_WaitingForAllModifiersUp = true;
                }
            }
            
            LiSendKeyboardEvent(KEY_PREFIX << 8 | keyboardEvent.GetKeyCode(),
                                KEY_ACTION_DOWN, modifiers);
            return true;
        }
        
         case PP_INPUTEVENT_TYPE_KEYUP: {
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::KeyboardInputEvent keyboardEvent(event);
            char modifiers = GetModifierFlags(event);
             
            // Check if all modifiers are up now
            if (m_WaitingForAllModifiersUp && modifiers == 0) {
                UnlockMouse();
                m_MouseLocked = false;
                m_WaitingForAllModifiersUp = false;
            }
            
            LiSendKeyboardEvent(KEY_PREFIX << 8 | keyboardEvent.GetKeyCode(),
                                KEY_ACTION_UP, modifiers);
            return true;
        }
        
        default: {
            return false;
        }
    }
}