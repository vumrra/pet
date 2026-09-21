#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static CFMachPortRef tap;
static CFAbsoluteTime last_activity;

static CGEventRef activity(CGEventTapProxy proxy, CGEventType type,
                           CGEventRef event, void *context) {
    (void)proxy;
    (void)context;
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        CGEventTapEnable(tap, true);
    } else if (type == kCGEventKeyDown || type == kCGEventFlagsChanged) {
        // Only event occurrence is used. Never decode key codes or characters.
        CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
        if (now - last_activity >= 0.024) {
            last_activity = now;
            puts("activity");
        }
    }
    return event;
}

static void parent_closed(CFFileDescriptorRef fd, CFOptionFlags flags, void *context) {
    (void)fd;
    (void)flags;
    (void)context;
    char ignored;
    if (read(STDIN_FILENO, &ignored, 1) <= 0) CFRunLoopStop(CFRunLoopGetCurrent());
}

// Read-only check. Never call CGRequestListenEventAccess or show a consent prompt.
int main(int argc, char **argv) {
    if (!CGPreflightListenEventAccess()) return 1;
    if (argc == 1) return 0;
    if (argc != 2 || strcmp(argv[1], "--listen") != 0) return 2;
    setvbuf(stdout, NULL, _IONBF, 0);
    tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
        kCGEventTapOptionListenOnly,
        CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventFlagsChanged),
        activity, NULL);
    if (!tap) return 3;
    CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(NULL, tap, 0);
    CFFileDescriptorRef parent = CFFileDescriptorCreate(NULL, STDIN_FILENO, false, parent_closed, NULL);
    CFRunLoopSourceRef parent_source = CFFileDescriptorCreateRunLoopSource(NULL, parent, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), parent_source, kCFRunLoopCommonModes);
    CFFileDescriptorEnableCallBacks(parent, kCFFileDescriptorReadCallBack);
    CGEventTapEnable(tap, true);
    puts("ready");
    CFRunLoopRun();
    CFRelease(parent_source);
    CFRelease(parent);
    CFRelease(source);
    CFRelease(tap);
    return 0;
}
