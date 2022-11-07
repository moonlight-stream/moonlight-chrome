#include "moonlight.hpp"

#define MAX_CHANNEL_COUNT 2
#define FRAME_SIZE 240

#define CIRCULAR_BUFFER_SIZE 32

// This code uses volatiles for synchronization between the producer and consumer side. This is
// only safe because this code executes under very specific conditions, namely that the framework
// ensures AudioPlayerSampleCallback and AudDecDecodeAndPlaySample are each only active on one thread
// at a time.

static short s_CircularBuffer[CIRCULAR_BUFFER_SIZE][FRAME_SIZE * MAX_CHANNEL_COUNT];
static int s_ReadIndex;
static int s_WriteIndex;

static void AudioPlayerSampleCallback(void* samples, uint32_t buffer_size, void* data) {
    // It should only ask us for complete buffers
    assert(buffer_size == FRAME_SIZE * MAX_CHANNEL_COUNT * sizeof(short));
        
    // If the indexes aren't equal, we have a sample
    if (s_WriteIndex != s_ReadIndex) {
        memcpy(samples, s_CircularBuffer[s_ReadIndex], buffer_size);
        
        // Use a full memory barrier to ensure the circular buffer is read before incrementing the index
        __sync_synchronize();
        
        // This can race with the reader in the AudDecDecodeAndPlaySample function. This is
        // not a problem because at worst, it just won't see that we've consumed this sample yet.
        s_ReadIndex = (s_ReadIndex + 1) % CIRCULAR_BUFFER_SIZE;
    }
    else {
        memset(samples, 0, buffer_size);
    }
}

int MoonlightInstance::AudDecInit(int audioConfiguration, POPUS_MULTISTREAM_CONFIGURATION opusConfig, void* context, int flags) {
    int rc;

    // Reset the ring buffer to empty
    s_ReadIndex = s_WriteIndex = 0;
    
    g_Instance->m_OpusDecoder = opus_multistream_decoder_create(opusConfig->sampleRate,
                                                                opusConfig->channelCount,
                                                                opusConfig->streams,
                                                                opusConfig->coupledStreams,
                                                                opusConfig->mapping,
                                                                &rc);
    
    g_Instance->m_AudioPlayer = pp::Audio(g_Instance, pp::AudioConfig(g_Instance, PP_AUDIOSAMPLERATE_48000, FRAME_SIZE),
                                          AudioPlayerSampleCallback, NULL);
    
    // Start playback now
    g_Instance->m_AudioPlayer.StartPlayback();
    
    return 0;
}

void MoonlightInstance::AudDecCleanup(void) {
    // Stop playback
    g_Instance->m_AudioPlayer.StopPlayback();
    
    if (g_Instance->m_OpusDecoder) {
        opus_multistream_decoder_destroy(g_Instance->m_OpusDecoder);
    }
}

void MoonlightInstance::AudDecDecodeAndPlaySample(char* sampleData, int sampleLength) {
    int decodeLen;
        
    // Check if there is space for this sample in the buffer. Again, this can race
    // but in the worst case, we'll not see the sample callback having consumed a sample.
    if (((s_WriteIndex + 1) % CIRCULAR_BUFFER_SIZE) == s_ReadIndex) {
        return;
    }
    
    decodeLen = opus_multistream_decode(g_Instance->m_OpusDecoder, (unsigned char *)sampleData, sampleLength,
                                        s_CircularBuffer[s_WriteIndex], FRAME_SIZE, 0);
    if (decodeLen > 0) {
        // Use a full memory barrier to ensure the circular buffer is written before incrementing the index
        __sync_synchronize();
        
        // This can race with the reader in the sample callback, however this is a benign
        // race since we'll either read the original value of s_WriteIndex (which is safe,
        // we just won't consider this sample) or the new value of s_WriteIndex
        s_WriteIndex = (s_WriteIndex + 1) % CIRCULAR_BUFFER_SIZE;
    }
}

AUDIO_RENDERER_CALLBACKS MoonlightInstance::s_ArCallbacks = {
    .init = MoonlightInstance::AudDecInit,
    .cleanup = MoonlightInstance::AudDecCleanup,
    .decodeAndPlaySample = MoonlightInstance::AudDecDecodeAndPlaySample,
    .capabilities = CAPABILITY_DIRECT_SUBMIT
};
