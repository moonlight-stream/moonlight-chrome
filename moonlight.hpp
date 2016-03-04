#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var.h"
#include "ppapi/cpp/mouse_lock.h"
#include "ppapi/cpp/graphics_3d.h"
#include "ppapi/cpp/video_decoder.h"
#include "ppapi/cpp/audio.h"
#include "ppapi/cpp/text_input_controller.h"

#include "ppapi/c/ppb_gamepad.h"
#include "ppapi/c/pp_input_event.h"
#include "ppapi/c/ppb_opengles2.h"
#include "ppapi/cpp/graphics_3d.h"
#include "ppapi/cpp/graphics_3d_client.h"

#include "ppapi/utility/completion_callback_factory.h"

#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>

#include "nacl_io/nacl_io.h"

#include <queue>

#include <Limelight.h>

#include <opus_multistream.h>

struct Shader {
  Shader() : program(0), texcoord_scale_location(0) {}
  ~Shader() {}

  GLuint program;
  GLint texcoord_scale_location;
};

class MoonlightInstance : public pp::Instance, public pp::MouseLock {
    public:
        explicit MoonlightInstance(PP_Instance instance) :
            pp::Instance(instance),
            pp::MouseLock(this),
            m_IsPainting(false),
            m_RequestIdrFrame(false),
            m_OpusDecoder(NULL),
            m_CallbackFactory(this),
            m_MouseLocked(false),
            m_KeyModifiers(0),
            m_WaitingForAllModifiersUp(false),
            m_AccumulatedTicks(0) {
            // This function MUST be used otherwise sockets don't work (nacl_io_init() doesn't work!)            
            nacl_io_init_ppapi(pp_instance(), pp::Module::Get()->get_browser_interface());
            
            LiInitializeStreamConfiguration(&m_StreamConfig);
                
            pp::TextInputController(this).SetTextInputType(PP_TEXTINPUT_TYPE_NONE);
            
            m_GamepadApi = static_cast<const PPB_Gamepad*>(pp::Module::Get()->GetBrowserInterface(PPB_GAMEPAD_INTERFACE));
        }
        
        virtual ~MoonlightInstance();
        
        bool Init(uint32_t argc, const char* argn[], const char* argv[]);
        
        void HandleMessage(const pp::Var& var_message);
        void handlePair(std::string pairMessage);
        void handleShowGames(std::string showGamesMessage);
        void handleStartStream(std::string startStreamMessage);
        void handleStopStream(std::string stopStreamMessage);
        
        void UpdateModifiers(PP_InputEvent_Type eventType, short keyCode);
        bool HandleInputEvent(const pp::InputEvent& event);
        
        void PollGamepads();
        
        void DidLockMouse(int32_t result);
        void MouseLockLost();
        void DidChangeFocus(bool got_focus);
        
        void OnConnectionStopped(uint32_t unused);
        void OnConnectionStarted(uint32_t error);
        void StopConnection();
        
        static void* ConnectionThreadFunc(void* context);
        static void* GamepadThreadFunc(void* context);
        static void* StopThreadFunc(void* context);
        
        static void ClStageStarting(int stage);
        static void ClStageFailed(int stage, long errorCode);
        static void ClConnectionStarted(void);
        static void ClConnectionTerminated(long errorCode);
        static void ClDisplayMessage(char* message);
        static void ClDisplayTransientMessage(char* message);
        
        static Shader CreateProgram(const char* vertexShader, const char* fragmentShader);
        static void CreateShader(GLuint program, GLenum type, const char* source, int size);
        
        void PaintFinished(int32_t result);
        void DispatchGetPicture(uint32_t unused);
        void PictureReady(int32_t result, PP_VideoPicture picture);
        void PaintPicture(void);
        void InitializeRenderingSurface(int width, int height);
        
        static void VidDecSetup(int videoFormat, int width, int height, int redrawRate, void* context, int drFlags);
        static void VidDecCleanup(void);
        static int VidDecSubmitDecodeUnit(PDECODE_UNIT decodeUnit);
        
        static void AudDecInit(int audioConfiguration, POPUS_MULTISTREAM_CONFIGURATION opusConfig);
        static void AudDecCleanup(void);
        static void AudDecDecodeAndPlaySample(char* sampleData, int sampleLength);
        
    private:
        static CONNECTION_LISTENER_CALLBACKS s_ClCallbacks;
        static DECODER_RENDERER_CALLBACKS s_DrCallbacks;
        static AUDIO_RENDERER_CALLBACKS s_ArCallbacks;
        
        std::string m_Host;
        STREAM_CONFIGURATION m_StreamConfig;
        int m_ServerMajorVersion;
        bool m_Running;
        
        pthread_t m_ConnectionThread;
        pthread_t m_GamepadThread;
    
        pp::Graphics3D m_Graphics3D;
        pp::VideoDecoder* m_VideoDecoder;
        Shader m_Texture2DShader;
        Shader m_RectangleArbShader;
        Shader m_ExternalOesShader;
        std::queue<PP_VideoPicture> m_PendingPictureQueue;
        bool m_IsPainting;
        bool m_RequestIdrFrame;
        
        OpusMSDecoder* m_OpusDecoder;
        pp::Audio m_AudioPlayer;
        
        double m_LastPadTimestamps[4];
        const PPB_Gamepad* m_GamepadApi;
        pp::CompletionCallbackFactory<MoonlightInstance> m_CallbackFactory;
        bool m_MouseLocked;
        char m_KeyModifiers;
        bool m_WaitingForAllModifiersUp;
        float m_AccumulatedTicks;
};

extern MoonlightInstance* g_Instance;
