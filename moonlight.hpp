#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var.h"
#include "ppapi/cpp/var_dictionary.h"
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
#include "ppapi/utility/threading/simple_thread.h"

#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>

#include "nacl_io/nacl_io.h"

#include <queue>

#include <Limelight.h>

#include <opus_multistream.h>

// Uncomment this line to enable the profiling infrastructure
//#define ENABLE_PROFILING 1

// Use this define to choose the time threshold in milliseconds above
// which a profiling message is printed
#define PROFILING_MESSAGE_THRESHOLD 1


#define DR_FLAG_FORCE_SW_DECODE     0x01

// These will mostly be I/O bound so we'll create
// a bunch to allow more concurrent server requests
// since our HTTP request libary is synchronous.
#define HTTP_HANDLER_THREADS 8

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
            m_HasNextPicture(false),
            m_IsPainting(false),
            m_OpusDecoder(NULL),
            m_CallbackFactory(this),
            m_MouseLocked(false),
            m_WaitingForAllModifiersUp(false),
            m_AccumulatedTicks(0),
            m_MouseDeltaX(0),
            m_MouseDeltaY(0),
            m_MousePositionX(0),
            m_MousePositionY(0),
            m_LastTouchUpTime(0),
            m_HttpThreadPoolSequence(0) {
            // This function MUST be used otherwise sockets don't work (nacl_io_init() doesn't work!)            
            nacl_io_init_ppapi(pp_instance(), pp::Module::Get()->get_browser_interface());
            
            LiInitializeStreamConfiguration(&m_StreamConfig);
                
            pp::TextInputController(this).SetTextInputType(PP_TEXTINPUT_TYPE_NONE);
            
            m_GamepadApi = static_cast<const PPB_Gamepad*>(pp::Module::Get()->GetBrowserInterface(PPB_GAMEPAD_INTERFACE));
            
            for (int i = 0; i < HTTP_HANDLER_THREADS; i++) {
                m_HttpThreadPool[i] = new pp::SimpleThread(this);
                m_HttpThreadPool[i]->Start();
            }
        }
        
        virtual ~MoonlightInstance() {
            for (int i = 0; i < HTTP_HANDLER_THREADS; i++) {
                m_HttpThreadPool[i]->Join();
                delete m_HttpThreadPool[i];
            }
        }
        
        bool Init(uint32_t argc, const char* argn[], const char* argv[]);
        
        void HandleMessage(const pp::Var& var_message);
        void HandlePair(int32_t callbackId, pp::VarArray args);
        void HandleShowGames(int32_t callbackId, pp::VarArray args);
        void HandleStartStream(int32_t callbackId, pp::VarArray args);
        void HandleStopStream(int32_t callbackId, pp::VarArray args);
        void HandleOpenURL(int32_t callbackId, pp::VarArray args);
        void HandleSTUN(int32_t callbackId, pp::VarArray args);
        void PairCallback(int32_t /*result*/, int32_t callbackId, pp::VarArray args);
        void STUNCallback(int32_t /*result*/, int32_t callbackId, pp::VarArray args);
    
        bool TryHandleNativeTouchEvent(const pp::InputEvent& event);
        bool HandleInputEvent(const pp::InputEvent& event);
        void ReportMouseMovement();
        
        void PollGamepads();
        
        void MouseLockLost();
        void DidLockMouse(int32_t result);
        void LockMouseOrJustCaptureInput();
        void UnlockMouseOrJustReleaseInput();
        
        void OnConnectionStopped(uint32_t unused);
        void OnConnectionStarted(uint32_t error);
        void StopConnection();

        static uint32_t ProfilerGetPackedMillis();
        static uint64_t ProfilerGetMillis();
        static uint64_t ProfilerUnpackTime(uint32_t packedTime);
        static void ProfilerPrintPackedDelta(const char* message, uint32_t packedTimeA, uint32_t packedTimeB);
        static void ProfilerPrintDelta(const char* message, uint64_t timeA, uint64_t timeB);
        static void ProfilerPrintPackedDeltaFromNow(const char* message, uint32_t packedTime);
        static void ProfilerPrintDeltaFromNow(const char* message, uint64_t time);
        static void ProfilerPrintWarning(const char* message);

        static void* ConnectionThreadFunc(void* context);
        static void* InputThreadFunc(void* context);
        static void* StopThreadFunc(void* context);
        
        static void ClStageStarting(int stage);
        static void ClStageFailed(int stage, int errorCode);
        static void ClConnectionStarted(void);
        static void ClConnectionTerminated(int errorCode);
        static void ClDisplayMessage(const char* message);
        static void ClDisplayTransientMessage(const char* message);
        static void ClLogMessage(const char* format, ...);
        static void ClControllerRumble(unsigned short controllerNumber, unsigned short lowFreqMotor, unsigned short highFreqMotor);
        
        static Shader CreateProgram(const char* vertexShader, const char* fragmentShader);
        static void CreateShader(GLuint program, GLenum type, const char* source, int size);
        
        void PaintFinished(int32_t result);
        void DispatchGetPicture(uint32_t unused);
        void PictureReady(int32_t result, PP_VideoPicture picture);
        void PaintPicture(void);
        bool InitializeRenderingSurface(int width, int height);
        void DidChangeFocus(bool got_focus);
        void DidChangeView(const pp::View& view);
        
        static int VidDecSetup(int videoFormat, int width, int height, int redrawRate, void* context, int drFlags);
        static void VidDecCleanup(void);
        static int VidDecSubmitDecodeUnit(PDECODE_UNIT decodeUnit);
        
        static int AudDecInit(int audioConfiguration, POPUS_MULTISTREAM_CONFIGURATION opusConfig, void* context, int flags);
        static void AudDecCleanup(void);
        static void AudDecDecodeAndPlaySample(char* sampleData, int sampleLength);
        
        void MakeCert(int32_t callbackId, pp::VarArray args);
        void LoadCert(const char* certStr, const char* keyStr);
        
        static void OSSLThreadLock(int mode, int n, const char *, int);
        static unsigned long OSSLThreadId(void);
        void NvHTTPInit(int32_t callbackId, pp::VarArray args);
        void NvHTTPRequest(int32_t, int32_t callbackId, pp::VarArray args);
        
    public:
        const PPB_Gamepad* m_GamepadApi;
        
    private:
        static CONNECTION_LISTENER_CALLBACKS s_ClCallbacks;
        static DECODER_RENDERER_CALLBACKS s_DrCallbacks;
        static AUDIO_RENDERER_CALLBACKS s_ArCallbacks;
        
        std::string m_Host;
        std::string m_AppVersion;
        std::string m_GfeVersion;
        std::string m_RtspUrl;
        bool m_MouseLockingFeatureEnabled;
        STREAM_CONFIGURATION m_StreamConfig;
        bool m_Running;
        
        pthread_t m_ConnectionThread;
        pthread_t m_InputThread;
    
        pp::Graphics3D m_Graphics3D;
        pp::VideoDecoder* m_VideoDecoder;
        Shader m_Texture2DShader;
        Shader m_RectangleArbShader;
        Shader m_ExternalOesShader;
        PP_VideoPicture m_NextPicture;
        bool m_HasNextPicture;
        PP_VideoPicture m_CurrentPicture;
        bool m_IsPainting;

        pp::Rect m_PluginRect;
    
        OpusMSDecoder* m_OpusDecoder;
        pp::Audio m_AudioPlayer;
        
        double m_LastPadTimestamps[4];
        pp::CompletionCallbackFactory<MoonlightInstance> m_CallbackFactory;
        bool m_MouseLocked;
        bool m_WaitingForAllModifiersUp;
        float m_AccumulatedTicks;
        int32_t m_MouseDeltaX, m_MouseDeltaY;
        int32_t m_MousePositionX, m_MousePositionY;
        PP_TimeTicks m_LastTouchUpTime;
        pp::FloatPoint m_LastTouchUpPoint;
    
        pp::SimpleThread* m_HttpThreadPool[HTTP_HANDLER_THREADS];
        uint32_t m_HttpThreadPoolSequence;
};

extern MoonlightInstance* g_Instance;
