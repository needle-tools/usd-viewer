// OpenUSD's own refiner factory preserves USD schemes, holes, creases and
// boundary interpolation. Only the resulting mesh crosses the native bridge.
class NeedleSubdivision {
public:
    void Reset(HdMeshTopology const& topology,int level,
               std::vector<TfToken> const& names,std::vector<VtIntArray> const& channels) {
        _refiner.reset();_channels.clear();_parents.clear();_counts.clear();_indices.clear();
        if(level<=0||topology.GetScheme()==PxOsdOpenSubdivTokens->none)return;
        const PxOsdMeshTopology source(topology.GetScheme(),topology.GetOrientation(),
            topology.GetFaceVertexCounts(),topology.GetFaceVertexIndices(),topology.GetHoleIndices(),topology.GetSubdivTags());
        _refiner=PxOsdRefinerFactory::Create(source,channels);
        if(!_refiner)return;
        for(size_t i=0;i<names.size();++i)_channels[names[i]]=int(i);
        OpenSubdiv::Far::TopologyRefiner::UniformOptions options(level);
        options.fullTopologyInLastLevel=true;
        _refiner->RefineUniform(options);
        const auto& last=_refiner->GetLevel(level);
        for(int face=0;face<last.GetNumFaces();++face) {
            int parent=face;
            for(int l=level;l>0;--l)parent=_refiner->GetLevel(l).GetFaceParentFace(parent);
            _parents.push_back(parent);
            const auto vertices=last.GetFaceVertices(face);
            _counts.push_back(vertices.size());
            for(int vertex:vertices)_indices.push_back(vertex);
        }
    }
    explicit operator bool() const{return bool(_refiner);}
    VtIntArray const& Parents() const{return _parents;}
    HdMeshTopology Topology(HdMeshTopology const& source) const {
        VtIntArray holes;
        const auto& last=_refiner->GetLevel(_refiner->GetMaxLevel());
        for(int face=0;face<last.GetNumFaces();++face)if(last.IsFaceHole(face))holes.push_back(face);
        return HdMeshTopology(source.GetScheme(),source.GetOrientation(),_counts,_indices,holes);
    }
    template<class T> struct Value {
        T value{};
        void Clear(){value=T(0);}
        void AddWithWeight(Value const& source,float weight){value+=source.value*weight;}
    };
    template<class T> VtArray<T> Refine(VtArray<T> const& source,HdInterpolation interpolation,TfToken const& name=TfToken()) const {
        if(!_refiner||interpolation==HdInterpolationConstant)return source;
        const auto channel=_channels.find(name);
        if(interpolation==HdInterpolationFaceVarying&&channel==_channels.end())return source;
        std::vector<Value<T>> values(source.size());
        for(size_t i=0;i<source.size();++i)values[i].value=source[i];
        OpenSubdiv::Far::PrimvarRefiner refiner(*_refiner);
        for(int level=1;level<=_refiner->GetMaxLevel();++level) {
            const auto& previous=_refiner->GetLevel(level-1);
            const auto& next=_refiner->GetLevel(level);
            const int expected=interpolation==HdInterpolationFaceVarying?previous.GetNumFVarValues(channel->second):
                interpolation==HdInterpolationUniform?previous.GetNumFaces():previous.GetNumVertices();
            if(values.size()<size_t(expected))return {};
            const int count=interpolation==HdInterpolationFaceVarying?next.GetNumFVarValues(channel->second):
                interpolation==HdInterpolationUniform?next.GetNumFaces():next.GetNumVertices();
            std::vector<Value<T>> refined(count);
            if(interpolation==HdInterpolationFaceVarying)refiner.InterpolateFaceVarying(level,values,refined,channel->second);
            else if(interpolation==HdInterpolationVarying)refiner.InterpolateVarying(level,values,refined);
            else if(interpolation==HdInterpolationUniform){
                for(int face=0;face<count;++face)refined[face]=values[next.GetFaceParentFace(face)];
            } else refiner.Interpolate(level,values,refined);
            values.swap(refined);
        }
        VtArray<T> result;
        if(interpolation==HdInterpolationFaceVarying) {
            const auto& last=_refiner->GetLevel(_refiner->GetMaxLevel());
            for(int face=0;face<last.GetNumFaces();++face)
                for(int index:last.GetFaceFVarValues(face,channel->second))result.push_back(values[index].value);
        } else {
            result.resize(values.size());
            for(size_t i=0;i<values.size();++i)result[i]=values[i].value;
        }
        return result;
    }
private:
    PxOsdTopologyRefinerSharedPtr _refiner;
    std::map<TfToken,int> _channels;
    VtIntArray _parents,_counts,_indices;
};
