#include "moonlight.hpp"

#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>

#define INITIAL_DECODE_BUFFER_LEN 128 * 1024

static unsigned char* s_DecodeBuffer;
static unsigned int s_DecodeBufferLength;

#define assertNoGLError() assert(!g_Instance->m_GlesApi->GetError(g_Instance->m_Graphics3D->pp_resource()))

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
    
void MoonlightInstance::DidChangeView(const pp::Rect& position,
                                      const pp::Rect& clip) {
                                          
    if (position.width() == 0 || position.height() == 0) {
        return;
    }
    if (m_ViewSize.width()) {
        assert(position.size() == m_ViewSize);
        return;
    }
                                          
    m_ViewSize = position.size();
    printf("View size: %dx%d\n", m_ViewSize.width(), m_ViewSize.height());
    
    int32_t contextAttributes[] = {
        PP_GRAPHICS3DATTRIB_ALPHA_SIZE,     8,
        PP_GRAPHICS3DATTRIB_BLUE_SIZE,      8,
        PP_GRAPHICS3DATTRIB_GREEN_SIZE,     8,
        PP_GRAPHICS3DATTRIB_RED_SIZE,       8,
        PP_GRAPHICS3DATTRIB_DEPTH_SIZE,     0,
        PP_GRAPHICS3DATTRIB_STENCIL_SIZE,   0,
        PP_GRAPHICS3DATTRIB_SAMPLES,        0,
        PP_GRAPHICS3DATTRIB_SAMPLE_BUFFERS, 0,
        PP_GRAPHICS3DATTRIB_WIDTH,          g_Instance->m_ViewSize.width(),
        PP_GRAPHICS3DATTRIB_HEIGHT,         g_Instance->m_ViewSize.height(),
        PP_GRAPHICS3DATTRIB_NONE,
    };
    g_Instance->m_Graphics3D = new pp::Graphics3D(g_Instance, contextAttributes);
    assert(!g_Instance->m_Graphics3D->is_null());
    
    assert(BindGraphics(*m_Graphics3D));
    
    PP_Resource graphics3D = g_Instance->m_Graphics3D->pp_resource();
    
    g_Instance->m_GlesApi->ClearColor(graphics3D, 1, 0, 0, 1);
    g_Instance->m_GlesApi->Clear(graphics3D, GL_COLOR_BUFFER_BIT);
    
    assertNoGLError();
    
    static const float k_Vertices[] = {
        -1, -1, -1, 1, 1, -1, 1, 1,  // Position coordinates.
        0,  1,  0,  0, 1, 1,  1, 0,  // Texture coordinates.
    };

    GLuint buffer;
    g_Instance->m_GlesApi->GenBuffers(graphics3D, 1, &buffer);
    g_Instance->m_GlesApi->BindBuffer(graphics3D, GL_ARRAY_BUFFER, buffer);

    g_Instance->m_GlesApi->BufferData(graphics3D,
                                      GL_ARRAY_BUFFER,
                                      sizeof(k_Vertices),
                                      k_Vertices,
                                      GL_STATIC_DRAW);
    assertNoGLError();
}

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
    
    PP_Resource graphics3D = g_Instance->m_Graphics3D->pp_resource();
    if (g_Instance->m_Texture2DShader.program) {
        g_Instance->m_GlesApi->DeleteProgram(graphics3D, g_Instance->m_Texture2DShader.program);
    }
    if (g_Instance->m_RectangleArbShader.program) {
        g_Instance->m_GlesApi->DeleteProgram(graphics3D, g_Instance->m_RectangleArbShader.program);
    }
    if (g_Instance->m_ExternalOesShader.program) {
        g_Instance->m_GlesApi->DeleteProgram(graphics3D, g_Instance->m_ExternalOesShader.program);
    }
    
    delete g_Instance->m_Graphics3D;
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

void MoonlightInstance::CreateShader(GLuint program, GLenum type,
                                     const char* source, int size) {
    PP_Resource graphics3D = g_Instance->m_Graphics3D->pp_resource();
    GLuint shader = g_Instance->m_GlesApi->CreateShader(graphics3D, type);
    g_Instance->m_GlesApi->ShaderSource(graphics3D, shader, 1, &source, &size);
    g_Instance->m_GlesApi->CompileShader(graphics3D, shader);
    g_Instance->m_GlesApi->AttachShader(graphics3D, program, shader);
    g_Instance->m_GlesApi->DeleteShader(graphics3D, shader);
}

