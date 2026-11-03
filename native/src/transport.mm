#include "transport.h"
#include "pxr/imaging/hgiMetal/hgi.h"
#include "pxr/imaging/hgiMetal/texture.h"
#include <servers/bootstrap.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <spawn.h>
#include <fcntl.h>
#include <unistd.h>
#include <signal.h>
#include <sys/wait.h>
#include <fstream>
#include <chrono>
#include <thread>
#include <cstring>
#include <stdexcept>
extern char** environ;
PXR_NAMESPACE_OPEN_SCOPE
#include "surface-shader.h"
NeedleTransport::NeedleTransport()=default;
NeedleTransport::~NeedleTransport(){
    if(const auto path=getenv("NEEDLE_HYDRA_STATS")) {
        std::ofstream stream(path,std::ios::app);
        JsWriter writer(stream);writer.BeginObject();
        writer.WriteKeyValue("framebufferMapAttempts",mapAttempts.load());
        writer.WriteKeyValue("cpuReadbacks",cpuReadbacks.load());
        writer.WriteKeyValue("gpuSurfacesReceived",receivedSurfaces.load());
        writer.WriteKeyValue("gpuSurfacesPresented",presentedSurfaces.load());
        writer.WriteKeyValue("gpuTextureExports",gpuTextureExports.load());
        writer.WriteKeyValue("directGpuHandoff",directGpuHandoff);
        writer.WriteKeyValue("samples",Samples());
        writer.WriteKeyValue("converged",IsConverged());
        writer.WriteKeyValue("error",Error());
        writer.EndObject();stream << '\n';
    }
    if(_queue){[_queue release];[_pipeline release];[_depthState release];[_colorCache release];[_metadataPipeline release];[_normalizedDepth release];[_linearDepthPipeline release];}
    if(_socket>=0)close(_socket);
    if(_child>0) {
        const auto child=_child;
        std::thread([child] {
            for(unsigned attempt=0;attempt<100;++attempt) {
                const auto result=waitpid(child,nullptr,WNOHANG);
                if(result==child||result<0)return;
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
            kill(child,SIGTERM);waitpid(child,nullptr,0);
        }).detach();
    }
    if(_port!=MACH_PORT_NULL)mach_port_destroy(mach_task_self(),_port);
    if(!_directory.empty()){unlink((_directory+"/commands.sock").c_str());rmdir(_directory.c_str());}
}
void NeedleTransport::Command(std::string const& kind,std::string const& id,std::string const& method,JsArray args){
    std::lock_guard<std::mutex> lock(_mutex);
    if(kind=="delegate"&&method=="setIncludedPurposes") {
        const auto key=JsWriteToString(JsValue(args));
        if(key==_purposes)return;
        _purposes=key;
    }
    _commands.emplace_back(JsArray{JsValue(kind),JsValue(id),JsValue(method),JsValue(args)});
}
std::string NeedleTransport::Error() const{std::lock_guard<std::mutex> lock(_mutex);return _error;}
void NeedleTransport::_Start(){
    if(_socket>=0)return;
    if(!hgi||hgi->GetAPIName()!=TfToken("Metal"))throw std::runtime_error("Needle experiment requires a Metal rendering device");
    char directory[]="/tmp/needle-hydra-XXXXXX";
    if(!mkdtemp(directory))throw std::runtime_error("Cannot create private renderer directory");
    _directory=directory;_service="tools.needle.hydra."+std::to_string(getpid())+"."+std::to_string(uintptr_t(this));
    auto result=mach_port_allocate(mach_task_self(),MACH_PORT_RIGHT_RECEIVE,&_port);
    if(result==KERN_SUCCESS)result=mach_port_insert_right(mach_task_self(),_port,_port,MACH_MSG_TYPE_MAKE_SEND);
    if(result==KERN_SUCCESS)result=bootstrap_register(bootstrap_port,_service.data(),_port);
    if(result!=KERN_SUCCESS)throw std::runtime_error(std::string("Mach service: ")+mach_error_string(result));
    const char* electron=getenv("NEEDLE_HYDRA_ELECTRON");
    if(!electron||!*electron)electron=NEEDLE_ELECTRON;
    std::string main=std::string(NEEDLE_SOURCE_DIR)+"/renderer/main.cjs",socketPath=_directory+"/commands.sock";
    char* args[]={const_cast<char*>(electron),main.data(),socketPath.data(),_service.data(),nullptr};
    std::vector<std::string> environment;
    for(char** entry=environ;*entry;++entry){std::string value=*entry;const auto key=value.substr(0,value.find('='));
        if(key=="DYLD_LIBRARY_PATH"||key=="DYLD_FALLBACK_LIBRARY_PATH"||key=="PYTHONPATH"||key=="PXR_PLUGINPATH_NAME"||key=="ELECTRON_RUN_AS_NODE"||key=="NODE_OPTIONS")continue;
        environment.push_back(std::move(value));}
    std::vector<char*> env;for(auto& value:environment)env.push_back(value.data());env.push_back(nullptr);
    pid_t child;int error=posix_spawn(&child,electron,nullptr,nullptr,args,env.data());
    if(error)throw std::runtime_error(std::string("Renderer launch: ")+strerror(error));_child=child;
    _socket=socket(AF_UNIX,SOCK_STREAM,0);
    if(_socket<0)throw std::runtime_error("Cannot create renderer command socket");
    fcntl(_socket,F_SETFD,FD_CLOEXEC);
    sockaddr_un address{};address.sun_family=AF_UNIX;
    strlcpy(address.sun_path,socketPath.c_str(),sizeof(address.sun_path));
    const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(10);
    while(connect(_socket,reinterpret_cast<sockaddr*>(&address),sizeof(address))!=0){
        if(std::chrono::steady_clock::now()>end)throw std::runtime_error("Native renderer command socket timed out");
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    int one=1;setsockopt(_socket,SOL_SOCKET,SO_NOSIGPIPE,&one,sizeof(one));
}
void NeedleTransport::_Send(JsObject object,std::vector<uint8_t> const& binary){
    auto json=JsWriteToString(JsValue(object));uint32_t lengths[]={uint32_t(json.size()),uint32_t(binary.size())};
    std::lock_guard<std::mutex> lock(_socketMutex);
    auto sendAll=[&](const void* data,size_t size){auto ptr=static_cast<char const*>(data);while(size){auto n=write(_socket,ptr,size);if(n<=0){if(n<0&&errno==EINTR)continue;throw std::runtime_error("Native renderer disconnected");}ptr+=n;size-=n;}};
    sendAll(lengths,sizeof(lengths));sendAll(json.data(),json.size());if(!binary.empty())sendAll(binary.data(),binary.size());
}
bool NeedleTransport::Frame(unsigned width,unsigned height,GfMatrix4d const& view,GfMatrix4d const& projection){
    // Buffer polling and render-pass execution may happen on different host
    // threads. Serialize scene identity with target changes and GPU pumping.
    std::lock_guard<std::recursive_mutex> lock(gpuMutex);
    try{
        _Start();Poll();
        JsObject frame{{"width",JsValue(int(width))},{"height",JsValue(int(height))},{"view",NeedleMatrix(view)},{"projection",NeedleMatrix(projection)}};
        frame["validate"]=JsValue(getenv("NEEDLE_HYDRA_VALIDATE_CODEC")!=nullptr);
        const auto key=JsWriteToString(JsValue(frame));
        JsArray commands;std::vector<uint8_t> binary;
        {std::lock_guard<std::mutex> lock(_mutex);if(!_error.empty())return false;
            if(key==_lastFrame&&_commands.empty())return true;
            commands.swap(_commands);binary.swap(_binary);
            _lastFrame=key;frame["serial"]=JsValue(++_serial);}
        _Send({{"commands",JsValue(commands)},{"frame",JsValue(frame)}},binary);return true;
    }catch(std::exception const& error){std::lock_guard<std::mutex> lock(_mutex);_error=error.what();return false;}
}
void NeedleTransport::Poll(){
    std::lock_guard<std::mutex> polling(_pollMutex);
    if(_socket<0)return;char bytes[4096];ssize_t size;
    while((size=recv(_socket,bytes,sizeof(bytes),MSG_DONTWAIT))>0)_responses.append(bytes,size);
    if(size==0){
        int status=0;const auto child=waitpid(_child,&status,WNOHANG);
        std::lock_guard<std::mutex> lock(_mutex);_error="Native renderer disconnected";
        if(child==_child)_error+=WIFSIGNALED(status)?" (signal "+std::to_string(WTERMSIG(status))+")":" (exit "+std::to_string(WEXITSTATUS(status))+")";
    }
    size_t newline;
    while((newline=_responses.find('\n'))!=std::string::npos){auto text=_responses.substr(0,newline);_responses.erase(0,newline+1);
        JsParseError error;auto value=JsParseString(text,&error);if(!value.IsObject())continue;
        const auto& object=value.GetJsObject();auto it=object.find("error");
        if(it!=object.end()&&it->second.IsString()){std::lock_guard<std::mutex> lock(_mutex);_error=it->second.GetString();}
        if(object.count("ready"))_ready=true;
    }
}
void NeedleTransport::_Release(uint64_t frame,uint32_t scene,uint32_t sample,bool converged) {
    try {
        _Send({{"release",JsValue(JsArray{JsValue(frame)})},
               {"completed",JsValue(JsObject{{"serial",JsValue(uint64_t(scene))},{"sample",JsValue(uint64_t(sample))},{"converged",JsValue(converged)}})}});
    } catch(...) {}
}

bool NeedleTransport::Present(std::array<HgiTextureHandle,5> const& targets,bool wait) {
    std::lock_guard<std::recursive_mutex> lock(gpuMutex);
    if(_port==MACH_PORT_NULL)return false;
    for(const auto& target:targets)if(!target)return false;
    struct Envelope { NeedleSurfaceMessage message;mach_msg_max_trailer_t trailer; } envelope{};
    auto receive=[&](mach_msg_timeout_t timeout) {
        return mach_msg(&envelope.message.header,MACH_RCV_MSG|MACH_RCV_TIMEOUT,0,sizeof(envelope),_port,timeout,MACH_PORT_NULL);
    };
    auto result=receive(!wait||IsConverged()?0:16);
    if(result==MACH_RCV_TIMED_OUT)return IsConverged();
    if(result!=KERN_SUCCESS){std::lock_guard<std::mutex> lock(_mutex);_error=mach_error_string(result);return false;}
    // Only the newest available surface is useful after a camera/scene change.
    // Release older leases without ever mapping or submitting their textures.
    auto message=envelope.message;
    while(receive(0)==KERN_SUCCESS) {
        mach_msg_destroy(&message.header);_Release(message.frame);
        message=envelope.message;
    }
    if(message.header.msgh_id!=0x4e484450||message.body.msgh_descriptor_count!=1) {
        mach_msg_destroy(&message.header);return false;
    }
    IOSurfaceRef surface=IOSurfaceLookupFromMachPort(message.surface.name);
    mach_port_deallocate(mach_task_self(),message.surface.name);
    if(!surface){_Release(message.frame);return false;}
    ++receivedSurfaces;
    const auto dimensions=targets[0]->GetDescriptor().dimensions;
    if(message.width!=std::max(4,dimensions[0])*4||message.height!=dimensions[1]*2+2) {
        CFRelease(surface);_Release(message.frame);return false;
    }
    std::array<id<MTLTexture>,5> destination;
    for(size_t i=0;i<targets.size();++i)destination[i]=reinterpret_cast<id<MTLTexture>>(targets[i]->GetRawResource());
    const id<MTLDevice> device=destination[0].device;
    id<MTLTexture> depthTarget=destination[1];
    if(linearDepth) {
        if(!_normalizedDepth||_normalizedDepth.width!=depthTarget.width||_normalizedDepth.height!=depthTarget.height) {
            auto description=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatDepth32Float
                width:depthTarget.width height:depthTarget.height mipmapped:NO];
            description.usage=MTLTextureUsageRenderTarget;description.storageMode=MTLStorageModePrivate;
            [_normalizedDepth release];_normalizedDepth=[device newTextureWithDescriptor:description];
        }
        depthTarget=_normalizedDepth;
    }
    auto* metal=dynamic_cast<HgiMetal*>(hgi);
    // Submit outstanding Hgi work first, then use its own queue. Subsequent
    // Hgi draws/readbacks follow this copy without a cross-queue wait cycle.
    metal->CommitPrimaryCommandBuffer(HgiMetal::CommitCommandBuffer_NoWait,true);
    if(!_queue)_queue=[metal->GetQueue() retain];
    if(!_colorCache||_colorCache.width!=destination[0].width||_colorCache.height!=destination[0].height||_colorCache.pixelFormat!=destination[0].pixelFormat) {
        auto description=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:destination[0].pixelFormat
            width:destination[0].width height:destination[0].height mipmapped:NO];
        description.usage=MTLTextureUsageRenderTarget|MTLTextureUsageShaderRead;description.storageMode=MTLStorageModePrivate;
        [_colorCache release];_colorCache=[device newTextureWithDescriptor:description];
    }
    // Generic Hydra display tasks can color-correct and highlight the public
    // color AOV in place. Keep the unprocessed result on the GPU so every
    // Execute can restore it, including redraws after temporal convergence.
    destination[0]=_colorCache;
    const std::array<uint64_t,4> formats{destination[0].pixelFormat,destination[2].pixelFormat,destination[3].pixelFormat,destination[4].pixelFormat};
    if(!_pipeline||formats!=_formats||(linearDepth&&!_linearDepthPipeline)) {
        NSError* error=nil;
        auto library=[device newLibraryWithSource:[NSString stringWithUTF8String:NeedleSurfaceShader] options:nil error:&error];
        if(!library){CFRelease(surface);_Release(message.frame);throw std::runtime_error([[error description] UTF8String]);}
        auto descriptor=[[MTLRenderPipelineDescriptor alloc] init];
        descriptor.vertexFunction=[library newFunctionWithName:@"vertexMain"];
        descriptor.fragmentFunction=[library newFunctionWithName:@"fragmentMain"];
        for(size_t i=0;i<formats.size();++i)descriptor.colorAttachments[i].pixelFormat=MTLPixelFormat(formats[i]);
        descriptor.depthAttachmentPixelFormat=depthTarget.pixelFormat;
        [_pipeline release];_pipeline=[device newRenderPipelineStateWithDescriptor:descriptor error:&error];
        [descriptor.vertexFunction release];[descriptor.fragmentFunction release];[descriptor release];
        if(!_metadataPipeline) {
            auto function=[library newFunctionWithName:@"metadataMain"];
            _metadataPipeline=[device newComputePipelineStateWithFunction:function error:&error];[function release];
        }
        if(linearDepth&&!_linearDepthPipeline) {
            auto linear=[[MTLRenderPipelineDescriptor alloc] init];
            linear.vertexFunction=[library newFunctionWithName:@"vertexMain"];
            linear.fragmentFunction=[library newFunctionWithName:@"linearDepthMain"];
            linear.colorAttachments[0].pixelFormat=MTLPixelFormatR32Float;
            _linearDepthPipeline=[device newRenderPipelineStateWithDescriptor:linear error:&error];
            [linear.vertexFunction release];[linear.fragmentFunction release];[linear release];
        }
        [library release];
        if(!_depthState) {
            auto depthDescriptor=[[MTLDepthStencilDescriptor alloc] init];
            depthDescriptor.depthWriteEnabled=YES;depthDescriptor.depthCompareFunction=MTLCompareFunctionAlways;
            _depthState=[device newDepthStencilStateWithDescriptor:depthDescriptor];[depthDescriptor release];
        }
        if(!_pipeline||!_metadataPipeline||(linearDepth&&!_linearDepthPipeline)){CFRelease(surface);_Release(message.frame);throw std::runtime_error([[error description] UTF8String]);}
        _formats=formats;
    }
    auto descriptor=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA16Float width:message.width height:message.height mipmapped:NO];
    descriptor.usage=MTLTextureUsageShaderRead;
    auto input=[device newTextureWithDescriptor:descriptor iosurface:surface plane:0];
    if(!input){CFRelease(surface);_Release(message.frame);throw std::runtime_error("Cannot import shared IOSurface into host Metal device");}
    auto metadata=[device newBufferWithLength:sizeof(uint32_t)*8 options:MTLResourceStorageModeShared];
    std::memset([metadata contents],0,sizeof(uint32_t)*8);
    const uint32_t validate=getenv("NEEDLE_HYDRA_VALIDATE_CODEC")!=nullptr;
    auto command=[_queue commandBuffer];
    auto compute=[command computeCommandEncoder];
    [compute setComputePipelineState:_metadataPipeline];[compute setTexture:input atIndex:0];[compute setBuffer:metadata offset:0 atIndex:0];
    [compute setBytes:&validate length:sizeof(validate) atIndex:1];
    [compute dispatchThreads:MTLSizeMake(validate?1025:1,1,1) threadsPerThreadgroup:MTLSizeMake(validate?64:1,1,1)];[compute endEncoding];
    auto pass=[MTLRenderPassDescriptor renderPassDescriptor];
    const std::array<size_t,4> order{0,2,3,4};
    for(size_t i=0;i<order.size();++i) {
        pass.colorAttachments[i].texture=destination[order[i]];
        pass.colorAttachments[i].loadAction=MTLLoadActionClear;pass.colorAttachments[i].storeAction=MTLStoreActionStore;
        pass.colorAttachments[i].clearColor=i==0?MTLClearColorMake(0,0,0,0):MTLClearColorMake(-1,0,0,0);
    }
    pass.depthAttachment.texture=depthTarget;pass.depthAttachment.loadAction=MTLLoadActionClear;
    pass.depthAttachment.storeAction=MTLStoreActionStore;pass.depthAttachment.clearDepth=1;
    auto encoder=[command renderCommandEncoderWithDescriptor:pass];
    [encoder setRenderPipelineState:_pipeline];[encoder setDepthStencilState:_depthState];[encoder setFragmentTexture:input atIndex:0];
    [encoder drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];[encoder endEncoding];
    if(linearDepth) {
        auto linear=[MTLRenderPassDescriptor renderPassDescriptor];
        linear.colorAttachments[0].texture=destination[1];
        linear.colorAttachments[0].loadAction=MTLLoadActionClear;linear.colorAttachments[0].storeAction=MTLStoreActionStore;
        auto output=[command renderCommandEncoderWithDescriptor:linear];
        [output setRenderPipelineState:_linearDepthPipeline];[output setFragmentTexture:input atIndex:0];
        [output drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];[output endEncoding];
    }
    auto weak=weak_from_this();const uint64_t lease=message.frame;
    [command addCompletedHandler:^(id<MTLCommandBuffer> completed) {
        const auto values=static_cast<uint32_t const*>([metadata contents]);
        if(auto owner=weak.lock()) {
            if(getenv("NEEDLE_HYDRA_TRACE")&&(owner->receivedSurfaces.load()<5||values[2]))fprintf(stderr,"GPU metadata %u %u %u %u status %ld\n",values[0],values[1],values[2],values[3],long(completed.status));
            if(completed.status==MTLCommandBufferStatusCompleted&&values[3]==0x4e484447u&&values[4]==0) {
                {std::lock_guard<std::mutex> lock(owner->_mutex);
                    ++owner->presentedSurfaces;
                    owner->surfaceCodecTests+=values[5];
                    if(values[0]>owner->_displayedScene.load()||
                       (values[0]==owner->_displayedScene.load()&&values[1]>=owner->_samples.load())) {
                        owner->_displayedScene.store(values[0]);owner->_samples.store(values[1]);owner->_sampleConverged.store(values[2]!=0);
                    }
                }
                owner->_Release(lease,values[0],values[1],values[2]!=0);
            } else {
                if(values[3]!=0) {
                    std::lock_guard<std::mutex> lock(owner->_mutex);
                    owner->_error="Shared surface metadata mismatch: "+std::to_string(values[0])+","+std::to_string(values[1])+","+std::to_string(values[2])+","+std::to_string(values[3]);
                    if(values[4]){owner->surfaceCodecErrors+=values[4];owner->_error="Shared surface payload precision failure: "+std::to_string(values[4])+" code values, index "+std::to_string(values[6])+" actual "+std::to_string(values[7]);fprintf(stderr,"%s\n",owner->_error.c_str());}
                }
                owner->_Release(lease);
            }
        }
        CFRelease(surface);[metadata release];
    }];
    [command commit];++readbackGeneration;[input release];
    return IsConverged();
}

