#include "moonlight.hpp"

#define MAX_CHANNEL_COUNT 6
#define FRAME_SIZE 240

typedef struct decoded_sample_entry {
    struct decoded_sample_entry *next;
    int sampleLength;
    short sampleBuffer[1];
} decoded_sample_entry_t;

#define MAX_QUEUE_LENGTH 14
#define QUEUE_PRUNING_LENGTH 7

static int s_OpusChannelCount;
static decoded_sample_entry_t* s_SampleQueueHead;
static decoded_sample_entry_t* s_SampleQueueTail;
static int s_SampleQueueLength;
static pthread_mutex_t s_SampleQueueLock;

static void ReapSampleQueue() {
    decoded_sample_entry_t *entry;
    
    while (s_SampleQueueHead) {
        entry = s_SampleQueueHead->next;
        free(s_SampleQueueHead);
        s_SampleQueueHead = entry;
    }
    
    s_SampleQueueTail = NULL;
    
    s_SampleQueueLength = 0;
}

static void AudioPlayerSampleCallback(void* samples, uint32_t buffer_size, void* data) {
    unsigned char* buffer = (unsigned char *)samples;
    int offset = 0;
    
    pthread_mutex_lock(&s_SampleQueueLock);

    while (s_SampleQueueHead && s_SampleQueueHead->sampleLength <= buffer_size - offset) {
        decoded_sample_entry_t* lastEnt;
        
        memcpy(&buffer[offset], s_SampleQueueHead->sampleBuffer, s_SampleQueueHead->sampleLength);
        offset += s_SampleQueueHead->sampleLength;
        
        lastEnt = s_SampleQueueHead;
        s_SampleQueueHead = s_SampleQueueHead->next;
        free(lastEnt);
        s_SampleQueueLength--;
        
        // Remove another sample if we're in pruning mode
        if (s_SampleQueueLength > QUEUE_PRUNING_LENGTH) {
            lastEnt = s_SampleQueueHead;
            s_SampleQueueHead = s_SampleQueueHead->next;
            free(lastEnt);
            s_SampleQueueLength--;
        }
    }
    
    if (!s_SampleQueueHead) {
        s_SampleQueueTail = NULL;
    }
    
    pthread_mutex_unlock(&s_SampleQueueLock);
    
    // Zero the remaining portion of the sample buffer to reduce noise when underflowing
    if (buffer_size != offset) {
        memset(&buffer[offset], 0, buffer_size - offset);
    }
}

void MoonlightInstance::AudDecInit(int audioConfiguration, POPUS_MULTISTREAM_CONFIGURATION opusConfig) {
    int rc;
    
    pthread_mutex_init(&s_SampleQueueLock, NULL);
    
    s_OpusChannelCount = opusConfig->channelCount;
    g_Instance->m_OpusDecoder = opus_multistream_decoder_create(opusConfig->sampleRate,
                                                                opusConfig->channelCount,
                                                                opusConfig->streams,
                                                                opusConfig->coupledStreams,
                                                                opusConfig->mapping,
                                                                &rc);
                                                                
    pp::AudioConfig audioConfig = pp::AudioConfig(g_Instance, PP_AUDIOSAMPLERATE_48000, FRAME_SIZE * 3);
    
    g_Instance->m_AudioPlayer = pp::Audio(g_Instance, audioConfig, AudioPlayerSampleCallback, NULL);
    
    // Start playback now
    g_Instance->m_AudioPlayer.StartPlayback();
}

void MoonlightInstance::AudDecCleanup(void) {    
    pthread_mutex_destroy(&s_SampleQueueLock);
    
    if (g_Instance->m_OpusDecoder) {
        opus_multistream_decoder_destroy(g_Instance->m_OpusDecoder);
    }
    
    ReapSampleQueue();
}

void MoonlightInstance::AudDecDecodeAndPlaySample(char* sampleData, int sampleLength) {
    decoded_sample_entry_t* entry = (decoded_sample_entry_t*)malloc(sizeof(decoded_sample_entry_t) +
                                                                    (s_OpusChannelCount * FRAME_SIZE * sizeof(short)));
    if (entry) {
        int decodeLen = opus_multistream_decode(g_Instance->m_OpusDecoder, (unsigned char *)sampleData, sampleLength,
                                                entry->sampleBuffer, FRAME_SIZE, 0);
        if (decodeLen > 0) {
            entry->sampleLength = decodeLen * s_OpusChannelCount * sizeof(short);
            entry->next = NULL;
            
            pthread_mutex_lock(&s_SampleQueueLock);
            
            if (s_SampleQueueLength == MAX_QUEUE_LENGTH) {
                printf("Reaped sample queue\n");
                ReapSampleQueue();
            }
            
            if (!s_SampleQueueTail) {
                s_SampleQueueHead = s_SampleQueueTail = entry;
            }
            else {
                s_SampleQueueTail->next = entry;
                s_SampleQueueTail = entry;
            }
            
            s_SampleQueueLength++;
            
            pthread_mutex_unlock(&s_SampleQueueLock);
        }
        else {
            free(entry);
        }
    }
}

AUDIO_RENDERER_CALLBACKS MoonlightInstance::s_ArCallbacks = {
    MoonlightInstance::AudDecInit,
    MoonlightInstance::AudDecCleanup,
    MoonlightInstance::AudDecDecodeAndPlaySample,
    CAPABILITY_DIRECT_SUBMIT
};