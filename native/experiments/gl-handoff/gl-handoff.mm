#include "gl-handoff.h"
#include "pxr/imaging/hgi/texture.h"
#include "pxr/imaging/hgiMetal/hgi.h"
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#include <OpenGL/CGLIOSurface.h>
#include <Foundation/Foundation.h>
#include <stdexcept>
#include <limits>

PXR_NAMESPACE_OPEN_SCOPE
namespace {
class GlTexture final:public HgiTexture {
public:
    GlTexture(HgiTextureDesc const& desc):HgiTexture(desc){}
    size_t GetByteSizeOfResource()const override{return _GetByteSizeOfResource(_descriptor);}
    uint64_t GetRawResource()const override{return name;}
    HgiTextureUsage SubmitLayoutChange(HgiTextureUsage usage)override{return usage;}
    GLuint name=0;
};
struct GlContextScope {
    explicit GlContextScope(CGLContextObj context):context(context),previous(CGLGetCurrentContext()) {
        CGLLockContext(context);CGLSetCurrentContext(context);
    }
    ~GlContextScope(){CGLSetCurrentContext(previous);CGLUnlockContext(context);}
    CGLContextObj context,previous;
};
char const* DepthCopy=R"(
#include <metal_stdlib>
using namespace metal;
kernel void copyDepth(depth2d<float> source [[texture(0)]],
                      texture2d<float,access::write> destination [[texture(1)]],
                      uint2 p [[thread_position_in_grid]]) {
    if(p.x>=destination.get_width()||p.y>=destination.get_height())return;
    constexpr sampler nearest(coord::normalized,address::clamp_to_edge,filter::nearest);
    float2 uv=(float2(p)+0.5)/float2(destination.get_width(),destination.get_height());
    destination.write(float4(source.sample(nearest,uv)),p);
})";
}
struct NeedleGlHandoff::Impl {
    CGLContextObj context=nullptr;
    CGLShareGroupObj shareGroup=nullptr;
    IOSurfaceRef surface=nullptr;
    id<MTLTexture> shared=nil;
    id<MTLComputePipelineState> depthCopy=nil;
    std::unique_ptr<GlTexture> texture;
    GLuint rectangle=0,readFramebuffer=0,drawFramebuffer=0;
    uint64_t generation=0;
    ~Impl() {
        if(context) {
            {GlContextScope scope(context);
                if(texture)glDeleteTextures(1,&texture->name);
                glDeleteTextures(1,&rectangle);
                glDeleteFramebuffers(1,&readFramebuffer);glDeleteFramebuffers(1,&drawFramebuffer);}
            CGLReleaseContext(context);
        }
        [shared release];[depthCopy release];if(surface)CFRelease(surface);
    }
    void Initialize(HgiTextureHandle const& source,CGLContextObj host) {
        auto const& desc=source->GetDescriptor();
        const auto metal=reinterpret_cast<id<MTLTexture>>(source->GetRawResource());
        const bool color=metal.pixelFormat==MTLPixelFormatRGBA16Float;
        const bool integer=metal.pixelFormat==MTLPixelFormatR32Sint;
        const bool depth=metal.pixelFormat==MTLPixelFormatDepth32Float;
        if(!color&&!integer&&!depth)throw std::runtime_error("Unsupported Solaris GPU AOV format");
        shareGroup=CGLGetShareGroup(host);
        if(CGLCreateContext(CGLGetPixelFormat(host),host,&context)!=kCGLNoError)
            throw std::runtime_error("Cannot share Solaris OpenGL context");
        const size_t bytes=color?8:4;
        surface=IOSurfaceCreate((CFDictionaryRef)@{(id)kIOSurfaceWidth:@(desc.dimensions[0]),
            (id)kIOSurfaceHeight:@(desc.dimensions[1]),(id)kIOSurfaceBytesPerElement:@(bytes),
            (id)kIOSurfaceBytesPerRow:@(IOSurfaceAlignProperty(kIOSurfaceBytesPerRow,desc.dimensions[0]*bytes))});
        if(!surface)throw std::runtime_error("Cannot allocate Solaris shared GPU surface");
        auto td=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:depth?MTLPixelFormatR32Float:metal.pixelFormat
            width:desc.dimensions[0] height:desc.dimensions[1] mipmapped:NO];
        td.storageMode=MTLStorageModeShared;td.usage=MTLTextureUsageShaderRead|MTLTextureUsageShaderWrite;
        shared=[metal.device newTextureWithDescriptor:td iosurface:surface plane:0];
        if(!shared)throw std::runtime_error("Cannot import Solaris surface into Metal");
        if(depth) {
            NSError* error=nil;
            auto library=[metal.device newLibraryWithSource:[NSString stringWithUTF8String:DepthCopy] options:nil error:&error];
            if(!library)throw std::runtime_error([[error description] UTF8String]);
            auto function=[library newFunctionWithName:@"copyDepth"];
            depthCopy=[metal.device newComputePipelineStateWithFunction:function error:&error];
            [function release];[library release];
            if(!depthCopy)throw std::runtime_error([[error description] UTF8String]);
        }
        GlContextScope scope(context);
        const GLenum internal=color?GL_RGBA16F:integer?GL_R32I:GL_R32F;
        const GLenum format=color?GL_RGBA:integer?GL_RED_INTEGER:GL_RED;
        const GLenum type=color?GL_HALF_FLOAT:integer?GL_INT:GL_FLOAT;
        glGenTextures(1,&rectangle);glBindTexture(GL_TEXTURE_RECTANGLE,rectangle);
        const auto error=CGLTexImageIOSurface2D(context,GL_TEXTURE_RECTANGLE,internal,
            desc.dimensions[0],desc.dimensions[1],format,type,surface,0);
        if(error!=kCGLNoError)throw std::runtime_error("Cannot import Solaris surface into OpenGL");
        texture=std::make_unique<GlTexture>(desc);
        glGenTextures(1,&texture->name);glBindTexture(GL_TEXTURE_2D,texture->name);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_BASE_LEVEL,0);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAX_LEVEL,0);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
        glTexImage2D(GL_TEXTURE_2D,0,internal,desc.dimensions[0],desc.dimensions[1],0,format,type,nullptr);
        glGenFramebuffers(1,&readFramebuffer);glBindFramebuffer(GL_READ_FRAMEBUFFER,readFramebuffer);
        glFramebufferTexture2D(GL_READ_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_RECTANGLE,rectangle,0);
        glReadBuffer(GL_COLOR_ATTACHMENT0);
        glGenFramebuffers(1,&drawFramebuffer);glBindFramebuffer(GL_DRAW_FRAMEBUFFER,drawFramebuffer);
        glFramebufferTexture2D(GL_DRAW_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,texture->name,0);
        glDrawBuffer(GL_COLOR_ATTACHMENT0);
        if(glCheckFramebufferStatus(GL_READ_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE||
           glCheckFramebufferStatus(GL_DRAW_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE||glGetError()!=GL_NO_ERROR)
            throw std::runtime_error("Solaris GPU AOV framebuffer is incomplete");
        if(integer){const GLint clear[]={-1,0,0,0};glClearBufferiv(GL_COLOR,0,clear);}
        else {const GLfloat clear[]={depth?1.f:0.f,0,0,0};glClearBufferfv(GL_COLOR,0,clear);}
        glFinish();
    }
    void Copy(NeedleTransport& state,HgiTextureHandle const& source) {
        // The host and export contexts share the destination texture. Finish
        // the previous host use before overwriting it; no pixels visit the CPU.
        glFinish();
        auto* metal=dynamic_cast<HgiMetal*>(state.hgi);
        metal->CommitPrimaryCommandBuffer(HgiMetal::CommitCommandBuffer_NoWait,true);
        auto command=[metal->GetQueue() commandBuffer];
        const auto input=reinterpret_cast<id<MTLTexture>>(source->GetRawResource());
        if(depthCopy) {
            auto encoder=[command computeCommandEncoder];[encoder setComputePipelineState:depthCopy];
            [encoder setTexture:input atIndex:0];[encoder setTexture:shared atIndex:1];
            [encoder dispatchThreads:MTLSizeMake(input.width,input.height,1) threadsPerThreadgroup:MTLSizeMake(8,8,1)];
            [encoder endEncoding];
        } else {
            auto encoder=[command blitCommandEncoder];
            [encoder copyFromTexture:input sourceSlice:0 sourceLevel:0 sourceOrigin:MTLOriginMake(0,0,0)
                sourceSize:MTLSizeMake(input.width,input.height,1) toTexture:shared destinationSlice:0 destinationLevel:0 destinationOrigin:MTLOriginMake(0,0,0)];
            [encoder endEncoding];
        }
        [command commit];[command waitUntilCompleted];
        if(command.status!=MTLCommandBufferStatusCompleted)throw std::runtime_error("Solaris Metal handoff failed");
        GlContextScope scope(context);
        // Rebind after the other API writes the live IOSurface image.
        glBindTexture(GL_TEXTURE_RECTANGLE,rectangle);
        glBindFramebuffer(GL_READ_FRAMEBUFFER,readFramebuffer);glBindFramebuffer(GL_DRAW_FRAMEBUFFER,drawFramebuffer);
        glBlitFramebuffer(0,0,input.width,input.height,0,0,input.width,input.height,GL_COLOR_BUFFER_BIT,GL_NEAREST);
        glFinish();
        if(glGetError()!=GL_NO_ERROR)throw std::runtime_error("Solaris OpenGL handoff failed");
        ++state.gpuTextureExports;
    }
};
NeedleGlHandoff::NeedleGlHandoff()=default;
NeedleGlHandoff::~NeedleGlHandoff()=default;
void NeedleGlHandoff::Reset(){_impl.reset();}
HgiTextureHandle NeedleGlHandoff::Export(NeedleTransport& state,HgiTextureHandle const& source) {
    std::lock_guard<std::recursive_mutex> lock(state.gpuMutex);
    auto host=CGLGetCurrentContext();
    if(!host||!source)return {};
    if(!_impl){auto impl=std::make_unique<Impl>();impl->Initialize(source,host);_impl=std::move(impl);}
    if(CGLGetShareGroup(host)!=_impl->shareGroup)return {};
    const auto generation=state.readbackGeneration.load();
    if(generation!=_impl->generation){_impl->Copy(state,source);_impl->generation=generation;
        if(getenv("NEEDLE_HYDRA_TRACE"))fprintf(stderr,"Needle GL export %s generation %llu texture %u visible %d\n",source->GetDescriptor().debugName.c_str(),(unsigned long long)generation,_impl->texture->name,int(glIsTexture(_impl->texture->name)));}
    return HgiTextureHandle(_impl->texture.get(),uint64_t(uintptr_t(_impl->texture.get())));
}
PXR_NAMESPACE_CLOSE_SCOPE