void NeedleTransport::RestoreColor(HgiTextureHandle const& target) {
    std::lock_guard<std::recursive_mutex> lock(gpuMutex);
    if(!_colorCache||!target)return;
    const auto destination=reinterpret_cast<id<MTLTexture>>(target->GetRawResource());
    if(destination.width!=_colorCache.width||destination.height!=_colorCache.height||destination.pixelFormat!=_colorCache.pixelFormat)return;
    auto* metal=dynamic_cast<HgiMetal*>(hgi);
    metal->CommitPrimaryCommandBuffer(HgiMetal::CommitCommandBuffer_NoWait,true);
    auto command=[_queue commandBuffer];
    auto blit=[command blitCommandEncoder];
    [blit copyFromTexture:_colorCache sourceSlice:0 sourceLevel:0 sourceOrigin:MTLOriginMake(0,0,0)
        sourceSize:MTLSizeMake(destination.width,destination.height,1) toTexture:destination
        destinationSlice:0 destinationLevel:0 destinationOrigin:MTLOriginMake(0,0,0)];
    [blit endEncoding];[command commit];
}

void NeedleTransport::SetTargets(std::array<HgiTextureHandle,5> const& targets) {
    std::lock_guard<std::recursive_mutex> lock(gpuMutex);
    if(_targets!=targets){_targets=targets;_lastFrame.clear();}
}
void NeedleTransport::ForgetTexture(HgiTextureHandle const& texture) {
    std::lock_guard<std::recursive_mutex> lock(gpuMutex);
    for(const auto& target:_targets)if(target&&target==texture){_targets={};break;}
}
void NeedleTransport::Pump() {
    // AOV hosts can poll/resolve buffers without executing another render pass.
    // Their Null/foreign Hgi leaves this Metal device entirely delegate-owned.
    // Drain asynchronous GPU frames during those polls so convergence and the
    // final temporal sample cannot depend on another viewport interaction.
    if(directGpuHandoff)return;
    std::lock_guard<std::recursive_mutex> lock(gpuMutex);
    if(!_targets[0])return;
    Poll();if(!Error().empty())return;
    const auto before=readbackGeneration.load();
    Present(_targets,false);
    if(readbackGeneration.load()!=before)RestoreColor(_targets[0]);
}
PXR_NAMESPACE_CLOSE_SCOPE
