#pragma once
#include <mach/mach.h>
#include <cstdint>
struct NeedleSurfaceMessage {
    mach_msg_header_t header;
    mach_msg_body_t body;
    mach_msg_port_descriptor_t surface;
    uint64_t frame, sceneFrame;
    uint32_t width, height;
};
