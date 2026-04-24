# PyInstaller spec — run from `engine/`: pyinstaller cash_cat_engine.spec
# Requires: pip install -r requirements-prod.txt pyinstaller
import os

from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None
root = os.path.dirname(os.path.abspath(SPEC))

datas = [
    (os.path.join(root, "cash_cat", "migrations"), "cash_cat/migrations"),
]
binaries = []
hiddenimports = collect_submodules("cash_cat")

for pkg in (
    "uvicorn",
    "fastapi",
    "starlette",
    "pydantic",
    "anyio",
    "httpx",
    "multipart",
):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

a = Analysis(
    [os.path.join(root, "run_cash_cat_engine.py")],
    pathex=[root],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="cash-cat-engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
