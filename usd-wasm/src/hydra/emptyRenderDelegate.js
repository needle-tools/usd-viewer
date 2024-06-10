// This is a complete Hydra render delegate.
// It doesn't do anything useful, but it logs out all the calls and arguments it receives. 
const delegate = {
    createSPrim: (...args) => {
        console.log("createSPrim", args);
        return {
        updateNode: (...args) => {
            console.log("updateNode", args);
        },
        updateFinished: (...args) => {
            console.log("updateFinished", args);
        },
        }
    },
    createRPrim: (...args) => {
        console.log("createRPrim", args);
        return {
        setMaterial(...args) {
            console.log("setMaterial", args);
        },
        updatePoints(...args) {
            console.log("updatePoints", args);
        },
        updateIndices(...args) {
            console.log("updateIndices", args);
        },
        updateNormals(...args) {
            console.log("updateNormals", args);
        },
        setTransform(...args) {
            console.log("setTransform", args);
        },
        updatePrimvar(...args) {
            console.log("updatePrimvar", args);
        },
        skelDetected(...args) {
            console.log("skelDetected", args);
        },
        setGeomSubsetMaterial(...args) {
            console.log("setGeomSubsetMaterial", args);
        },
        }
    },
    CommitResources(...args) {
        console.log("CommitResources", args);
    },
}