#include "moonlight.hpp"

#include <stdio.h>

#include <sys/time.h>

#define PACKED_TIME_SECONDS_BITSHIFT  16
#define PACKED_TIME_MILLIS_MASK       0xFFFF

uint32_t MoonlightInstance::ProfilerGetPackedMillis() {
#if defined(ENABLE_PROFILING)
    struct timeval tv;
    uint32_t res;
    
    gettimeofday(&tv, NULL);
    
    res = tv.tv_sec << PACKED_TIME_SECONDS_BITSHIFT;
    res += (tv.tv_usec / 1000) & PACKED_TIME_MILLIS_MASK;
    return res;
#else
    return 0;
#endif
}

uint64_t MoonlightInstance::ProfilerGetMillis() {
#if defined(ENABLE_PROFILING)
    struct timeval tv;
    uint64_t res;
    
    gettimeofday(&tv, NULL);
    
    res = tv.tv_sec * 1000;
    res += tv.tv_usec / 1000;
    return res;
#else
    return 0;
#endif
}

// The return value of this function is referenced to an
// arbitrary epoch, and as such is only suitable for comparison
// with other unpacked time values.
uint64_t MoonlightInstance::ProfilerUnpackTime(uint32_t packedTime) {
#if defined(ENABLE_PROFILING)
    uint64_t res;
    res = (packedTime >> PACKED_TIME_SECONDS_BITSHIFT) * 1000;
    res += (packedTime & PACKED_TIME_MILLIS_MASK);
    return res;
#else
    return 0;
#endif
}

void MoonlightInstance::ProfilerPrintPackedDelta(const char* message,
                                                 uint32_t packedTimeA,
                                                 uint32_t packedTimeB) {
#if defined(ENABLE_PROFILING)
    printf("%s: %d ms\n", message,
           (uint32_t)(ProfilerUnpackTime(packedTimeB) - ProfilerUnpackTime(packedTimeA)));
#endif
}

void MoonlightInstance::ProfilerPrintDelta(const char* message,
                                           uint64_t timeA,
                                           uint64_t timeB) {
#if defined(ENABLE_PROFILING)
    printf("%s: %d ms\n", message, (uint32_t)(timeA - timeB));
#endif
}