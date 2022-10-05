#include "moonlight.hpp"

#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>

#include "ppapi/lib/gl/gles2/gl2ext_ppapi.h"

#include <h264_stream.h>

#define INITIAL_DECODE_BUFFER_LEN 128 * 1024

static unsigned char* s_DecodeBuffer;
static unsigned int s_DecodeBufferLength;
static int s_LastTextureType;
static int s_LastTextureId;
static bool s_FirstFrameDisplayed;
static uint64_t s_LastPaintFinishedTime;

#define assertNoGLError() assert(!glGetError())

static const char k_VertexShader[] =
    "varying vec2 v_texCoord;            \n"
    "attribute vec4 a_position;          \n"
    "attribute vec2 a_texCoord;          \n"
    "uniform vec2 v_scale;               \n"
    "void main()                         \n"
    "{                                   \n"
    "    v_texCoord = v_scale * a_texCoord; \n"
    "    gl_Position = a_position;       \n"
    "}";

static const char k_FragmentShader2D[] =
    "precision mediump float;            \n"
    "varying vec2 v_texCoord;            \n"
    "uniform sampler2D s_texture;        \n"
    "void main()                         \n"
    "{"
    "    gl_FragColor = texture2D(s_texture, v_texCoord); \n"
    "}";
    
static const char k_FragmentShaderRectangle[] =
    "#extension GL_ARB_texture_rectangle : require\n"
    "precision mediump float;            \n"
    "varying vec2 v_texCoord;            \n"
    "uniform sampler2DRect s_texture;    \n"
    "void main()                         \n"
    "{"
    "    gl_FragColor = texture2DRect(s_texture, v_texCoord).rgba; \n"
    "}";
    
static const char k_FragmentShaderExternal[] =
      "#extension GL_OES_EGL_image_external : require\n"
      "precision mediump float;            \n"
      "varying vec2 v_texCoord;            \n"
      "uniform samplerExternalOES s_texture; \n"
      "void main()                         \n"
      "{"
      "    gl_FragColor = texture2D(s_texture, v_texCoord); \n"
      "}";

void MoonlightInstance::DidChangeFocus(bool got_focus) {
    // Request an IDR frame to dump the frame queue that may have
    // built up from the GL pipeline being stalled.
    if (got_focus) {
        LiRequestIdrFrame();
    }
}

void MoonlightInstance::DidChangeView(const pp::View& view) {
    m_PluginRect = view.GetRect();
}

bool MoonlightInstance::InitializeRenderingSurface(int width, int height) {
    if (!glInitializePPAPI(pp::Module::Get()->get_browser_interface())) {
        return false;
    }
    
    int32_t contextAttributes[] = {
        PP_GRAPHICS3DATTRIB_ALPHA_SIZE,     8,
        PP_GRAPHICS3DATTRIB_BLUE_SIZE,      8,
        PP_GRAPHICS3DATTRIB_GREEN_SIZE,     8,
        PP_GRAPHICS3DATTRIB_RED_SIZE,       8,
        PP_GRAPHICS3DATTRIB_DEPTH_SIZE,     0,
        PP_GRAPHICS3DATTRIB_STENCIL_SIZE,   0,
        PP_GRAPHICS3DATTRIB_SAMPLES,        0,
        PP_GRAPHICS3DATTRIB_SAMPLE_BUFFERS, 0,
        PP_GRAPHICS3DATTRIB_WIDTH,          width,
        PP_GRAPHICS3DATTRIB_HEIGHT,         height,
        PP_GRAPHICS3DATTRIB_NONE
    };
    g_Instance->m_Graphics3D = pp::Graphics3D(this, contextAttributes);
    if (g_Instance->m_Graphics3D.is_null()) {
        ClDisplayMessage("Unable to create OpenGL context");
        return false;
    }
    
    int32_t swapBehaviorAttribute[] = {
        PP_GRAPHICS3DATTRIB_SWAP_BEHAVIOR, PP_GRAPHICS3DATTRIB_BUFFER_DESTROYED,
        PP_GRAPHICS3DATTRIB_NONE
    };
    g_Instance->m_Graphics3D.SetAttribs(swapBehaviorAttribute);
    
    if (!BindGraphics(m_Graphics3D)) {
      ClDisplayMessage("Unable to bind OpenGL context");
      m_Graphics3D = pp::Graphics3D();
      glSetCurrentContextPPAPI(0);
      return false;
    }
    
    glSetCurrentContextPPAPI(m_Graphics3D.pp_resource());
    
    glDisable(GL_DITHER);
    
    glViewport(0, 0, width, height);
    
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);
    
    assertNoGLError();
    
    static const float k_Vertices[] = {
        -1, -1, -1, 1, 1, -1, 1, 1,  // Position coordinates.
        0,  1,  0,  0, 1, 1,  1, 0,  // Texture coordinates.
    };

    GLuint buffer;
    glGenBuffers(1, &buffer);
    glBindBuffer(GL_ARRAY_BUFFER, buffer);

    glBufferData(GL_ARRAY_BUFFER,
                 sizeof(k_Vertices),
                 k_Vertices,
                 GL_STATIC_DRAW);
    assertNoGLError();
    
    g_Instance->m_Graphics3D.SwapBuffers(pp::BlockUntilComplete());
    return true;
}

