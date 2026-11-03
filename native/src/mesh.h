// Included inside the host USD namespace. All scene data comes from Hydra.
class NeedleMesh final : public HdMesh {
public:
    NeedleMesh(SdfPath const& id, std::shared_ptr<NeedleTransport> state)
        : HdMesh(id), _state(std::move(state)) {
        _state->Command("delegate", "", "createRPrim", {JsValue("mesh"), JsValue(id.GetString()), JsValue("")});
    }

    HdDirtyBits GetInitialDirtyBitsMask() const override {
        return HdChangeTracker::AllSceneDirtyBits & ~HdChangeTracker::Varying;
    }

    void Sync(HdSceneDelegate* delegate, HdRenderParam*, HdDirtyBits* bits, TfToken const& repr) override {
        const auto& id = GetId();
        _UpdateVisibility(delegate, bits); _UpdateInstancer(delegate, bits);
        _state->Command("native", id.GetString(), "identity", {JsValue(GetPrimId())});
        const bool topologyDirty = HdChangeTracker::IsTopologyDirty(*bits, id);
        const bool pointsDirty = HdChangeTracker::IsPrimvarDirty(*bits, id, HdTokens->points);
        const bool primvarsDirty = HdChangeTracker::IsAnyPrimvarDirty(*bits, id);
        const auto style = delegate->GetDisplayStyle(id);
        const bool geometryDirty = topologyDirty || pointsDirty || primvarsDirty ||
            (*bits & (HdChangeTracker::DirtyDisplayStyle|HdChangeTracker::DirtySubdivTags));
        if (topologyDirty) _topology = delegate->GetMeshTopology(id);
        if (topologyDirty || (*bits & HdChangeTracker::DirtySubdivTags))
            _topology.SetSubdivTags(delegate->GetSubdivTags(id));
        if (geometryDirty) {
            std::vector<TfToken> names;
            std::vector<VtIntArray> channels;
            for (const auto& descriptor:GetPrimvarDescriptors(delegate,HdInterpolationFaceVarying)) {
                VtIntArray indices;
                const auto value=descriptor.indexed?GetIndexedPrimvar(delegate,descriptor.name,&indices):GetPrimvar(delegate,descriptor.name);
                if (!value.IsArrayValued() || !value.GetArraySize()) continue;
                if (indices.empty()) {
                    indices.resize(_topology.GetFaceVertexIndices().size());
                    for(size_t i=0;i<indices.size();++i)indices[i]=int(i);
                }
                if(indices.size()!=_topology.GetFaceVertexIndices().size()||
                   std::any_of(indices.begin(),indices.end(),[&](int i){return i<0||size_t(i)>=value.GetArraySize();}))continue;
                names.push_back(descriptor.name);channels.push_back(indices);
            }
            _subdivision.Reset(_topology,std::clamp(style.refineLevel,0,8),names,channels);
            _drawTopology=_subdivision?_subdivision.Topology(_topology):_topology;
            HdMeshUtil(&_drawTopology,id).ComputeTriangleIndices(&_triangles,&_coarse);
            if (_subdivision) for(auto& param:_coarse)
                param=HdMeshUtil::EncodeCoarseFaceParam(_subdivision.Parents()[HdMeshUtil::DecodeFaceIndexFromCoarseFaceParam(param)],
                                                       HdMeshUtil::DecodeEdgeFlagFromCoarseFaceParam(param));
            _Send("updateIndices", {_state->Buffer(reinterpret_cast<int const*>(_triangles.cdata()), _triangles.size()*3, "Int32Array"),
                                    _state->Buffer(_coarse.cdata(), _coarse.size(), "Int32Array")});
            _points = GetPrimvar(delegate, HdTokens->points).GetWithDefault<VtVec3fArray>();
            _points = _subdivision.Refine(_points,HdInterpolationVertex);
            _Send("updatePoints", {_state->Buffer(reinterpret_cast<float const*>(_points.cdata()), _points.size()*3, "Float32Array")});
            _adjacency.BuildAdjacencyTable(&_drawTopology);
        }
        if (geometryDirty || (*bits & HdChangeTracker::DirtyMaterialId)) _Materials(delegate);

        bool reprFlat=false;
        for(const auto& descriptor:_GetReprDesc(repr))if(descriptor.geomStyle!=HdMeshGeomStyleInvalid)reprFlat|=descriptor.flatShadingEnabled;
        const bool flat = style.flatShadingEnabled || reprFlat;
        const bool smooth = !flat && _topology.GetScheme() != PxOsdOpenSubdivTokens->none &&
                                    _topology.GetScheme() != PxOsdOpenSubdivTokens->bilinear;
        bool authoredNormals = false;
        if (geometryDirty) {
            for (int i = HdInterpolationConstant; i < HdInterpolationCount; ++i) {
                const auto interpolation = HdInterpolation(i);
                for (const auto& descriptor : GetPrimvarDescriptors(delegate, interpolation)) {
                    if (descriptor.name == HdTokens->points) continue;
                    if (descriptor.name == HdTokens->normals && (smooth || flat)) continue;
                    VtIntArray indices;
                    const auto value = descriptor.indexed ? GetIndexedPrimvar(delegate, descriptor.name, &indices)
                                                          : GetPrimvar(delegate, descriptor.name);
                    const bool sent = _Primvar(descriptor.name, value, interpolation, indices);
                    authoredNormals |= sent && descriptor.name == HdTokens->normals;
                }
            }
            if (smooth) {
                const auto normals = Hd_SmoothNormals::ComputeSmoothNormals(&_adjacency, _points.size(), _points.cdata());
                _Send("updateNormals", {_state->Buffer(reinterpret_cast<float const*>(normals.cdata()), normals.size()*3, "Float32Array")});
            } else if (flat || !authoredNormals) {
                VtVec3fArray normals(_triangles.size()*3);
                for (size_t i = 0; i < _triangles.size(); ++i) {
                    const auto& t = _triangles[i];
                    if(t[0]<0 || t[1]<0 || t[2]<0 || size_t(std::max({t[0],t[1],t[2]}))>=_points.size()) continue;
                    GfVec3f normal = GfCross(_points[t[1]]-_points[t[0]], _points[t[2]]-_points[t[0]]);
                    if(normal.Normalize()==0) normal=GfVec3f(0,0,1);
                    for(int corner=0;corner<3;++corner) normals[i*3+corner]=normal;
                }
                _Send("updateOrderedNormals", {_state->Buffer(reinterpret_cast<float const*>(normals.cdata()), normals.size()*3, "Float32Array")});
            }
        }
        if (HdChangeTracker::IsTransformDirty(*bits,id) || HdChangeTracker::IsInstancerDirty(*bits,id)) {
            const auto transform=delegate->GetTransform(id);
            _Send("setTransform", {NeedleMatrix(transform)});
            HdInstancer::_SyncInstancerAndParents(delegate->GetRenderIndex(),GetInstancerId());
            auto* instancer=dynamic_cast<HdNeedleInstancer*>(delegate->GetRenderIndex().GetInstancer(GetInstancerId()));
            const auto matrices=instancer ? instancer->ComputeInstanceTransforms(id) : VtMatrix4dArray();
            std::vector<float> values;
            for(const auto& matrix:matrices) { const auto final=transform*matrix; for(int i=0;i<16;++i)values.push_back(float(final.data()[i])); }
            _Send("setInstanceTransforms", {_state->Buffer(values.data(),values.size(),"Float32Array"),JsValue(int(matrices.size())),JsValue(!GetInstancerId().IsEmpty())});
        }
        _Send("setVisibilityState", {JsValue(IsVisible()),JsValue(delegate->GetRenderTag(id).GetString())});
        _Send("setCullStyle", {JsValue(IsDoubleSided(delegate)),JsValue("dontCare")});
        *bits=HdChangeTracker::Clean;
    }

protected:
    HdDirtyBits _PropagateDirtyBits(HdDirtyBits bits) const override { return bits; }
    void _InitRepr(TfToken const& token, HdDirtyBits*) override {
        for(const auto& repr:_reprs)if(repr.first==token)return;
        _reprs.emplace_back(token,HdReprSharedPtr());
    }

private:
    void _Send(char const* method, JsArray args) { _state->Command("rprim",GetId().GetString(),method,std::move(args)); }

