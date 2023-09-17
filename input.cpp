#include "moonlight.hpp"

#include "ppapi/c/ppb_input_event.h"
#include "ppapi/cpp/mouse_cursor.h"

#include "ppapi/cpp/input_event.h"

#include <Limelight.h>

#include <math.h>

#define KEY_PREFIX 0x80

#define TOUCH_DEAD_ZONE_DELAY 0.250
#define TOUCH_DEAD_ZONE_RADIUS 50

#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))

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

void MoonlightInstance::LockMouseOrJustCaptureInput() {
    if (m_MouseLockingFeatureEnabled) {
        LockMouse(m_CallbackFactory.NewCallback(&MoonlightInstance::DidLockMouse));
    }
    else {
        pp::MouseCursor::SetCursor(this, PP_MOUSECURSOR_TYPE_NONE);
    }

    // Assume it worked until we get a callback telling us otherwise;
    // if not locking mouse this just serves to tell us whether to capture input
    m_MouseLocked = true;
}

void MoonlightInstance::UnlockMouseOrJustReleaseInput() {
    if (m_MouseLockingFeatureEnabled) {
        UnlockMouse();
    } else {
        pp::MouseCursor::SetCursor(this, PP_MOUSECURSOR_TYPE_POINTER);
    }
    m_MouseLocked = false;
    m_WaitingForAllModifiersUp = false;
}

