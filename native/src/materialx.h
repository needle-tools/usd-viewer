// Serialize Hydra material networks, never consult the host's USD stage.
// This uses the same resolver-backed libraries as the wasm imaging bridge.
inline void NeedleMaterialX(HdMaterialNetworkMap const& source, SdfPath const& id,
                            std::shared_ptr<NeedleTransport> const& state) {
    auto network=HdConvertToHdMaterialNetwork2(source);
    MaterialX::DocumentPtr libraries;
    for(auto const& terminal:network.terminals) {
        const auto node=network.nodes.find(terminal.second.upstreamNode);
        if(node==network.nodes.end()||node->second.nodeTypeId==TfToken("UsdPreviewSurface"))continue;
        try {
            if(!libraries)libraries=HdEmscriptenMaterialXLibraries(network);
            auto document=HdMtlxCreateMtlxDocumentFromHdNetwork(network,node->second,
                terminal.second.upstreamNode,id,libraries);
            if(!document)continue;
            MaterialX::XmlWriteOptions options;
            options.elementPredicate=[](MaterialX::ConstElementPtr element){return !element->hasSourceUri();};
            const auto xml=MaterialX::writeToXmlString(document,&options);
            if(xml.empty())continue;
            state->Command("sprim",id.GetString(),"updateMaterialXDocument",{JsValue(JsObject{
                {"terminal",JsValue(terminal.first.GetString())},
                {"terminalNodePath",JsValue(terminal.second.upstreamNode.GetString())},
                {"terminalOutputName",JsValue(terminal.second.upstreamOutputName.GetString())},
                {"xml",JsValue(xml)}})});
        } catch(std::exception const& error) {
            TF_WARN("Needle MaterialX <%s>: %s",id.GetText(),error.what());
        }
    }
}
