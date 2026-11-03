#pragma once
#include "transport.h"
#include <memory>

PXR_NAMESPACE_OPEN_SCOPE
// Solaris' GetRawResource contract consumes OpenGL texture names, even when
// its render driver is HgiNull. Keep that ABI separate from Metal Hgi handles.
class NeedleGlHandoff {
public:
    NeedleGlHandoff();
    ~NeedleGlHandoff();
    void Reset();
    HgiTextureHandle Export(NeedleTransport& state,HgiTextureHandle const& source);
private:
    struct Impl;
    std::unique_ptr<Impl> _impl;
};
PXR_NAMESPACE_CLOSE_SCOPE
