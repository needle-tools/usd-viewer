#include "transport.h"
#include "pxr/base/tf/registryManager.h"
#include "pxr/base/tf/type.h"
#include "pxr/base/gf/quatd.h"
#include "pxr/base/arch/align.h"
#include "pxr/imaging/hd/rendererPlugin.h"
#include "pxr/imaging/hd/rendererPluginRegistry.h"
#include "pxr/imaging/hd/renderPass.h"
#include "pxr/imaging/hd/renderPassState.h"
#include "pxr/imaging/hd/renderBuffer.h"
#include "pxr/imaging/hd/renderIndex.h"
#include "pxr/imaging/hd/mesh.h"
#include "pxr/imaging/hd/meshUtil.h"
#include "pxr/imaging/hd/vtBufferSource.h"
#include "pxr/imaging/hd/smoothNormals.h"
#include "pxr/imaging/hd/vertexAdjacency.h"
#include "pxr/imaging/pxOsd/tokens.h"
#include "pxr/imaging/pxOsd/refinerFactory.h"
#include <opensubdiv/far/primvarRefiner.h>
#include "pxr/usd/usdLux/blackbody.h"
#include "pxr/imaging/hd/instancer.h"
#include "pxr/imaging/hd/material.h"
#include "pxr/imaging/hd/camera.h"
#include "pxr/imaging/hd/light.h"
#include "pxr/imaging/hd/resourceRegistry.h"
#include "pxr/imaging/hd/sceneDelegate.h"
#include "pxr/imaging/hd/tokens.h"
#include "pxr/imaging/hd/driver.h"
#include "pxr/imaging/hd/sceneIndexPlugin.h"
#include "pxr/imaging/hd/sceneIndexPluginRegistry.h"
#include "pxr/imaging/hd/sceneGlobalsSchema.h"
#include "pxr/imaging/hd/meshSchema.h"
#include "pxr/imaging/hd/subdivisionTagsSchema.h"
#include "pxr/imaging/hd/retainedDataSource.h"
#include "pxr/imaging/hd/overlayContainerDataSource.h"
#include "pxr/imaging/hd/legacyTaskSchema.h"
#include "pxr/imaging/hd/legacyTaskFactory.h"
#include "pxr/imaging/hdx/colorizeSelectionTask.h"
#include "pxr/imaging/hdx/selectionTracker.h"
#include "pxr/imaging/hdx/tokens.h"
#include "pxr/imaging/hdsi/implicitSurfaceSceneIndex.h"
#include "pxr/imaging/hgi/tokens.h"
#include "pxr/imaging/hgi/texture.h"
#include "pxr/imaging/hgi/capabilities.h"
#include "pxr/imaging/hgi/blitCmds.h"
#include "pxr/imaging/hgi/blitCmdsOps.h"
#include "pxr/usd/sdf/assetPath.h"
#include "webMaterialX.h"
#include <MaterialXFormat/XmlIo.h>
#include <map>
#include <algorithm>
#include <cmath>
#include <array>
#include <type_traits>
#include <fstream>
#include <cstring>
#include <stdexcept>
#include <functional>

PXR_NAMESPACE_OPEN_SCOPE
#include "webInstancer.h"