    void _Materials(HdSceneDelegate* delegate) {
        const auto material=delegate->GetMaterialId(GetId()).GetString();
        std::map<int,std::string> faceMaterials;
        for(const auto& subset:_topology.GetGeomSubsets()) {
            if(subset.materialId.IsEmpty())continue;
            for(int face:subset.indices)faceMaterials[face]=subset.materialId.GetString();
        }
        if(faceMaterials.empty()) {
            _Send("setGeomSubsetMaterial", {JsValue(JsArray())});
            _Send("setMaterial", {JsValue(material)});return;
        }
        JsArray sections;
        std::string previousMaterial;
        int sectionStart=0,sectionLength=0;
        auto flush=[&] {
            if(sectionLength)sections.emplace_back(JsObject{{"start",JsValue(sectionStart)},
                {"length",JsValue(sectionLength)},{"materialId",JsValue(previousMaterial)}});
        };
        for(size_t i=0;i<_coarse.size();++i) {
            const auto found=faceMaterials.find(HdMeshUtil::DecodeFaceIndexFromCoarseFaceParam(_coarse[i]));
            const auto& binding=found==faceMaterials.end()?material:found->second;
            if(sectionLength&&binding==previousMaterial)sectionLength+=3;
            else {flush();previousMaterial=binding;sectionStart=int(i*3);sectionLength=3;}
        }
        flush();
        _Send("setGeomSubsetMaterial", {JsValue(sections)});
    }

