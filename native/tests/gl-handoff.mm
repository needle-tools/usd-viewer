// Numeric diagnostics may read pixels; the production handoff must not.
#include "gl-handoff.h"
#include "pxr/imaging/hgi/texture.h"
#include "pxr/imaging/hgi/tokens.h"
#include "pxr/base/gf/half.h"
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#include <vector>
#include <iostream>
#include <stdexcept>
#include <cstring>
PXR_NAMESPACE_USING_DIRECTIVE
int main(){
    try {
        CGLPixelFormatAttribute attributes[]={kCGLPFAAccelerated,kCGLPFAOpenGLProfile,
            CGLPixelFormatAttribute(kCGLOGLPVersion_3_2_Core),CGLPixelFormatAttribute(0)};
        CGLPixelFormatObj format=nullptr;GLint count=0;CGLContextObj context=nullptr;
        if(CGLChoosePixelFormat(attributes,&format,&count)!=kCGLNoError||
           CGLCreateContext(format,nullptr,&context)!=kCGLNoError)throw std::runtime_error("No GL test context");
        CGLSetCurrentContext(context);
        auto hgi=Hgi::CreateNamedHgi(HgiTokens->Metal);
        NeedleTransport state;state.hgi=hgi.get();state.directGpuHandoff=false;state.readbackGeneration=1;
        constexpr int width=64,height=48,n=width*height;
        std::vector<int32_t> ids(n);std::vector<float> depth(n);std::vector<GfHalf> color(n*4);
        for(int i=0;i<n;++i){
            ids[i]=int32_t(uint32_t(i)*2654435761u);depth[i]=float(i)/float(n);
            for(int c=0;c<4;++c)color[i*4+c]=GfHalf(float((i*7+c*13)%257)/16.f-.5f);
        }
        ids[0]=-1;ids[1]=0;ids[2]=0x7fedcba9;
        for(int kind=0;kind<3;++kind){
            HgiTextureDesc desc;desc.dimensions=GfVec3i(width,height,1);desc.debugName="GL handoff diagnostic";
            desc.format=kind==0?HgiFormatInt32:kind==1?HgiFormatFloat32:HgiFormatFloat16Vec4;
            desc.usage=HgiTextureUsageBitsShaderRead|(kind==1?HgiTextureUsageBitsDepthTarget:HgiTextureUsageBitsColorTarget);
            desc.initialData=kind==0?static_cast<void*>(ids.data()):kind==1?static_cast<void*>(depth.data()):static_cast<void*>(color.data());
            desc.pixelsByteSize=size_t(n)*(kind==2?8:4);
            auto source=hgi->CreateTexture(desc);
            {NeedleGlHandoff handoff;
                const auto resource=handoff.Export(state,source);
                if(!resource||!glIsTexture(GLuint(resource->GetRawResource())))throw std::runtime_error("Export is not visible in host context");
                glBindTexture(GL_TEXTURE_2D,GLuint(resource->GetRawResource()));
                GLint maximum=-1;glGetTexParameteriv(GL_TEXTURE_2D,GL_TEXTURE_MAX_LEVEL,&maximum);
                if(maximum!=0)throw std::runtime_error("AOV is incomplete with the host's mipmapped sampler");
                std::vector<uint8_t> actual(desc.pixelsByteSize);
                glGetTexImage(GL_TEXTURE_2D,0,kind==0?GL_RED_INTEGER:kind==1?GL_RED:GL_RGBA,
                    kind==0?GL_INT:kind==1?GL_FLOAT:GL_HALF_FLOAT,actual.data());
                if(glGetError()!=GL_NO_ERROR||std::memcmp(actual.data(),desc.initialData,actual.size()))
                    throw std::runtime_error("GPU texture payload changed during Metal/GL handoff");
            }
            hgi->DestroyTexture(&source);
        }
        if(state.cpuReadbacks||state.mapAttempts||state.gpuTextureExports!=3)
            throw std::runtime_error("Handoff used CPU framebuffer mapping");
        std::cout<<"Metal/IOSurface/OpenGL HDR, depth and full-width signed ID payloads passed; no framebuffer Map.\n";
        CGLSetCurrentContext(nullptr);CGLReleaseContext(context);CGLReleasePixelFormat(format);
    } catch(std::exception const& error){std::cerr<<error.what()<<'\n';return 1;}
}
