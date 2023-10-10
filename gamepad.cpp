#include "moonlight.hpp"

#include "ppapi/c/ppb_gamepad.h"

#include <Limelight.h>

#include <sstream>

static const unsigned short k_StandardGamepadButtonMapping[] = {
    A_FLAG, B_FLAG, X_FLAG, Y_FLAG,
    LB_FLAG, RB_FLAG,
    0, 0, // Triggers
    BACK_FLAG, PLAY_FLAG,
    LS_CLK_FLAG, RS_CLK_FLAG,
    UP_FLAG, DOWN_FLAG, LEFT_FLAG, RIGHT_FLAG,
    SPECIAL_FLAG
};

static const unsigned int k_StandardGamepadTriggerButtonIndexes[] = {
    6, 7
};

static short GetActiveGamepadMask(PP_GamepadsSampleData& gamepadData) {
    short controllerIndex = 0;
    short activeGamepadMask = 0;

    for (unsigned int p = 0; p < gamepadData.length; p++) {
        PP_GamepadSampleData& padData = gamepadData.items[p];

        // See logic in getConnectedGamepadMask() (utils.js)
        // These must stay in sync!

        if (!padData.connected) {
            // Not connected
            continue;
        }
        
        if (padData.timestamp == 0) {
            // On some platforms, Chrome returns "connected" pads that
            // really aren't, so timestamp stays at zero. To work around this,
            // we'll only count gamepads that have a non-zero timestamp in our
            // controller index.
            continue;
        }

        activeGamepadMask |= (1 << controllerIndex);
        controllerIndex++;
    }

    return activeGamepadMask;
}

void MoonlightInstance::PollGamepads() {
    PP_GamepadsSampleData gamepadData;
    short controllerIndex = 0;
    short activeGamepadMask;
    
    m_GamepadApi->Sample(pp_instance(), &gamepadData);

    // We must determine which gamepads are connected before reporting
    // any events.
    activeGamepadMask = GetActiveGamepadMask(gamepadData);

    for (unsigned int p = 0; p < gamepadData.length; p++) {
        PP_GamepadSampleData& padData = gamepadData.items[p];
        
        if (!padData.connected) {
            // Not connected
            continue;
        }
        
        if (padData.timestamp == 0) {
            // On some platforms, Chrome returns "connected" pads that
            // really aren't, so timestamp stays at zero. To work around this,
            // we'll only count gamepads that have a non-zero timestamp in our
            // controller index.
            continue;
        }
        
        if (padData.timestamp == m_LastPadTimestamps[p]) {
            // No change from last poll, but this controller is still valid
            // so we skip this index.
            controllerIndex++;
            continue;
        }
        
        m_LastPadTimestamps[p] = padData.timestamp;
        
        int buttonFlags = 0;
        unsigned char leftTrigger = 0, rightTrigger = 0;
        short leftStickX = 0, leftStickY = 0;
        short rightStickX = 0, rightStickY = 0;
        
        // Handle buttons and triggers
        for (unsigned int i = 0; i < padData.buttons_length; i++) {
            if (i >= sizeof(k_StandardGamepadButtonMapping) / sizeof(k_StandardGamepadButtonMapping[0])) {
                // Ignore unmapped buttons
                break;
            }
            
            // Handle triggers first
            if (i == k_StandardGamepadTriggerButtonIndexes[0]) {
                leftTrigger = padData.buttons[i] * 0xFF;
            }
            else if (i == k_StandardGamepadTriggerButtonIndexes[1]) {
                rightTrigger = padData.buttons[i] * 0xFF;
            }
            // Now normal buttons
            else if (padData.buttons[i] > 0.5f) {
                buttonFlags |= k_StandardGamepadButtonMapping[i];
            }
        }
        
        // Get left stick values
        if (padData.axes_length >= 2) {
            leftStickX = padData.axes[0] * 0x7FFF;
            leftStickY = -padData.axes[1] * 0x7FFF;
        }
        
        // Get right stick values
        if (padData.axes_length >= 4) {
            rightStickX = padData.axes[2] * 0x7FFF;
            rightStickY = -padData.axes[3] * 0x7FFF;
        }
        
        LiSendMultiControllerEvent(controllerIndex, activeGamepadMask,
                                   buttonFlags, leftTrigger, rightTrigger,
                                   leftStickX, leftStickY, rightStickX, rightStickY);
        controllerIndex++;
    }
}

void MoonlightInstance::ClControllerRumble(unsigned short controllerNumber, unsigned short lowFreqMotor, unsigned short highFreqMotor)
{
    const float weakMagnitude = static_cast<float>(highFreqMotor) / static_cast<float>(UINT16_MAX);
    const float strongMagnitude = static_cast<float>(lowFreqMotor) / static_cast<float>(UINT16_MAX);

    std::ostringstream ss;
    ss << controllerNumber << "," << weakMagnitude << "," << strongMagnitude;
    pp::Var response(std::string("controllerRumble: ") + ss.str());
    g_Instance->PostMessage(response);
}