    template<class T, int Components> bool _NumericPrimvar(TfToken const& name, VtArray<T> values,
                                                          HdInterpolation interpolation, VtIntArray const& indices) {
        if(_subdivision && interpolation==HdInterpolationFaceVarying) {
            values=_subdivision.Refine(values,interpolation,name);
        } else if(!indices.empty()) {
            VtArray<T> expanded(indices.size());
            for(size_t i=0;i<indices.size();++i)if(indices[i]>=0&&size_t(indices[i])<values.size())expanded[i]=values[indices[i]];
            values.swap(expanded);
        }
        if(_subdivision && (interpolation==HdInterpolationVertex || interpolation==HdInterpolationVarying))
            values=_subdivision.Refine(values,interpolation,name);
        if(interpolation==HdInterpolationUniform) {
            VtArray<T> expanded(_coarse.size()*3);
            for(size_t i=0;i<_coarse.size();++i) {
                const int face=HdMeshUtil::DecodeFaceIndexFromCoarseFaceParam(_coarse[i]);
                if(face<0||size_t(face)>=values.size())continue;
                for(int corner=0;corner<3;++corner)expanded[i*3+corner]=values[face];
            }
            values.swap(expanded);interpolation=HdInterpolationFaceVarying;
        } else if(interpolation==HdInterpolationFaceVarying) {
            VtValue triangulated;
            HdVtBufferSource source(name,VtValue(values));
            const auto result=HdMeshUtil(&_drawTopology,GetId()).ComputeTriangulatedFaceVaryingPrimvar(
                source.GetData(),source.GetNumElements(),source.GetTupleType().type,&triangulated);
#if PXR_VERSION >= 2605
            if(result==HdMeshComputationResult::Error)return false;
            if(result==HdMeshComputationResult::Success)values=triangulated.Get<VtArray<T>>();
#else
            if(!result)return false;
            values=triangulated.Get<VtArray<T>>();
#endif
        }
        static char const* labels[]={"constant","uniform","varying","vertex","facevarying","instance"};
        if constexpr(std::is_same_v<T,int>) {
            _Send("updatePrimvar",{JsValue(name.GetString()),_state->Buffer(values.cdata(),values.size(),"Int32Array"),JsValue(Components),JsValue(labels[interpolation])});
        } else {
            _Send("updatePrimvar",{JsValue(name.GetString()),_state->Buffer(reinterpret_cast<float const*>(values.cdata()),values.size()*Components,"Float32Array"),JsValue(Components),JsValue(labels[interpolation])});
        }
        return true;
    }

    bool _Primvar(TfToken const& name,VtValue const& value,HdInterpolation interpolation,VtIntArray const& indices) {
#define NUMERIC(T,N) if(value.CanCast<VtArray<T>>())return _NumericPrimvar<T,N>(name,VtValue::Cast<VtArray<T>>(value).Get<VtArray<T>>(),interpolation,indices);
        NUMERIC(float,1) NUMERIC(int,1) NUMERIC(GfVec2f,2) NUMERIC(GfVec3f,3) NUMERIC(GfVec4f,4)
#undef NUMERIC
        return false;
    }
    std::shared_ptr<NeedleTransport> _state;
    HdMeshTopology _topology,_drawTopology;
    NeedleSubdivision _subdivision;
    Hd_VertexAdjacency _adjacency;
    VtVec3iArray _triangles;
    VtIntArray _coarse;
    VtVec3fArray _points;
};