int MoonlightInstance::VidDecSetup(int videoFormat, int width, int height, int redrawRate, void* context, int drFlags) {
    g_Instance->m_VideoDecoder = new pp::VideoDecoder(g_Instance);
    
    s_DecodeBufferLength = INITIAL_DECODE_BUFFER_LEN;
    s_DecodeBuffer = (unsigned char *)malloc(s_DecodeBufferLength);
    s_LastTextureType = 0;
    s_LastTextureId = 0;
    s_FirstFrameDisplayed = false;
    
    int32_t err;

    if (!(drFlags & DR_FLAG_FORCE_SW_DECODE)) {
        // Try to initialize hardware decoding only
        err = g_Instance->m_VideoDecoder->Initialize(
           g_Instance->m_Graphics3D,
           PP_VIDEOPROFILE_H264HIGH,
           PP_HARDWAREACCELERATION_ONLY,
           0,
           pp::BlockUntilComplete());
    }
    else {
        err = PP_ERROR_NOTSUPPORTED;
    }

    if (err == PP_ERROR_NOTSUPPORTED) {
        // Fallback to software decoding
        err = g_Instance->m_VideoDecoder->Initialize(
           g_Instance->m_Graphics3D,
           PP_VIDEOPROFILE_H264HIGH,
           PP_HARDWAREACCELERATION_NONE,
           0,
           pp::BlockUntilComplete());

        if (err == PP_ERROR_NOTSUPPORTED) {
            // No decoders available at all. We can't continue.
            ClDisplayMessage("No hardware or software H.264 decoders available!");
            g_Instance->StopConnection();
            return -1;
        }
        else if (!(drFlags & DR_FLAG_FORCE_SW_DECODE)) {
            // Tell the user we had to fall back
            ClDisplayTransientMessage("Hardware decoding is unavailable. Falling back to CPU decoding");
        }
    }
    
    pp::Module::Get()->core()->CallOnMainThread(0,
        g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::DispatchGetPicture));
    
    return 0;
}

void MoonlightInstance::DispatchGetPicture(uint32_t unused) {
    // Queue the initial GetPicture callback on the main thread
    g_Instance->m_VideoDecoder->GetPicture(
        g_Instance->m_CallbackFactory.NewCallbackWithOutput(&MoonlightInstance::PictureReady));
}

void MoonlightInstance::VidDecCleanup(void) {
    free(s_DecodeBuffer);
    
    // Delete the decoder
    delete g_Instance->m_VideoDecoder;
    
    // Delete shader programs
    if (g_Instance->m_Texture2DShader.program) {
        glDeleteProgram(g_Instance->m_Texture2DShader.program);
        g_Instance->m_Texture2DShader.program = 0;
    }
    if (g_Instance->m_RectangleArbShader.program) {
        glDeleteProgram(g_Instance->m_RectangleArbShader.program);
        g_Instance->m_RectangleArbShader.program = 0;
    }
    if (g_Instance->m_ExternalOesShader.program) {
        glDeleteProgram(g_Instance->m_ExternalOesShader.program);
        g_Instance->m_ExternalOesShader.program = 0;
    }
    
    // Unbind graphics device by binding a default constructed object
    glSetCurrentContextPPAPI(0);
    g_Instance->m_Graphics3D = pp::Graphics3D();
    g_Instance->BindGraphics(g_Instance->m_Graphics3D);
}

