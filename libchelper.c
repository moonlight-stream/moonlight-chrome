#include <sys/timeb.h>
#include <sys/time.h>
#include <stdlib.h>

// This function is defined but not implemented by newlib
int ftime(struct timeb *tp) {
    struct timeval tv;
    
    if (gettimeofday(&tv, NULL) < 0) {
        return -1;
    }
    
    tp->time = tv.tv_sec;
    tp->millitm = tv.tv_usec / 1000;
    tp->timezone = 0;
    tp->dstflag = 0;

    return 0;
}

// This function is required for libcurl to link but never
// called using by any of the APIs we use
unsigned alarm(unsigned seconds) {
    abort();
    return 0;
}
