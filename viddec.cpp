#include "moonlight.hpp"

#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>

#include "ppapi/lib/gl/gles2/gl2ext_ppapi.h"

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
    
    if (!glInitializePPAPI(pp::Module::Get()->get_browser_interface())) {
        return;
    }
    
    int32_t contextAttributes[] = {
      PP_GRAPHICS3DATTRIB_ALPHA_SIZE, 8,
      PP_GRAPHICS3DATTRIB_DEPTH_SIZE, 24,
      PP_GRAPHICS3DATTRIB_WIDTH, position.size().width(),
      PP_GRAPHICS3DATTRIB_HEIGHT, position.size().height(),
      PP_GRAPHICS3DATTRIB_NONE
    };
    g_Instance->m_Graphics3D = pp::Graphics3D(this, contextAttributes);
    
    if (!BindGraphics(m_Graphics3D)) {
      fprintf(stderr, "Unable to bind 3d context!\n");
      m_Graphics3D = pp::Graphics3D();
      glSetCurrentContextPPAPI(0);
      return;
    }
    
    glSetCurrentContextPPAPI(m_Graphics3D.pp_resource());
    
    glClearColor(1.0f, 0.0f, 0.0f, 1.0f);
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
    
    g_Instance->m_Graphics3D.SwapBuffers(g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::DispatchRendering));
}

void MoonlightInstance::VidDecSetup(int width, int height, int redrawRate, void* context, int drFlags) {
    g_Instance->m_VideoDecoder = new pp::VideoDecoder(g_Instance);
    
    s_DecodeBufferLength = INITIAL_DECODE_BUFFER_LEN;
    s_DecodeBuffer = (unsigned char *)malloc(s_DecodeBufferLength);
    
    g_Instance->m_VideoDecoder->Initialize(g_Instance->m_Graphics3D,
                                           PP_VIDEOPROFILE_H264HIGH,
                                           PP_HARDWAREACCELERATION_ONLY,
                                           0,
                                           pp::BlockUntilComplete());
    
    pp::Module::Get()->core()->CallOnMainThread(0,
        g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::DispatchGetPicture));
}

void MoonlightInstance::DispatchGetPicture(uint32_t unused) {
    /*glClearColor(0.5, 0.5, 0.5, 1);
    glClear(GL_COLOR_BUFFER_BIT);
    
    m_Graphics3D.SwapBuffers(
        m_CallbackFactory.NewCallback(&MoonlightInstance::DispatchGetPicture));*/
    
    // Queue the initial GetPicture callback on the main thread
    g_Instance->m_VideoDecoder->GetPicture(
        g_Instance->m_CallbackFactory.NewCallbackWithOutput(&MoonlightInstance::PictureReady));
}

void MoonlightInstance::VidDecCleanup(void) {
    free(s_DecodeBuffer);
    delete g_Instance->m_VideoDecoder;
    
    if (g_Instance->m_Texture2DShader.program) {
        glDeleteProgram(g_Instance->m_Texture2DShader.program);
    }
    if (g_Instance->m_RectangleArbShader.program) {
        glDeleteProgram(g_Instance->m_RectangleArbShader.program);
    }
    if (g_Instance->m_ExternalOesShader.program) {
        glDeleteProgram(g_Instance->m_ExternalOesShader.program);
    }
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

void MoonlightInstance::PaintPicture(PP_VideoPicture picture) {
    if (picture.texture_target == GL_TEXTURE_2D) {
        if (!g_Instance->m_Texture2DShader.program) {
            g_Instance->m_Texture2DShader = CreateProgram(k_VertexShader, k_FragmentShader2D);
        }
        glUseProgram(g_Instance->m_Texture2DShader.program);
        glUniform2f(g_Instance->m_Texture2DShader.texcoord_scale_location, 1.0, 1.0);
    }
    else if (picture.texture_target == GL_TEXTURE_RECTANGLE_ARB) {
        if (!g_Instance->m_RectangleArbShader.program) {
            g_Instance->m_RectangleArbShader = CreateProgram(k_VertexShader, k_FragmentShaderRectangle);
        }
        glUseProgram(g_Instance->m_RectangleArbShader.program);
        glUniform2f(g_Instance->m_RectangleArbShader.texcoord_scale_location,
                    picture.texture_size.width, picture.texture_size.height);
    }
    else if (picture.texture_target == GL_TEXTURE_EXTERNAL_OES){
        if (!g_Instance->m_ExternalOesShader.program) {
            g_Instance->m_ExternalOesShader = CreateProgram(k_VertexShader, k_FragmentShaderExternal);
        }
        glUseProgram(g_Instance->m_ExternalOesShader.program);
        glUniform2f(g_Instance->m_ExternalOesShader.texcoord_scale_location, 1.0, 1.0);
    }
    
    if (picture.texture_target != 0) {
        glViewport(0, 0, g_Instance->m_ViewSize.width(), g_Instance->m_ViewSize.height());
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(picture.texture_target, picture.texture_id);
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
        glUseProgram(0);
    }
    
    g_Instance->m_Graphics3D.SwapBuffers(g_Instance->m_CallbackFactory.NewCallback(&MoonlightInstance::DispatchRendering));
}

void MoonlightInstance::DispatchRendering(int32_t unused) {
    // Paint the image on screen
    PaintPicture(m_LastPicture);
}

void MoonlightInstance::PictureReady(int32_t result, PP_VideoPicture picture) {
    if (result == PP_ERROR_ABORTED) {
        return;
    }
    
    // Replace the last picture with this one and free the old one
    PP_VideoPicture oldPic = m_LastPicture;
    m_LastPicture = picture;
    if (oldPic.texture_target) {
        g_Instance->m_VideoDecoder->RecyclePicture(oldPic);
    }
    
    // Queue another callback
    g_Instance->m_VideoDecoder->GetPicture(
        g_Instance->m_CallbackFactory.NewCallbackWithOutput(&MoonlightInstance::PictureReady));
}

DECODER_RENDERER_CALLBACKS MoonlightInstance::s_DrCallbacks = {
    MoonlightInstance::VidDecSetup,
    MoonlightInstance::VidDecCleanup,
    MoonlightInstance::VidDecSubmitDecodeUnit
};