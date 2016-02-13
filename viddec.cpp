#include "moonlight.hpp"

#define INITIAL_DECODE_BUFFER_LEN 128 * 1024

static unsigned char* s_DecodeBuffer;
static unsigned int s_DecodeBufferLength;

void MoonlightInstance::VidDecSetup(int width, int height, int redrawRate, void* context, int drFlags) {
    g_Instance->m_VideoDecoder = new pp::VideoDecoder(g_Instance);
    
    s_DecodeBufferLength = INITIAL_DECODE_BUFFER_LEN;
    s_DecodeBuffer = (unsigned char *)malloc(s_DecodeBufferLength);
    
    g_Instance->m_VideoDecoder->Initialize(*g_Instance->m_Graphics3D,
                                           PP_VIDEOPROFILE_H264HIGH,
                                           PP_HARDWAREACCELERATION_ONLY,
                                           0,
                                           pp::BlockUntilComplete());
    
    pp::Module::Get()->core()->CallOnMainThread(0,
        g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::DispatchGetPicture));
}

void MoonlightInstance::DispatchGetPicture(uint32_t unused) {
    // Queue the initial GetPicture callback on the main thread
    g_Instance->m_VideoDecoder->GetPicture(
        g_Instance->m_CallbackFactory.NewCallbackWithOutput(&MoonlightInstance::PictureReady));
}

void MoonlightInstance::VidDecCleanup(void) {
    free(s_DecodeBuffer);
    delete g_Instance->m_VideoDecoder;
}

int MoonlightInstance::VidDecSubmitDecodeUnit(PDECODE_UNIT decodeUnit) {
    PLENTRY entry;
    unsigned int offset;
    
    // Resize the decode buffer if needed
    if (decodeUnit->fullLength > s_DecodeBufferLength) {
        free(s_DecodeBuffer);
        s_DecodeBufferLength = decodeUnit->fullLength;
        s_DecodeBuffer = (unsigned char *)malloc(s_DecodeBufferLength);
    }
    
    entry = decodeUnit->bufferList;
    offset = 0;
    while (entry != NULL) {
        memcpy(&s_DecodeBuffer[offset], entry->data, entry->length);
        offset += entry->length;
        
        entry = entry->next;
    }
    
    // Start the decoding
    g_Instance->m_VideoDecoder->Decode(0, offset, s_DecodeBuffer, pp::BlockUntilComplete());
    
    return DR_OK;
}

void MoonlightInstance::PictureReady(int32_t result, PP_VideoPicture picture) {
    if (result == PP_ERROR_ABORTED) {
        return;
    }
    
    // FIXME: Draw video
    
    g_Instance->m_VideoDecoder->RecyclePicture(picture);
    
    // Queue another callback
    g_Instance->m_VideoDecoder->GetPicture(
        g_Instance->m_CallbackFactory.NewCallbackWithOutput(&MoonlightInstance::PictureReady));
}

DECODER_RENDERER_CALLBACKS MoonlightInstance::s_DrCallbacks = {
    MoonlightInstance::VidDecSetup,
    MoonlightInstance::VidDecCleanup,
    MoonlightInstance::VidDecSubmitDecodeUnit
};