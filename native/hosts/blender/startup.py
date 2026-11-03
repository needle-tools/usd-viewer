"""Register the checkout's renderer in this Blender session."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import needle_hydra
needle_hydra.register()
