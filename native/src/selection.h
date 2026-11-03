// Adapt the host's standard generic colorize task to the selection tracker it
// ships with. The task still expects INSTANCE=3 while the tracker emits 4, and
// it does not invalidate its cache when highlighting parameters change.
// Scope the compatibility adapter to this task; other host tasks retain the
// original tracker and encoding. Color stays on the GPU throughout.
class NeedleSelectionTracker final : public HdxSelectionTracker {
public:
    explicit NeedleSelectionTracker(HdxSelectionTrackerSharedPtr source):source(std::move(source)){}
    void Invalidate(){_IncrementVersion();}
    void UpdateSelection(HdRenderIndex* index) override {
        source->UpdateSelection(index);
        const auto version=source->GetVersion();
        if(version!=_sourceVersion){_sourceVersion=version;Invalidate();}
    }
    bool GetSelectionOffsetBuffer(HdRenderIndex const* index,bool select,bool locate,VtIntArray* offsets) const override {
        const bool result=source->GetSelectionOffsetBuffer(index,select,locate,offsets);
        auto& data=*offsets;
        std::set<int> visited;
        std::function<void(int,bool)> visit=[&](int offset,bool subprim) {
            if(offset<=0||size_t(offset+2)>=data.size()||!visited.insert(offset).second)return;
            const int header=subprim?3:2;
            const int count=data[offset+header-1]-data[offset+header-2];
            if(count<0||size_t(offset+header+count)>data.size())return;
            if(subprim) {
                if(data[offset]==4)data[offset]=3; // INSTANCE
                else if(data[offset]==3)data[offset]=5; // POINT: no pointId input in this host task
            }
            for(int i=0;i<count;++i)visit(data[offset+header+i]>>1,true);
        };
        if(!data.empty())for(int mode=0;mode<data[0]&&size_t(mode+1)<data.size();++mode)visit(data[mode+1],false);
        return result;
    }
    HdxSelectionTrackerSharedPtr source;
private:
    int _sourceVersion=-1;
};

class NeedleSelectionTask final : public HdxColorizeSelectionTask {
public:
    NeedleSelectionTask(HdSceneDelegate* delegate,SdfPath const& id)
        :HdxColorizeSelectionTask(delegate,id){}
    void Prepare(HdTaskContext* context,HdRenderIndex* index) override {
        HdxSelectionTrackerSharedPtr tracker;
        if(!_GetTaskContextData(context,HdxTokens->selectionState,&tracker)||!tracker){HdxColorizeSelectionTask::Prepare(context,index);return;}
        if(!_tracker||_tracker->source!=tracker)_tracker=std::make_shared<NeedleSelectionTracker>(tracker);
        if(_invalidate){_tracker->Invalidate();_invalidate=false;}
        (*context)[HdxTokens->selectionState]=VtValue(HdxSelectionTrackerSharedPtr(_tracker));
        HdxColorizeSelectionTask::Prepare(context,index);
        (*context)[HdxTokens->selectionState]=VtValue(tracker);
    }
protected:
    void _Sync(HdSceneDelegate* delegate,HdTaskContext* context,HdDirtyBits* bits) override {
        _invalidate|=(*bits&HdChangeTracker::DirtyParams)!=0;
        HdxColorizeSelectionTask::_Sync(delegate,context,bits);
    }
private:
    bool _invalidate=true;
    std::shared_ptr<NeedleSelectionTracker> _tracker;
};

class NeedleSelectionSceneIndex final : public HdSingleInputFilteringSceneIndexBase {
public:
    static HdSceneIndexBaseRefPtr New(HdSceneIndexBaseRefPtr const& input) {
        return TfCreateRefPtr(new NeedleSelectionSceneIndex(input));
    }
    HdSceneIndexPrim GetPrim(SdfPath const& path) const override {
        auto prim=_GetInputSceneIndex()->GetPrim(path);
        const auto task=HdLegacyTaskSchema::GetFromParent(prim.dataSource);
        const auto parameters=task.GetParameters();
        if(parameters&&parameters->GetValue(0).IsHolding<HdxColorizeSelectionTaskParams>()) {
            static const auto factory=HdRetainedTypedSampledDataSource<HdLegacyTaskFactorySharedPtr>::New(
                HdMakeLegacyTaskFactory<NeedleSelectionTask>());
            prim.dataSource=HdOverlayContainerDataSource::New(
                HdRetainedContainerDataSource::New(HdLegacyTaskSchema::GetSchemaToken(),
                    HdLegacyTaskSchema::Builder().SetFactory(factory).Build()),prim.dataSource);
        }
        return prim;
    }
    SdfPathVector GetChildPrimPaths(SdfPath const& path) const override {
        return _GetInputSceneIndex()->GetChildPrimPaths(path);
    }
protected:
    explicit NeedleSelectionSceneIndex(HdSceneIndexBaseRefPtr const& input)
        :HdSingleInputFilteringSceneIndexBase(input){}
    void _PrimsAdded(HdSceneIndexBase const&,HdSceneIndexObserver::AddedPrimEntries const& entries) override {_SendPrimsAdded(entries);}
    void _PrimsRemoved(HdSceneIndexBase const&,HdSceneIndexObserver::RemovedPrimEntries const& entries) override {_SendPrimsRemoved(entries);}
    void _PrimsDirtied(HdSceneIndexBase const&,HdSceneIndexObserver::DirtiedPrimEntries const& entries) override {_SendPrimsDirtied(entries);}
};
