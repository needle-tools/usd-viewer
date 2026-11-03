// HdLight state feeds the browser delegate's existing photometry and dome code.
class NeedleLight final : public HdLight {
public:
    NeedleLight(TfToken const& type,SdfPath const& id,std::shared_ptr<NeedleTransport> state)
        : HdLight(id),_type(type),_state(std::move(state)) {
        _state->Command("delegate","","createSPrim",{JsValue(type.GetString()),JsValue(id.GetString())});
    }
    HdDirtyBits GetInitialDirtyBitsMask() const override { return AllDirty; }
    void Sync(HdSceneDelegate* delegate,HdRenderParam*,HdDirtyBits* bits) override {
        const auto& id=GetId();
        auto parameter=[&](char const* key){return delegate->GetLightParamValue(id,TfToken(key));};
        auto number=[&](char const* key,float fallback){const auto value=parameter(key);return value.IsEmpty()?fallback:VtValue::Cast<float>(value).GetWithDefault<float>(fallback);};
        auto color=parameter("color").GetWithDefault<GfVec3f>(GfVec3f(1));
        if(parameter("enableColorTemperature").GetWithDefault<bool>(false)) {
            const auto temperature=UsdLuxBlackbodyTemperatureAsRgb(number("colorTemperature",6500));
            color=GfCompMult(color,temperature);
        }
        const auto exposure=number("exposure",0);
        JsObject data{{"id",JsValue(id.GetString())},{"typeId",JsValue(_type.GetString())},
            {"visible",JsValue(delegate->GetVisible(id))},{"transform",NeedleMatrix(delegate->GetTransform(id))},
            {"color",Convert(VtValue(color))},{"intensity",JsValue(number("intensity",1)*std::pow(2.f,exposure))},
            {"exposure",JsValue(exposure)},{"radius",JsValue(number("radius",.25f))},
            {"width",JsValue(number("width",1))},{"height",JsValue(number("height",1))},
            {"length",JsValue(number("length",1))},{"angle",JsValue(number("angle",.53f))},
            {"coneAngle",JsValue(number("shaping:cone:angle",180))},{"coneSoftness",JsValue(number("shaping:cone:softness",0))},
            {"focus",JsValue(number("shaping:focus",0))},{"normalize",Convert(parameter("normalize"))}};
        const auto texture=parameter("texture:file");
        if(texture.IsHolding<SdfAssetPath>()) {
            const auto& asset=texture.UncheckedGet<SdfAssetPath>();
            data["textureFile"]=JsValue(asset.GetAssetPath());data["textureResolvedPath"]=JsValue(asset.GetResolvedPath());
        }
        data["textureFormat"]=Convert(parameter("texture:format"));
        // Hydra 2 scene indices expose the same visibility switch per light.
        data["cameraVisibility"]=Convert(parameter("cameraVisibility"));
        _state->Command("sprim",id.GetString(),"updateLightState",{JsValue(data)});
        *bits=Clean;
    }
private:TfToken _type;std::shared_ptr<NeedleTransport> _state;
};