static void WriteSpsNalu(PLENTRY nalu, unsigned char* outBuffer, unsigned int* offset) {
    int start_len = nalu->data[2] == 0x01 ? 3 : 4;
    h264_stream_t* stream = h264_new();
    
    // Read the old NALU
    read_nal_unit(stream,
                  (unsigned char *)&nalu->data[start_len],
                  nalu->length - start_len);
    
    // Fixup the SPS to what OS X needs to use hardware acceleration
    stream->sps->num_ref_frames = 1;
    stream->sps->vui.max_dec_frame_buffering = 1;
    
    // Copy the NALU prefix over from the original SPS
    memcpy(&outBuffer[*offset], nalu->data, start_len);
    *offset += start_len;
    
    // Copy the modified NALU data
    *offset += write_nal_unit(stream, &outBuffer[*offset], nalu->length + 32 - start_len);
    
    h264_free(stream);
}

int MoonlightInstance::VidDecSubmitDecodeUnit(PDECODE_UNIT decodeUnit) {
    PLENTRY entry;
    unsigned int offset;
    unsigned int totalLength;

    totalLength = decodeUnit->fullLength;
    if (decodeUnit->frameType == FRAME_TYPE_IDR) {
        // Add some extra space for the SPS fixup
        totalLength += 32;
    }
    
    // Resize the decode buffer if needed
    if (totalLength > s_DecodeBufferLength) {
        free(s_DecodeBuffer);
        s_DecodeBufferLength = totalLength;
        s_DecodeBuffer = (unsigned char *)malloc(s_DecodeBufferLength);
    }
    
    entry = decodeUnit->bufferList;
    offset = 0;
    while (entry != NULL) {
        if (entry->bufferType == BUFFER_TYPE_SPS) {
            // Write the SPS with required fixups and update offset
            WriteSpsNalu(entry, s_DecodeBuffer, &offset);
        }
        else {
            memcpy(&s_DecodeBuffer[offset], entry->data, entry->length);
            offset += entry->length;
        }
        
        entry = entry->next;
    }
    
    // Start the decoding
    uint32_t packedMillis = ProfilerGetPackedMillis();
    g_Instance->m_VideoDecoder->Decode(packedMillis, offset, s_DecodeBuffer, pp::BlockUntilComplete());
    ProfilerPrintPackedDeltaFromNow("Decode (blocking)", packedMillis);
    
    return DR_OK;
}

void MoonlightInstance::CreateShader(GLuint program, GLenum type,
                                     const char* source, int size) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, &size);
    glCompileShader(shader);
    glAttachShader(program, shader);
    glDeleteShader(shader);
}

Shader MoonlightInstance::CreateProgram(const char* vertexShader, const char* fragmentShader) {
    Shader shader;
    
    shader.program = glCreateProgram();
    CreateShader(shader.program, GL_VERTEX_SHADER, vertexShader, strlen(vertexShader));
    CreateShader(shader.program, GL_FRAGMENT_SHADER, fragmentShader, strlen(fragmentShader));
    glLinkProgram(shader.program);
    glUseProgram(shader.program);
    
    glUniform1i(glGetUniformLocation(shader.program, "s_texture"), 0);
    assertNoGLError();
    
    shader.texcoord_scale_location = glGetUniformLocation(shader.program, "v_scale");
    
    GLint pos_location = glGetAttribLocation(shader.program, "a_position");
    GLint tc_location = glGetAttribLocation(shader.program, "a_texCoord");
    assertNoGLError();
    
    glEnableVertexAttribArray( pos_location);
    glVertexAttribPointer(pos_location, 2, GL_FLOAT, GL_FALSE, 0, 0);
    glEnableVertexAttribArray(tc_location);
    glVertexAttribPointer(tc_location, 2, GL_FLOAT, GL_FALSE, 0, static_cast<float*>(0) + 8);
    
    glUseProgram(0);
    assertNoGLError();
    return shader;
}