void MoonlightInstance::DidLockMouse(int32_t result) {
    m_MouseLocked = (result == PP_OK);
    if (m_MouseLocked) {
        // Request an IDR frame to dump the frame queue that may have
        // built up from the GL pipeline being stalled.
        LiRequestIdrFrame();
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

static uint32_t GetTranslatedKeyCode(const pp::KeyboardInputEvent& event) {

    // For some reason, NaCl won't give us the real left and right
    // VK codes for modifiers and instead gives us modifier flags
    // to indicate whether the key is left or right. We have to
    // convert these back to the original VK codes to before
    // sending them to the PC.
    switch (event.GetKeyCode()) {
        // VK_SHIFT
        case 0x10:
            if (event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISLEFT) {
                // VK_LSHIFT
                return 0xA0;
            }
            else if (event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISRIGHT) {
                // VK_RSHIFT
                return 0xA1;
            }
            break;

        // VK_CONTROL
        case 0x11:
            if (event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISLEFT) {
                // VK_LCONTROL
                return 0xA2;
            }
            else if (event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISRIGHT) {
                // VK_RCONTROL
                return 0xA3;
            }
            break;

        // VK_MENU (Alt)
        case 0x12:
            if (event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISLEFT) {
                // VK_LMENU
                return 0xA4;
            }
            else if (event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISRIGHT) {
                // VK_RMENU
                return 0xA5;
            }
            break;

        default:
            break;
    }

    // We have to handle the ISKEYPAD modifier on macOS, and convert them
    // to the correct numpad keycodes for Windows.
    int32_t num = event.GetKeyCode() - 0x30;
    if ((event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISKEYPAD) &&
        num >= 0 && num <= 9) {
        // Offset with numpad 0's virtual keycode
        return num + 0x60;
    }

    return event.GetKeyCode();
}

void MoonlightInstance::ReportMouseMovement() {
    if (m_MouseDeltaX != 0 || m_MouseDeltaY != 0) {
        LiSendMouseMoveEvent(m_MouseDeltaX, m_MouseDeltaY);
        m_MouseDeltaX = m_MouseDeltaY = 0;
    } else if (m_MousePositionX != 0 || m_MousePositionY != 0) {
        // Clamp the input coordinates to the plugin area
        short x = MIN(MAX(m_MousePositionX, 0), m_PluginRect.width());
        short y = MIN(MAX(m_MousePositionY, 0), m_PluginRect.height());
        LiSendMousePositionEvent(x, y, m_PluginRect.width(), m_PluginRect.height());
        m_MousePositionX = 0;
        m_MousePositionY = 0;
    }
    if (m_AccumulatedTicks != 0) {
        // We can have fractional ticks here, so multiply by WHEEL_DELTA
        // to get actual scroll distance and use the high-res variant.
        LiSendHighResScrollEvent(m_AccumulatedTicks * 120);
        m_AccumulatedTicks = 0;
    }
}

bool MoonlightInstance::TryHandleNativeTouchEvent(const pp::InputEvent& event) {
    // Check if the host supports native pen/touch events
    if (!(LiGetHostFeatureFlags() & LI_FF_PEN_TOUCH_EVENTS)) {
        return false;
    }

    uint8_t eventType;
    switch (event.GetType()) {
    case PP_INPUTEVENT_TYPE_TOUCHSTART:
        eventType = LI_TOUCH_EVENT_DOWN;
        break;
    case PP_INPUTEVENT_TYPE_TOUCHMOVE:
        eventType = LI_TOUCH_EVENT_MOVE;
        break;
    case PP_INPUTEVENT_TYPE_TOUCHEND:
        eventType = LI_TOUCH_EVENT_UP;
        break;
    case PP_INPUTEVENT_TYPE_TOUCHCANCEL:
        eventType = LI_TOUCH_EVENT_CANCEL;
        break;
    default:
        // Not a touch event
        return false;
    }

    pp::TouchInputEvent touchEvent(event);
    uint32_t count = touchEvent.GetTouchCount(PP_TOUCHLIST_TYPE_CHANGEDTOUCHES);
    for (uint32_t i = 0; i < count; i++) {
        pp::TouchPoint touchPoint = touchEvent.GetTouchByIndex(PP_TOUCHLIST_TYPE_CHANGEDTOUCHES, i);
        pp::FloatPoint touchPos = touchPoint.position();
        LiSendTouchEvent(eventType, touchPoint.id(),
                         MIN(MAX(touchPos.x(), 0), m_PluginRect.width()) / m_PluginRect.width(),
                         MIN(MAX(touchPos.y(), 0), m_PluginRect.height()) / m_PluginRect.height(),
                         touchPoint.pressure(),
                         0.0f, 0.0f,
                         touchPoint.rotation_angle());
    }

    return true;
}

bool MoonlightInstance::HandleInputEvent(const pp::InputEvent& event) {
    // If the host can handle native touch events, send them natively
    if (TryHandleNativeTouchEvent(event)) {
        return true;
    }

    switch (event.GetType()) {
        case PP_INPUTEVENT_TYPE_MOUSEDOWN: {
            // Lock the mouse cursor when the user clicks on the stream
            if (!m_MouseLocked) {
                LockMouseOrJustCaptureInput();
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
            pp::Point position = mouseEvent.GetPosition();
            
            // Wait to report mouse movement until the next input polling window
            // to allow batching to occur which reduces overall input lag.
            if (m_MouseLocked) {
                if (m_MouseLockingFeatureEnabled) {
                    m_MouseDeltaX += posDelta.x();
                    m_MouseDeltaY += posDelta.y();
                } else {
                    m_MousePositionX = position.x();
                    m_MousePositionY = position.y();
                }
            }
            
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
            
            // Accumulate the current tick value
            m_AccumulatedTicks += wheelEvent.GetTicks().y();
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_KEYDOWN: {
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::KeyboardInputEvent keyboardEvent(event);
            char modifiers = GetModifierFlags(event);
            uint32_t keyCode = GetTranslatedKeyCode(keyboardEvent);
            
            if (modifiers == (MODIFIER_ALT | MODIFIER_CTRL | MODIFIER_SHIFT)) {
                if (keyCode == 0x51) { // Q key
                    // Terminate the connection
                    StopConnection();
                    return true;
                }
                else {
                    // Wait until these keys come up to unlock the mouse
                    m_WaitingForAllModifiersUp = true;
                }
            }
            
            if (event.GetModifiers() & PP_INPUTEVENT_MODIFIER_ISAUTOREPEAT) {
                return true;
            }

            LiSendKeyboardEvent(KEY_PREFIX << 8 | keyCode,
                                KEY_ACTION_DOWN, modifiers);
            return true;
        }
        
        case PP_INPUTEVENT_TYPE_KEYUP: {
            if (!m_MouseLocked) {
                return false;
            }
            
            pp::KeyboardInputEvent keyboardEvent(event);
            char modifiers = GetModifierFlags(event);
            uint32_t keyCode = GetTranslatedKeyCode(keyboardEvent);
             
            // Check if all modifiers are up now
            if (m_WaitingForAllModifiersUp && modifiers == 0) {
                UnlockMouseOrJustReleaseInput();
            }
            
            LiSendKeyboardEvent(KEY_PREFIX << 8 | keyCode,
                                KEY_ACTION_UP, modifiers);
            return true;
        }

        case PP_INPUTEVENT_TYPE_TOUCHMOVE:
        case PP_INPUTEVENT_TYPE_TOUCHSTART: {
            pp::TouchInputEvent touchEvent(event);

            pp::FloatPoint touchPoint = touchEvent.GetTouchByIndex(PP_TOUCHLIST_TYPE_TARGETTOUCHES, 0).position();

            // Create a small deadzone for touch downs to allow more precise double-clicks
            if (event.GetType() == PP_INPUTEVENT_TYPE_TOUCHMOVE ||
                event.GetTimeStamp() - m_LastTouchUpTime > TOUCH_DEAD_ZONE_DELAY ||
                sqrt(pow(m_LastTouchUpPoint.x() - touchPoint.x(), 2) +
                     pow(m_LastTouchUpPoint.y() - touchPoint.y(), 2)) > TOUCH_DEAD_ZONE_RADIUS) {
                // Scale the touch coordinates to the video rect
                short x = MIN(MAX(touchPoint.x(), 0), m_PluginRect.width());
                short y = MIN(MAX(touchPoint.y(), 0), m_PluginRect.height());

                // Update the mouse position prior to sending the button down
                LiSendMousePositionEvent(x, y, m_PluginRect.width(), m_PluginRect.height());
            }

            if (event.GetType() == PP_INPUTEVENT_TYPE_TOUCHSTART &&
                    touchEvent.GetTouchCount(PP_TOUCHLIST_TYPE_TARGETTOUCHES) == 1) {
                LiSendMouseButtonEvent(BUTTON_ACTION_PRESS, BUTTON_LEFT);
            }
            return true;
        }

        case PP_INPUTEVENT_TYPE_TOUCHCANCEL:
        case PP_INPUTEVENT_TYPE_TOUCHEND: {
            pp::TouchInputEvent touchEvent(event);

            if (touchEvent.GetTouchCount(PP_TOUCHLIST_TYPE_TARGETTOUCHES) == 1) {
                LiSendMouseButtonEvent(BUTTON_ACTION_RELEASE, BUTTON_LEFT);
                m_LastTouchUpTime = event.GetTimeStamp();
                m_LastTouchUpPoint = touchEvent.GetTouchByIndex(PP_TOUCHLIST_TYPE_TARGETTOUCHES, 0).position();
            }
            return true;
        }
        
        default: {
            return false;
        }
    }
}