static JsValue Convert(VtValue const& value){
    if(value.IsEmpty())return JsValue();
#define SCALAR(T) if(value.IsHolding<T>())return JsValue(value.UncheckedGet<T>());
    SCALAR(bool) SCALAR(int) SCALAR(int64_t) SCALAR(uint64_t) SCALAR(float) SCALAR(double) SCALAR(std::string)
#undef SCALAR
    if(value.IsHolding<long>())return JsValue(int64_t(value.UncheckedGet<long>()));
    if(value.IsHolding<unsigned long>())return JsValue(uint64_t(value.UncheckedGet<unsigned long>()));
    if(value.IsHolding<TfToken>())return JsValue(value.UncheckedGet<TfToken>().GetString());
    if(value.IsHolding<SdfAssetPath>()){const auto& path=value.UncheckedGet<SdfAssetPath>();return JsValue(path.GetAssetPath());}
    if(value.IsHolding<VtDictionary>()){JsObject object;for(auto const& entry:value.UncheckedGet<VtDictionary>())object[entry.first]=Convert(entry.second);return JsValue(object);}
#define VECTOR(T) if(value.IsHolding<T>()){JsArray array;const auto& v=value.UncheckedGet<T>();for(int i=0;i<T::dimension;++i)array.emplace_back(double(v[i]));return JsValue(array);}
    VECTOR(GfVec2f) VECTOR(GfVec3f) VECTOR(GfVec4f) VECTOR(GfVec2d) VECTOR(GfVec3d) VECTOR(GfVec4d)
#undef VECTOR
#define ARRAY(T) if(value.IsHolding<VtArray<T>>()){JsArray array;for(auto const& entry:value.UncheckedGet<VtArray<T>>())array.push_back(Convert(VtValue(entry)));return JsValue(array);}
    ARRAY(float) ARRAY(double) ARRAY(int) ARRAY(GfVec2f) ARRAY(GfVec3f) ARRAY(GfVec4f) ARRAY(GfVec2d) ARRAY(GfVec3d) ARRAY(GfVec4d) ARRAY(TfToken) ARRAY(std::string)
#undef ARRAY
    return JsValue();
}
class NeedleBuffer final:public HdRenderBuffer{
public:
    NeedleBuffer(SdfPath const& id,std::shared_ptr<NeedleTransport> state):HdRenderBuffer(id),state(state){}
    ~NeedleBuffer()override{_Deallocate();}
    bool Allocate(GfVec3i const& dimensions,HdFormat f,bool multisampled)override{
        std::lock_guard<std::recursive_mutex> lock(state->gpuMutex);
        _Deallocate();if(!state->hgi||multisampled||dimensions[0]<=0||dimensions[1]<=0)return false;
        size=dimensions;format=f;depthLinear=state->linearDepth;HgiTextureDesc desc;desc.debugName="Needle GPU AOV";desc.dimensions=dimensions;
        if(f==HdFormatFloat32)desc.format=HgiFormatFloat32;
        else if(f==HdFormatInt32)desc.format=HgiFormatInt32;
        else if(f==HdFormatFloat32Vec4)desc.format=HgiFormatFloat32Vec4;
        else if(f==HdFormatFloat16Vec4)desc.format=HgiFormatFloat16Vec4;
        else return false;
        desc.usage=HgiTextureUsageBitsShaderRead|(f==HdFormatFloat32&&!depthLinear?HgiTextureUsageBitsDepthTarget:HgiTextureUsageBitsColorTarget);
        texture=state->hgi->CreateTexture(desc);return bool(texture);
    }
    unsigned GetWidth()const override{return size[0];}unsigned GetHeight()const override{return size[1];}unsigned GetDepth()const override{return size[2];}
    HdFormat GetFormat()const override{return format;}bool IsMultiSampled()const override{return false;}
    void* Map()override{
        std::lock_guard<std::recursive_mutex> lock(state->gpuMutex);
        EnsureDepthStyle();
        state->Pump();
        ++state->mapAttempts;
        if(const auto required=getenv("NEEDLE_HYDRA_REQUIRE_GPU_HANDOFF");required&&std::string(required)=="1"&&(format==HdFormatFloat16Vec4||format==HdFormatFloat32Vec4)){
            TF_RUNTIME_ERROR("Needle: host requested CPU mapping while GPU handoff is required");return nullptr;
        }
        const size_t bytes=size[0]*size[1]*HdDataSizeOfFormat(format);
        const auto alignment=state->hgi->GetCapabilities()->GetPageSizeAlignment();
        const auto alignedBytes=(bytes+alignment-1)&~(alignment-1);
        if(alignedBytes!=pixelBytes){
            pixels.reset(static_cast<uint8_t*>(ArchAlignedAlloc(alignment,alignedBytes)));pixelBytes=alignedBytes;
            std::memset(pixels.get(),0,pixelBytes);
            if(format==HdFormatInt32)std::fill_n(reinterpret_cast<int32_t*>(pixels.get()),size[0]*size[1],-1);
            if(format==HdFormatFloat32)std::fill_n(reinterpret_cast<float*>(pixels.get()),size[0]*size[1],depthLinear?0.f:1.f);
        }
        const auto surface = state->readbackGeneration.load();
        if(texture&&surface>0&&surface!=mappedSurface){
            HgiTextureGpuToCpuOp operation;operation.gpuSourceTexture=texture;
            operation.cpuDestinationBuffer=pixels.get();operation.destinationBufferByteSize=pixelBytes;
            auto commands=state->hgi->CreateBlitCmds();commands->CopyTextureGpuToCpu(operation);
            state->hgi->SubmitCmds(commands.get(),HgiSubmitWaitTypeWaitUntilCompleted);
            ++state->cpuReadbacks;
            if(getenv("NEEDLE_HYDRA_TRACE"))fprintf(stderr,"Needle map %s %u x %u format %d surface %llu sample %u converged %d\n",GetId().GetText(),GetWidth(),GetHeight(),int(format),(unsigned long long)surface,state->Samples(),state->IsConverged());
            mappedSurface=surface;
        }
        mapped=true;return pixels.get();
    }
    void Unmap()override{mapped=false;}bool IsMapped()const override{return mapped;}void Resolve()override{state->Pump();}
    bool IsConverged()const override{state->Pump();return !state->Error().empty()||state->IsConverged();}
    VtValue GetResource(bool)const override{return state->directGpuHandoff?VtValue(texture):VtValue();}
    void EnsureDepthStyle() {
        std::lock_guard<std::recursive_mutex> lock(state->gpuMutex);
        if(format==HdFormatFloat32&&depthLinear!=state->linearDepth.load()) {
            const auto dimensions=size;const auto f=format;Allocate(dimensions,f,false);
        }
    }
    void _Deallocate()override{std::lock_guard<std::recursive_mutex> lock(state->gpuMutex);if(texture&&state->hgi){state->ForgetTexture(texture);state->hgi->DestroyTexture(&texture);}pixels.reset();pixelBytes=0;mappedSurface=0;}
    HgiTextureHandle texture;
private:
    struct AlignedDelete{void operator()(uint8_t* value)const{ArchAlignedFree(value);}};
    std::shared_ptr<NeedleTransport> state;GfVec3i size{0};HdFormat format=HdFormatInvalid;
    std::unique_ptr<uint8_t,AlignedDelete> pixels;size_t pixelBytes=0;uint64_t mappedSurface=0;bool mapped=false,depthLinear=false;
};
#include "subdivision.h"
#include "mesh.h"
#include "light.h"
#include "materialx.h"
class NeedleMaterial final:public HdMaterial{
public:
    NeedleMaterial(SdfPath const& id,std::shared_ptr<NeedleTransport> state):HdMaterial(id),state(state){state->Command("delegate","","createSPrim",{JsValue("material"),JsValue(id.GetString())});}
    HdDirtyBits GetInitialDirtyBitsMask()const override{return AllDirty;}
    void Sync(HdSceneDelegate* delegate,HdRenderParam*,HdDirtyBits* bits)override{
        const auto value=delegate->GetMaterialResource(GetId());
        auto send=[&](char const* method,JsArray args){state->Command("sprim",GetId().GetString(),method,std::move(args));};
        send("beginMaterialSync",{});
        // The legacy imaging delegate returns an empty resource when the host
        // disables scene materials. Retire the previous shader as well.
        if(!value.IsHolding<HdMaterialNetworkMap>()||value.UncheckedGet<HdMaterialNetworkMap>().map.empty()){
            send("clearMaterial",{});*bits=Clean;return;
        }
        NeedleMaterialX(value.UncheckedGet<HdMaterialNetworkMap>(),GetId(),state);
        for(auto const& entry:value.UncheckedGet<HdMaterialNetworkMap>().map){
            for(auto const& node:entry.second.nodes){
                JsObject parameters{{"identifier",JsValue(node.identifier.GetString())},{"path",JsValue(node.path.GetString())}};
                for(auto const& parameter:node.parameters){parameters[parameter.first.GetString()]=Convert(parameter.second);
                    if(parameter.second.IsHolding<SdfAssetPath>()){const auto asset=parameter.second.UncheckedGet<SdfAssetPath>();parameters[parameter.first.GetString()+":resolvedPath"]=JsValue(asset.GetResolvedPath());}}
                if(node.identifier==TfToken("needle:MdlSurface")){auto document=node.parameters.find(TfToken("document"));if(document!=node.parameters.end())send("updateMdlMaterial",{Convert(document->second)});}
                else send("updateNode",{JsValue(entry.first.GetString()),JsValue(node.path.GetString()),JsValue(parameters)});
            }
            JsArray relationships;for(auto const& relationship:entry.second.relationships)relationships.emplace_back(JsObject{
                {"inputId",JsValue(relationship.inputId.GetString())},{"inputName",JsValue(relationship.inputName.GetString())},
                {"outputId",JsValue(relationship.outputId.GetString())},{"outputName",JsValue(relationship.outputName.GetString())}});
            send("updateFinished",{JsValue(entry.first.GetString()),JsValue(relationships)});
        }
        *bits=Clean;
    }
private:std::shared_ptr<NeedleTransport> state;
};
// Hosts may recreate render passes while polling a progressive render. Keep
// missing AOV attachments alive across those passes so replacement of a private
// element-ID buffer does not restart an otherwise unchanged temporal frame.
struct NeedlePrivateAovs {
    std::array<std::unique_ptr<NeedleBuffer>,5> buffers;
    uint64_t capturedSerial=0;
};
class NeedlePass final : public HdRenderPass {
public:
    NeedlePass(HdRenderIndex* index,HdRprimCollection const& collection,std::shared_ptr<NeedleTransport> state,std::shared_ptr<NeedlePrivateAovs> privateAovs)
        : HdRenderPass(index,collection),_state(std::move(state)),_privateAovs(std::move(privateAovs)) {}
    bool IsConverged() const override { _state->Pump();return !_state->Error().empty() || _state->IsConverged(); }
protected:
    void _Execute(HdRenderPassStateSharedPtr const& pass,TfTokenVector const& renderTags) override {
        std::lock_guard<std::recursive_mutex> lock(_state->gpuMutex);
        if(!_tagsSent||renderTags!=_lastTags) {
            JsArray purposes;for(const auto& tag:renderTags)purposes.emplace_back(tag.GetString());
            if(purposes.empty())for(const auto purpose:{"default","render","proxy","guide"})purposes.emplace_back(purpose);
            _state->Command("delegate","","setIncludedPurposes",{JsValue(purposes)});
            _lastTags=renderTags;_tagsSent=true;
        }
        const std::array<TfToken,5> names{HdAovTokens->color,HdAovTokens->depth,HdAovTokens->primId,HdAovTokens->instanceId,HdAovTokens->elementId};
        const std::array<HdFormat,5> formats{HdFormatFloat16Vec4,HdFormatFloat32,HdFormatInt32,HdFormatInt32,HdFormatInt32};
        std::array<NeedleBuffer*,5> buffers{};
        unsigned width=0,height=0;
        for(const auto& binding:pass->GetAovBindings()) {
            auto* buffer=dynamic_cast<NeedleBuffer*>(binding.renderBuffer);
            if(!buffer&&!binding.renderBufferId.IsEmpty())buffer=dynamic_cast<NeedleBuffer*>(GetRenderIndex()->GetBprim(HdPrimTypeTokens->renderBuffer,binding.renderBufferId));
            if(!buffer)continue;
            for(size_t i=0;i<names.size();++i)if(binding.aovName==names[i]){buffers[i]=buffer;width=buffer->GetWidth();height=buffer->GetHeight();}
        }
        if(!width||!height)return;
        std::array<HgiTextureHandle,5> targets;
        for(size_t i=0;i<buffers.size();++i) {
            if(!buffers[i]) {
                auto& buffer=_privateAovs->buffers[i];
                if(!buffer)buffer=std::make_unique<NeedleBuffer>(SdfPath(),_state);
                if(buffer->GetWidth()!=width||buffer->GetHeight()!=height)
                    buffer->Allocate(GfVec3i(width,height,1),formats[i],false);
                buffers[i]=buffer.get();
            }
            buffers[i]->EnsureDepthStyle();
            targets[i]=buffers[i]->texture;
        }
        _state->SetTargets(targets);
        if(!_state->Frame(width,height,pass->GetWorldToViewMatrix(),pass->GetProjectionMatrix())) {
            TF_RUNTIME_ERROR("Needle renderer: %s",_state->Error().c_str());return;
        }
        try {
            const bool converged=_state->Present(targets);
            _state->RestoreColor(targets[0]);
            if(converged&&_privateAovs->capturedSerial!=_state->SceneSerial())if(const auto prefix=getenv("NEEDLE_HYDRA_CAPTURE")) {
                for(size_t i=0;i<buffers.size();++i) {
                    auto* buffer=buffers[i];
                    const auto bytes=size_t(width)*height*HdDataSizeOfFormat(buffer->GetFormat());
                    std::ofstream file(std::string(prefix)+"-"+names[i].GetString()+".bin",std::ios::binary);
                    auto* pixels=static_cast<char*>(buffer->Map());
                    if(!pixels)throw std::runtime_error("CPU AOV capture was rejected by the render buffer");
                    file.write(pixels,bytes);buffer->Unmap();
                }
                _privateAovs->capturedSerial=_state->SceneSerial();
            }
        } catch(const std::exception& error) { TF_RUNTIME_ERROR("Needle GPU interop: %s",error.what()); }
    }
private:
    std::shared_ptr<NeedleTransport> _state;
    std::shared_ptr<NeedlePrivateAovs> _privateAovs;
    TfTokenVector _lastTags;bool _tagsSent=false;
};
class NeedleDelegate final:public HdRenderDelegate{
public:
    explicit NeedleDelegate(HdRenderSettingsMap const& settings={}):HdRenderDelegate(settings),state(std::make_shared<NeedleTransport>()),registry(std::make_shared<HdResourceRegistry>()) {
        _PopulateDefaultSettings(GetRenderSettingDescriptors());_PushSettings();
    }
    HdRenderSettingDescriptorList GetRenderSettingDescriptors()const override {
        HdRenderSettingDescriptorList result{{"Screen-space GI",TfToken("needle:ssgi"),VtValue(true)},
                {"Temporal samples",TfToken("needle:samples"),VtValue(32)},
                {"Fallback HDR environment",TfToken("needle:environment"),VtValue(true)},
                {"Tone mapping",TfToken("needle:toneMapping"),VtValue(std::string(std::string(NEEDLE_HOST_NAME)=="usdview"?"needle-agx":"none"))},
                {"Exposure",TfToken("needle:exposure"),VtValue(1.f)}};
        if(std::string(NEEDLE_HOST_NAME)=="houdini")
            result.push_back({"Solaris linear depth",TfToken("needle:linearDepth"),VtValue(false)});
        return result;
    }
    void SetRenderSetting(TfToken const& key,VtValue const& value)override {
        if(GetRenderSetting(key)==value)return;
        HdRenderDelegate::SetRenderSetting(key,value);
        if(key.GetString().rfind("needle:",0)==0||key==HdRenderSettingsTokens->domeLightCameraVisibility)_PushSettings();
    }
    TfTokenVector GetRenderSettingsNamespaces()const override{return {TfToken("needle")};}
    void SetDrivers(HdDriverVector const& drivers)override{
        Hgi* host=nullptr;for(auto driver:drivers)if(driver->name==HgiTokens->renderDriver&&driver->driver.IsHolding<Hgi*>())host=driver->driver.UncheckedGet<Hgi*>();
        if(getenv("NEEDLE_HYDRA_TRACE"))fprintf(stderr,"Needle host graphics API: %s\n",host?host->GetAPIName().GetText():"no Hgi driver");
        if(host&&host->GetAPIName()==TfToken("Metal")){state->hgi=host;state->directGpuHandoff=true;}
        else{ownedHgi=Hgi::CreateNamedHgi(TfToken("Metal"));state->hgi=ownedHgi.get();state->directGpuHandoff=false;}
    }
    const TfTokenVector& GetSupportedRprimTypes()const override{static TfTokenVector types{HdPrimTypeTokens->mesh};return types;}
    const TfTokenVector& GetSupportedSprimTypes()const override{static TfTokenVector types{HdPrimTypeTokens->camera,HdPrimTypeTokens->material,HdPrimTypeTokens->distantLight,HdPrimTypeTokens->sphereLight,HdPrimTypeTokens->rectLight,HdPrimTypeTokens->diskLight,HdPrimTypeTokens->cylinderLight,HdPrimTypeTokens->domeLight};return types;}
    const TfTokenVector& GetSupportedBprimTypes()const override{static TfTokenVector types{HdPrimTypeTokens->renderBuffer};return types;}
    TfTokenVector GetMaterialRenderContexts()const override{return {TfToken("mtlx"),TfToken()};}
    TfTokenVector GetShaderSourceTypes()const override{return GetMaterialRenderContexts();}
    HdRenderParam* GetRenderParam()const override{return state.get();}
    HdResourceRegistrySharedPtr GetResourceRegistry()const override{return registry;}
    HdRenderPassSharedPtr CreateRenderPass(HdRenderIndex* index,HdRprimCollection const& collection)override{return std::make_shared<NeedlePass>(index,collection,state,privateAovs);}
    HdInstancer* CreateInstancer(HdSceneDelegate* delegate,SdfPath const& id)override{return new HdNeedleInstancer(delegate,id);}
    void DestroyInstancer(HdInstancer* instancer)override{delete instancer;}
    HdRprim* CreateRprim(TfToken const&,SdfPath const& id)override{return new NeedleMesh(id,state);}
    void DestroyRprim(HdRprim* prim)override{state->Command("delegate","","destroyRPrim",{JsValue(prim->GetId().GetString())});delete prim;}
    HdSprim* CreateSprim(TfToken const& type,SdfPath const& id)override{if(type==HdPrimTypeTokens->camera)return new HdCamera(id);if(type==HdPrimTypeTokens->material)return new NeedleMaterial(id,state);return new NeedleLight(type,id,state);}
    HdSprim* CreateFallbackSprim(TfToken const& type)override{return CreateSprim(type,SdfPath());}
    void DestroySprim(HdSprim* prim)override{state->Command("delegate","","destroySPrim",{JsValue(prim->GetId().GetString())});delete prim;}
    HdBprim* CreateBprim(TfToken const&,SdfPath const& id)override{return new NeedleBuffer(id,state);}
    HdBprim* CreateFallbackBprim(TfToken const& type)override{return CreateBprim(type,SdfPath());}
    void DestroyBprim(HdBprim* prim)override{delete prim;}
    void CommitResources(HdChangeTracker*)override{}
    HdAovDescriptor GetDefaultAovDescriptor(TfToken const& name)const override{
        if(name==HdAovTokens->color)return HdAovDescriptor(HdFormatFloat16Vec4,false,VtValue(GfVec4f(0)));
        if(name==HdAovTokens->depth)return HdAovDescriptor(HdFormatFloat32,false,VtValue(state->linearDepth?0.f:1.f));
        if(name==HdAovTokens->primId||name==HdAovTokens->instanceId||name==HdAovTokens->elementId)
            return HdAovDescriptor(HdFormatInt32,false,VtValue(-1));
        return HdAovDescriptor();
    }
    VtDictionary GetRenderStats()const override {
        state->Pump();
        return {{"percentDone",VtValue(state->IsConverged()?100.:0.)},
                {"fractionDone",VtValue(state->IsConverged()?1.:0.)},
                {"huskErrorStatus",VtValue(state->Error().empty()?0:1)},
                {"needle:lastError",VtValue(state->Error())},
                {"needle:ssgiEnabled",GetRenderSetting(TfToken("needle:ssgi"))},
                {"needle:linearDepth",VtValue(state->linearDepth.load())},
                {"needle:samples",VtValue(int(state->Samples()))},
                {"needle:surfaceCodecTests",VtValue(double(state->surfaceCodecTests.load()))},
                {"needle:surfaceCodecErrors",VtValue(double(state->surfaceCodecErrors.load()))},
                {"needle:framebufferMapAttempts",VtValue(double(state->mapAttempts.load()))},
                {"needle:cpuReadbacks",VtValue(double(state->cpuReadbacks.load()))},
                {"needle:gpuSurfacesReceived",VtValue(double(state->receivedSurfaces.load()))},
                {"needle:gpuSurfacesPresented",VtValue(double(state->presentedSurfaces.load()))}};
    }
private:
    void _PushSettings() {
        std::lock_guard<std::recursive_mutex> lock(state->gpuMutex);
        const auto linear=Convert(GetRenderSetting(TfToken("needle:linearDepth")));
        state->linearDepth=linear.IsBool()?linear.GetBool():linear.IsInt()?linear.GetInt()!=0:false;
        JsObject settings;
        for(const auto& descriptor:GetRenderSettingDescriptors())
            settings[descriptor.key.GetString().substr(7)]=Convert(GetRenderSetting(descriptor.key));
        settings["domeLightCameraVisibility"]=JsValue(GetRenderSetting(HdRenderSettingsTokens->domeLightCameraVisibility).GetWithDefault<bool>(true));
        state->Command("native","","settings",{JsValue(settings)});
    }
    HgiUniquePtr ownedHgi;std::shared_ptr<NeedleTransport> state;HdResourceRegistrySharedPtr registry;
    std::shared_ptr<NeedlePrivateAovs> privateAovs=std::make_shared<NeedlePrivateAovs>();
};
class HdNeedleRendererPlugin final:public HdRendererPlugin{
public:HdRenderDelegate* CreateRenderDelegate()override{return new NeedleDelegate;}
    HdRenderDelegate* CreateRenderDelegate(HdRenderSettingsMap const& settings)override{return new NeedleDelegate(settings);}
    void DeleteRenderDelegate(HdRenderDelegate* delegate)override{delete delegate;}
    #if PXR_VERSION >= 2605
    bool IsSupported(HdRendererCreateArgs const& args,std::string* reason=nullptr)const override{const bool supported=args.gpuEnabled;if(!supported&&reason)*reason="The native experiment requires Metal";return supported;}
#else
    bool IsSupported(bool gpuEnabled=true)const override{return gpuEnabled;}
#endif
};
#include "selection.h"
#include "subdivision-scene-index.h"
class HdNeedleSceneIndexPlugin final:public HdSceneIndexPlugin {
protected:HdSceneIndexBaseRefPtr _AppendSceneIndex(HdSceneIndexBaseRefPtr const& input,HdContainerDataSourceHandle const&)override {
    auto mesh=HdRetainedTypedSampledDataSource<TfToken>::New(HdsiImplicitSurfaceSceneIndexTokens->toMesh);
    auto implicit=HdsiImplicitSurfaceSceneIndex::New(input,HdRetainedContainerDataSource::New(
        HdPrimTypeTokens->sphere,mesh,HdPrimTypeTokens->cube,mesh,HdPrimTypeTokens->cone,mesh,
        HdPrimTypeTokens->cylinder,mesh,HdPrimTypeTokens->capsule,mesh,HdPrimTypeTokens->plane,mesh));
    // Temporary USD notification workaround; see subdivision-scene-index.h
    // for the upstream source fix and removal criteria.
    return NeedleSelectionSceneIndex::New(NeedleSubdivisionSceneIndex::New(implicit));
}};
TF_REGISTRY_FUNCTION(TfType){HdRendererPluginRegistry::Define<HdNeedleRendererPlugin>();HdSceneIndexPluginRegistry::Define<HdNeedleSceneIndexPlugin>();}
TF_REGISTRY_FUNCTION(HdSceneIndexPlugin){HdSceneIndexPluginRegistry::GetInstance().RegisterSceneIndexForRenderer(
    "Needle Three.js WebGPU",TfToken("HdNeedleSceneIndexPlugin"),nullptr,0,HdSceneIndexPluginRegistry::InsertionOrderAtStart);}
PXR_NAMESPACE_CLOSE_SCOPE
