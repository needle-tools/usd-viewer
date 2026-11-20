/** Preserve authored body dynamics without requiring a particular USD physics backend. */
export async function readBodyMetadata(handle, snapshot) {
	await handle.readStage(async stage => {
		for (const body of snapshot.bodies || []) {
			const prim = stage.GetPrimAtPath(body.path);
			try {
				for (const field of ['linearDamping', 'angularDamping', 'disableGravity', 'enableCCD']) {
					const attribute = prim.GetAttribute(`physxRigidBody:${field}`);
					try {
						if (!attribute.IsValid() || !attribute.HasAuthoredValueOpinion()) continue;
						const value = await attribute.Get(handle.getTime());
						if(field==='disableGravity'&&typeof value==='boolean')body.gravityScale=value?0:1;
						else if(field==='enableCCD'&&typeof value==='boolean')body.continuousCollision=value;
						else if (['linearDamping','angularDamping'].includes(field) && typeof value === 'number' && Number.isFinite(value) && value >= 0) body[field] = value;
					} finally { attribute.delete(); }
				}
			} finally { prim.delete(); }
		}
	});
}
