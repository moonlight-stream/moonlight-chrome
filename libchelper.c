#include <sys/timeb.h>
#include <sys/time.h>

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