// TEMPORARY OPENUSD WORKAROUND -- keep separate from the picking attribute fix.
// Source fixes on OpenUSD fix/animated-subdivision-invalidation:
// a0fb2ef5c (USD imaging scene indices), 8e3c3cee7 (legacy imaging delegate)
// (in the sibling OpenUSD repository; upstream PR pending).
//
// Remove when every supported host SDK passes testUsdImagingSubdivisionTags
// and testUsdImagingSubdivisionTagsLegacyDelegate without this filter, and
// native/tests/animated-subdivision.py still passes
// with the filter bypassed. Delete this header, its include and schema-only
// includes in plugin.mm, and pass implicit directly to NeedleSelectionSceneIndex.
// Keep the picking fix and animation regression tests: they cover distinct bugs.
//
// Some host USD versions omit time-varying notifications for crease/corner
// tags (the legacy mesh adapter and the Hydra 2 USD data source have separate
// gaps). Compare their Hydra values when sceneGlobals.currentFrame changes.
// This compatibility filter never opens a USD stage or polls on redraws, and
// only emits missing invalidation when the actual tag arrays changed.
class NeedleSubdivisionSceneIndex final : public HdSingleInputFilteringSceneIndexBase {
public:
    static HdSceneIndexBaseRefPtr New(HdSceneIndexBaseRefPtr const& input) {
        return TfCreateRefPtr(new NeedleSubdivisionSceneIndex(input));
    }
    HdSceneIndexPrim GetPrim(SdfPath const& path) const override {return _GetInputSceneIndex()->GetPrim(path);}
    SdfPathVector GetChildPrimPaths(SdfPath const& path) const override {return _GetInputSceneIndex()->GetChildPrimPaths(path);}
protected:
    explicit NeedleSubdivisionSceneIndex(HdSceneIndexBaseRefPtr const& input):HdSingleInputFilteringSceneIndexBase(input) {
        SdfPathVector pending{SdfPath::AbsoluteRootPath()};
        while(!pending.empty()) {
            const auto path=pending.back();pending.pop_back();_Record(path);
            const auto children=input->GetChildPrimPaths(path);
            pending.insert(pending.end(),children.begin(),children.end());
        }
    }
    void _PrimsAdded(HdSceneIndexBase const&,HdSceneIndexObserver::AddedPrimEntries const& entries) override {
        for(const auto& entry:entries)_Record(entry.primPath);
        _SendPrimsAdded(entries);
    }
    void _PrimsRemoved(HdSceneIndexBase const&,HdSceneIndexObserver::RemovedPrimEntries const& entries) override {
        for(const auto& entry:entries) {
            auto it=_tags.lower_bound(entry.primPath);
            while(it!=_tags.end()&&it->first.HasPrefix(entry.primPath))it=_tags.erase(it);
        }
        _SendPrimsRemoved(entries);
    }
    void _PrimsDirtied(HdSceneIndexBase const&,HdSceneIndexObserver::DirtiedPrimEntries const& entries) override {
        bool timeDirty=false;
        for(const auto& entry:entries) {
            if(entry.primPath==SdfPath::AbsoluteRootPath()&&
               entry.dirtyLocators.Intersects(HdSceneGlobalsSchema::GetCurrentFrameLocator()))timeDirty=true;
            if(entry.dirtyLocators.Intersects(HdMeshSchema::GetSubdivisionTagsLocator()))_Record(entry.primPath);
        }
        HdSceneIndexObserver::DirtiedPrimEntries changed;
        if(timeDirty)for(auto& entry:_tags) {
            const auto current=_Read(entry.first);
            if(current.values!=entry.second.values) {
                entry.second=current;
                changed.push_back({entry.first,HdDataSourceLocatorSet(HdMeshSchema::GetSubdivisionTagsLocator())});
            }
        }
        _SendPrimsDirtied(entries);
        if(!changed.empty())_SendPrimsDirtied(changed);
    }
private:
    struct Tags {std::array<VtValue,5> values;bool authored=false;};
    Tags _Read(SdfPath const& path,bool discoverVariability=false) const {
        Tags result;
        const auto prim=_GetInputSceneIndex()->GetPrim(path);
        if(prim.primType!=HdPrimTypeTokens->mesh)return result;
        const auto container=HdMeshSchema::GetFromParent(prim.dataSource).GetSubdivisionTags().GetContainer();
        if(!container)return result;
        const std::array<TfToken,5> names{HdSubdivisionTagsSchemaTokens->creaseIndices,HdSubdivisionTagsSchemaTokens->creaseLengths,
            HdSubdivisionTagsSchemaTokens->creaseSharpnesses,HdSubdivisionTagsSchemaTokens->cornerIndices,HdSubdivisionTagsSchemaTokens->cornerSharpnesses};
        for(size_t i=0;i<names.size();++i)if(const auto source=HdSampledDataSource::Cast(container->Get(names[i]))) {
            result.values[i]=source->GetValue(0);
            std::vector<HdSampledDataSource::Time> samples;
            result.authored|=(result.values[i].IsArrayValued()&&result.values[i].GetArraySize()>0)||
                (discoverVariability&&source->GetContributingSampleTimesForInterval(0,1,&samples));
        }
        return result;
    }
    void _Record(SdfPath const& path) {
        const auto tags=_Read(path,true);
        if(tags.authored)_tags[path]=tags;else _tags.erase(path);
    }
    std::map<SdfPath,Tags> _tags;
};
