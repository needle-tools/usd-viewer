
import { getUsdModule } from '@needle-tools/usd';


getUsdModule({
  //Wwe need to override where the initial module is loaded from, 
  // since after bundling we can't rely on paths anymore
  mainScriptUrlOrBlob: "../emHdBindings.js",
}).then(async (Usd: any) => {
  console.log(Usd)
  
  // Put a simple USDZ file into the virtual file system so USD can access it
  const blob = await fetch("test.usdz");
  const arrayBuffer = await blob.arrayBuffer();

  // Create a file in the virtual file system
  Usd.FS_createDataFile("", "test.usdz", new Uint8Array(arrayBuffer), true, true, true);

  // This is a complete Hydra render delegate.
  // It doesn't do anything useful, but it logs out all the calls and arguments it receives. 
//   const delegate = {
//     createSPrim: (...args) => {
//       console.log("createSPrim", args);
//       return {
//         updateNode: (...args) => {
//           console.log("updateNode", args);
//         },
//         updateFinished: (...args) => {
//           console.log("updateFinished", args);
//         },
//       }
//     },
//     createRPrim: (...args) => {
//       console.log("createRPrim", args);
//       return {
//         setMaterial(...args) {
//           console.log("setMaterial", args);
//         },
//         updatePoints(...args) {
//           console.log("updatePoints", args);
//         },
//         updateIndices(...args) {
//           console.log("updateIndices", args);
//         },
//         updateNormals(...args) {
//           console.log("updateNormals", args);
//         },
//         setTransform(...args) {
//           console.log("setTransform", args);
//         },
//         updatePrimvar(...args) {
//           console.log("updatePrimvar", args);
//         },
//         skelDetected(...args) {
//           console.log("skelDetected", args);
//         },
//         setGeomSubsetMaterial(...args) {
//           console.log("setGeomSubsetMaterial", args);
//         },
//       }
//     },
//     CommitResources(...args) {
//       console.log("CommitResources", args);
//     },
//   }

//   let driver = new Usd.HdWebSyncDriver(delegate, "test.usdz");
//   if (driver instanceof Promise) driver = await driver;

//   // This kicks off asynchronous tasks to look at everything that has changed – _SyncAll –
//   // which will then call into the delegate to create and update the scene graph.
//   driver.Draw();
})