Shader MoonlightInstance::CreateProgram(const char* vertexShader, const char* fragmentShader) {
    Shader shader;
    PP_Resource graphics3D = g_Instance->m_Graphics3D->pp_resource();
    
    shader.program = g_Instance->m_GlesApi->CreateProgram(graphics3D);
    CreateShader(shader.program, GL_VERTEX_SHADER, vertexShader, strlen(vertexShader));
    CreateShader(shader.program, GL_FRAGMENT_SHADER, fragmentShader, strlen(fragmentShader));
    g_Instance->m_GlesApi->LinkProgram(graphics3D, shader.program);
    g_Instance->m_GlesApi->UseProgram(graphics3D, shader.program);
    
    g_Instance->m_GlesApi->Uniform1i(graphics3D,
        g_Instance->m_GlesApi->GetUniformLocation(graphics3D, shader.program, "s_texture"), 0);
    assertNoGLError();
    
    shader.texcoord_scale_location = g_Instance->m_GlesApi->GetUniformLocation(graphics3D, shader.program, "v_scale");
    
    GLint pos_location = g_Instance->m_GlesApi->GetAttribLocation(graphics3D, shader.program, "a_position");
    GLint tc_location = g_Instance->m_GlesApi->GetAttribLocation(graphics3D, shader.program, "a_texCoord");
    assertNoGLError();
    
    g_Instance->m_GlesApi->EnableVertexAttribArray(graphics3D, pos_location);
    g_Instance->m_GlesApi->VertexAttribPointer(graphics3D, pos_location, 2, GL_FLOAT, GL_FALSE, 0, 0);
    g_Instance->m_GlesApi->EnableVertexAttribArray(graphics3D, tc_location);
    g_Instance->m_GlesApi->VertexAttribPointer(graphics3D, tc_location, 2, GL_FLOAT, GL_FALSE, 0, static_cast<float*>(0) + 8);
    
    g_Instance->m_GlesApi->UseProgram(graphics3D, 0);
    assertNoGLError();
    return shader;
}

void MoonlightInstance::PaintPicture(PP_VideoPicture picture) {
    PP_Resource graphics3D = g_Instance->m_Graphics3D->pp_resource();
    
    if (picture.texture_target == GL_TEXTURE_2D) {
        if (!g_Instance->m_Texture2DShader.program) {
            g_Instance->m_Texture2DShader = CreateProgram(k_VertexShader, k_FragmentShader2D);
        }
        g_Instance->m_GlesApi->UseProgram(graphics3D, g_Instance->m_Texture2DShader.program);
        g_Instance->m_GlesApi->Uniform2f(graphics3D, g_Instance->m_Texture2DShader.texcoord_scale_location,
                                         1.0, 1.0);
    }
    else if (picture.texture_target == GL_TEXTURE_RECTANGLE_ARB) {
        if (!g_Instance->m_RectangleArbShader.program) {
            g_Instance->m_RectangleArbShader = CreateProgram(k_VertexShader, k_FragmentShaderRectangle);
        }
        g_Instance->m_GlesApi->UseProgram(graphics3D, g_Instance->m_RectangleArbShader.program);
        g_Instance->m_GlesApi->Uniform2f(graphics3D, g_Instance->m_RectangleArbShader.texcoord_scale_location,
                                         picture.texture_size.width, picture.texture_size.height);
    }
    else {
        if (!g_Instance->m_ExternalOesShader.program) {
            g_Instance->m_ExternalOesShader = CreateProgram(k_VertexShader, k_FragmentShaderExternal);
        }
        g_Instance->m_GlesApi->UseProgram(graphics3D, g_Instance->m_ExternalOesShader.program);
        g_Instance->m_GlesApi->Uniform2f(graphics3D, g_Instance->m_ExternalOesShader.texcoord_scale_location,
                                         1.0, 1.0);
    }
    
    g_Instance->m_GlesApi->Viewport(graphics3D, 0, 0, g_Instance->m_ViewSize.width(), g_Instance->m_ViewSize.height());
    g_Instance->m_GlesApi->ActiveTexture(graphics3D, GL_TEXTURE0);
    g_Instance->m_GlesApi->BindTexture(graphics3D, picture.texture_target, picture.texture_id);
    g_Instance->m_GlesApi->DrawArrays(graphics3D, GL_TRIANGLE_STRIP, 0, 4);
    g_Instance->m_GlesApi->UseProgram(graphics3D, 0);
    
    g_Instance->m_Graphics3D->SwapBuffers(pp::BlockUntilComplete());
}

void MoonlightInstance::PictureReady(int32_t result, PP_VideoPicture picture) {
    if (result == PP_ERROR_ABORTED) {
        return;
    }
    
    // Paint the image on screen
    PaintPicture(picture);
    
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