void MoonlightInstance::PaintPicture(void) {
    m_IsPainting = true;
    
    // Take the next picture into our ownership
    m_CurrentPicture = m_NextPicture;
    m_HasNextPicture = false;
    
    // Recycle bogus pictures immediately
    if (m_CurrentPicture.texture_target == 0) {
        m_VideoDecoder->RecyclePicture(m_CurrentPicture);
        m_IsPainting = false;
        return;
    }
    
    // Calling glClear() once per frame is recommended for modern
    // GPUs which use it for state tracking hints.
    glClear(GL_COLOR_BUFFER_BIT);
    
    int originalTextureTarget = s_LastTextureType;
    
    // Only make these state changes if we've changed from the last texture type
    if (m_CurrentPicture.texture_target != s_LastTextureType) {
        if (m_CurrentPicture.texture_target == GL_TEXTURE_2D) {
            if (!g_Instance->m_Texture2DShader.program) {
                g_Instance->m_Texture2DShader = CreateProgram(k_VertexShader, k_FragmentShader2D);
            }
            glUseProgram(g_Instance->m_Texture2DShader.program);
            glUniform2f(g_Instance->m_Texture2DShader.texcoord_scale_location, 1.0, 1.0);
        }
        else if (m_CurrentPicture.texture_target == GL_TEXTURE_RECTANGLE_ARB) {
            if (!g_Instance->m_RectangleArbShader.program) {
                g_Instance->m_RectangleArbShader = CreateProgram(k_VertexShader, k_FragmentShaderRectangle);
            }
            glUseProgram(g_Instance->m_RectangleArbShader.program);
            glUniform2f(g_Instance->m_RectangleArbShader.texcoord_scale_location,
                        m_CurrentPicture.texture_size.width, m_CurrentPicture.texture_size.height);
        }
        else if (m_CurrentPicture.texture_target == GL_TEXTURE_EXTERNAL_OES) {
            if (!g_Instance->m_ExternalOesShader.program) {
                g_Instance->m_ExternalOesShader = CreateProgram(k_VertexShader, k_FragmentShaderExternal);
            }
            glUseProgram(g_Instance->m_ExternalOesShader.program);
            glUniform2f(g_Instance->m_ExternalOesShader.texcoord_scale_location, 1.0, 1.0);
        }

        glActiveTexture(GL_TEXTURE0);

        s_LastTextureType = m_CurrentPicture.texture_target;
    }
    
    // Only rebind our texture if we've changed since last time
    if (m_CurrentPicture.texture_id != s_LastTextureId || m_CurrentPicture.texture_target != originalTextureTarget) {
        glBindTexture(m_CurrentPicture.texture_target, m_CurrentPicture.texture_id);
        s_LastTextureId = m_CurrentPicture.texture_id;
    }
    
    // Draw the image
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    
    // Swap buffers
    m_Graphics3D.SwapBuffers(
        m_CallbackFactory.NewCallback(&MoonlightInstance::PaintFinished));
}

void MoonlightInstance::PaintFinished(int32_t result) {
    m_IsPainting = false;

    if (!s_FirstFrameDisplayed) {
        // Tell the JS code to display the video stream now
        pp::Var response("displayVideo");
        g_Instance->PostMessage(response);
        s_FirstFrameDisplayed = true;
    }
    
    ProfilerPrintDeltaFromNow("Paint -> Paint", s_LastPaintFinishedTime);
    s_LastPaintFinishedTime = ProfilerGetMillis();
    
    // Recycle the picture now that it's been painted
    uint64_t millis = ProfilerGetMillis();
    m_VideoDecoder->RecyclePicture(m_CurrentPicture);
    ProfilerPrintDeltaFromNow("RecyclePicture (PaintFinished)", millis);
    
    // Keep painting if we still have frames
    if (m_HasNextPicture) {
        PaintPicture();
    }
}

void MoonlightInstance::PictureReady(int32_t result, PP_VideoPicture picture) {
    if (result == PP_ERROR_ABORTED) {
        return;
    }
    
    ProfilerPrintPackedDeltaFromNow("Decode -> PictureReady", picture.decode_id);
    
    // Free a picture if there's one the renderer hasn't consumed yet
    if (m_HasNextPicture) {
        ProfilerPrintWarning("Decoder is outpacing renderer!");
        uint64_t millis = ProfilerGetMillis();
        m_VideoDecoder->RecyclePicture(m_NextPicture);
        ProfilerPrintDeltaFromNow("RecyclePicture (PictureReady)", millis);
    }
    
    // Put the latest picture in the slot for rendering next
    m_NextPicture = picture;
    m_HasNextPicture = true;
    
    // Queue another call to get another picture
    g_Instance->m_VideoDecoder->GetPicture(
        g_Instance->m_CallbackFactory.NewCallbackWithOutput(&MoonlightInstance::PictureReady));
    
    // Start painting if we aren't now
    if (!m_IsPainting) {
        PaintPicture();
    }
}

DECODER_RENDERER_CALLBACKS MoonlightInstance::s_DrCallbacks = {
    .setup = MoonlightInstance::VidDecSetup,
    .cleanup = MoonlightInstance::VidDecCleanup,
    .submitDecodeUnit = MoonlightInstance::VidDecSubmitDecodeUnit,
    .capabilities = CAPABILITY_SLICES_PER_FRAME(4)
};
