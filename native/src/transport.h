#pragma once
#include "pxr/pxr.h"
#include "pxr/base/js/value.h"
#include "pxr/base/js/json.h"
#include "pxr/base/gf/matrix4d.h"
#include "pxr/imaging/hd/renderDelegate.h"
#include "pxr/imaging/hgi/hgi.h"
#include "surface-message.h"
#include <IOSurface/IOSurface.h>
#include <Metal/Metal.h>
#include <atomic>
#include <mutex>
#include <vector>
#include <string>
#include <memory>
#include <array>

PXR_NAMESPACE_OPEN_SCOPE
class NeedleTransport : public HdRenderParam, public std::enable_shared_from_this<NeedleTransport> {
public:
    Hgi* hgi=nullptr;
    bool directGpuHandoff=true;
    std::atomic<bool> linearDepth{false};
    std::recursive_mutex gpuMutex;
    std::atomic<uint64_t> mapAttempts{0}, cpuReadbacks{0}, receivedSurfaces{0}, presentedSurfaces{0};
    std::atomic<uint64_t> readbackGeneration{0};
    std::atomic<uint64_t> gpuTextureExports{0};
    std::atomic<uint64_t> surfaceCodecTests{0},surfaceCodecErrors{0};
    NeedleTransport();
    ~NeedleTransport();
    void Command(std::string const& kind,std::string const& id,std::string const& method,JsArray args);
    template<class T> JsValue Buffer(T const* data,size_t count,char const* type) {
        std::lock_guard<std::mutex> lock(_mutex);
        while(_binary.size()%4)_binary.push_back(0);
        size_t offset=_binary.size();auto bytes=reinterpret_cast<uint8_t const*>(data);
        if(count) _binary.insert(_binary.end(),bytes,bytes+sizeof(T)*count);
        return JsValue(JsObject{{"$buffer",JsValue(uint64_t(offset))},{"length",JsValue(uint64_t(count))},{"type",JsValue(type)}});
    }
    bool Frame(unsigned width,unsigned height,GfMatrix4d const& view,GfMatrix4d const& projection);
    bool Present(std::array<HgiTextureHandle,5> const& targets,bool wait=true);
    void RestoreColor(HgiTextureHandle const& target);
    void SetTargets(std::array<HgiTextureHandle,5> const& targets);
    void ForgetTexture(HgiTextureHandle const& texture);
    void Pump();
    bool IsConverged() const {
        std::lock_guard<std::mutex> lock(_mutex);
        return _commands.empty() && _displayedScene.load()>=_serial && _sampleConverged.load();
    }
    uint32_t Samples() const { return _samples.load(); }
    uint64_t SceneSerial() const { return _serial.load(); }
    void Poll();
    std::string Error() const;
private:
    void _Start();
    void _Send(JsObject object,std::vector<uint8_t> const& binary={});
    void _Release(uint64_t frame,uint32_t scene=0,uint32_t sample=0,bool converged=false);
    mutable std::mutex _mutex;
    std::mutex _socketMutex,_pollMutex;
    std::array<HgiTextureHandle,5> _targets{};
    JsArray _commands;
    std::vector<uint8_t> _binary;
    int _socket=-1;
    int _child=0;
    mach_port_t _port=MACH_PORT_NULL;
    std::string _directory,_service,_error,_responses,_lastFrame,_purposes;
    std::atomic<uint64_t> _serial{0};
    std::atomic<uint32_t> _displayedScene{0},_samples{0};
    std::atomic<bool> _sampleConverged{false};
    bool _ready=false;
    id<MTLCommandQueue> _queue=nil;
    id<MTLRenderPipelineState> _pipeline=nil;
    id<MTLDepthStencilState> _depthState=nil;
    id<MTLTexture> _colorCache=nil;
    id<MTLTexture> _normalizedDepth=nil;
    id<MTLRenderPipelineState> _linearDepthPipeline=nil;
    id<MTLComputePipelineState> _metadataPipeline=nil;
    std::array<uint64_t,4> _formats{};
};
inline JsValue NeedleMatrix(GfMatrix4d const& matrix) {
    JsArray values;for(unsigned i=0;i<16;++i)values.emplace_back(matrix.data()[i]);return JsValue(values);
}
PXR_NAMESPACE_CLOSE_SCOPE
